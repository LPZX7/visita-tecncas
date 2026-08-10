const crypto = require('crypto');
const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { sendMail } = require('../lib/mailer');
const { generateVisitReportPdf } = require('../lib/visitReportPdf');
const { generateTermoConclusaoPdf } = require('../lib/termoConclusaoPdf');
const { scopeRequestsForClient, isEquipmentAllowedForClient } = require('../lib/scoping');
const { pushChamadoToMilvus } = require('../lib/milvusSync');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';
const TERMO_VERSAO = '1.0';

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    const requests = await db.getRequests();
    if (user.role === 'cliente') {
      const equipments = await db.getEquipments();
      return res.json(scopeRequestsForClient(requests, equipments, user));
    }
    res.json(requests);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('cliente', 'analista', 'gestor'), async (req, res, next) => {
  try {
    const { equipamento_id, descricao, urgencia, endereco } = req.body;
    let empresa_id = req.body.empresa_id;

    if (req.user.role === 'cliente') {
      if (!req.user.empresa_id) {
        return res.status(403).json({ error: 'Sua conta ainda não está vinculada a uma empresa. Aguarde o contato do gestor.' });
      }
      empresa_id = req.user.empresa_id;
    }

    if (!empresa_id || !equipamento_id || !descricao) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const equipment = await db.getEquipmentById(equipamento_id);
    if (!equipment || equipment.empresa_id !== empresa_id) {
      return res.status(400).json({ error: 'Equipamento inválido para esta empresa' });
    }
    if (req.user.role === 'cliente' && !isEquipmentAllowedForClient(equipment, req.user)) {
      return res.status(400).json({ error: 'Equipamento inválido para sua filial/sede' });
    }

    const request = {
      empresa_id,
      equipamento_id,
      descricao,
      urgencia: urgencia || 'Normal',
      endereco: endereco || '',
      aberto_por: req.user.sub
    };

    const created = await db.createRequest(request);

    const company = await db.getCompanyById(empresa_id);
    if (company?.email) {
      sendMail({
        to: company.email,
        subject: `Chamado aberto — ${created.descricao}`,
        text: `Olá,\n\nSeu chamado foi registrado com sucesso.\n\nDescrição: ${created.descricao}\nUrgência: ${created.urgencia}\nStatus: ${created.status}\n\nVocê pode acompanhar o atendimento pelo portal Mirontec.`
      });
    }
    await db.createNotification({
      empresa_id,
      titulo: `Chamado #${created.numero} aberto`,
      mensagem: created.descricao,
      link: '/requests'
    });

    pushChamadoToMilvus(created, company, {
      email: req.user.email || company?.email,
      contato: req.user.name
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const STAFF_STATUSES = ['Aberta', 'Agendada', 'Em Atendimento', 'Concluída', 'Cancelada'];
const TECH_STATUSES = ['Em Atendimento', 'Concluída'];

router.patch('/:id', requireRole('tecnico', 'analista', 'gestor'), async (req, res, next) => {
  try {
    const request = await db.getRequestById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    const { status, assigned_technician, agendado_para, relatorio_visita } = req.body;
    const patch = {};

    const jaTemAceite = await db.getVisitaAceiteByRequestId(request.id);
    if (jaTemAceite && (relatorio_visita !== undefined || assigned_technician !== undefined || agendado_para !== undefined)) {
      return res.status(409).json({ error: 'Esta visita já tem um termo de conclusão assinado pelo cliente — os dados do atendimento não podem ser alterados diretamente. Fale com o desenvolvedor do sistema se precisar corrigir algo.' });
    }

    if (req.user.role === 'tecnico') {
      if (request.assigned_technician !== req.user.sub) {
        return res.status(403).json({ error: 'Você não está atribuído a este chamado' });
      }
      if (status !== undefined) {
        if (!TECH_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Status não permitido para técnico' });
        }
        if (status === 'Concluída' && !request.hora_checkin) {
          return res.status(400).json({ error: 'Faça o check-in antes de concluir a visita' });
        }
        if (status === 'Concluída' && !(relatorio_visita || '').trim()) {
          return res.status(400).json({ error: 'Relatório da visita é obrigatório para concluir o chamado' });
        }
        patch.status = status;
        if (status === 'Em Atendimento' && !request.hora_checkin) {
          patch.hora_checkin = new Date().toISOString();
        }
        if (status === 'Concluída') {
          patch.hora_checkout = new Date().toISOString();
          patch.relatorio_visita = relatorio_visita.trim();
        }
      }
    } else {
      if (status !== undefined) {
        if (!STAFF_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Status inválido' });
        }
        patch.status = status;
      }
      if (assigned_technician !== undefined) {
        if (assigned_technician) {
          const tech = await db.getUserById(assigned_technician);
          if (!tech || tech.role !== 'tecnico') {
            return res.status(400).json({ error: 'Técnico inválido' });
          }
        }
        patch.assigned_technician = assigned_technician || null;
      }
      if (agendado_para !== undefined) {
        patch.agendado_para = agendado_para || null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const updated = await db.updateRequest(request.id, patch);

    if (patch.status) {
      const company = await db.getCompanyById(updated.empresa_id);
      if (company?.email) {
        sendMail({
          to: company.email,
          subject: `Atualização do chamado — ${updated.status}`,
          text: `O status do seu chamado "${updated.descricao}" foi atualizado para: ${updated.status}.`
        });
      }
      await db.createNotification({
        empresa_id: updated.empresa_id,
        titulo: `Chamado #${updated.numero} atualizado`,
        mensagem: `Novo status: ${updated.status}`,
        link: '/requests'
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    const existing = await db.getRequestById(req.params.id);
    const result = await db.deleteRequest(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: existem orçamentos ou contratos vinculados a este chamado' });
    }
    if (!result.deleted) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    await db.logAudit({
      user: req.user,
      acao: 'chamado_excluido',
      entidade: 'request',
      entidade_id: req.params.id,
      detalhes: existing ? `Chamado #${existing.numero} — ${existing.descricao}` : null
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/avaliacao', requireRole('cliente'), async (req, res, next) => {
  try {
    const request = await db.getRequestById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    if (request.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (request.status !== 'Concluída') {
      return res.status(400).json({ error: 'Só é possível avaliar chamados concluídos' });
    }

    const nota = Number(req.body.avaliacao);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return res.status(400).json({ error: 'Avaliação deve ser um número inteiro de 1 a 5' });
    }

    const updated = await db.updateRequest(request.id, {
      avaliacao: nota,
      avaliacao_comentario: (req.body.comentario || '').trim() || null
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/relatorio-pdf', async (req, res, next) => {
  try {
    const request = await db.getRequestById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    if (req.user.role === 'cliente' && request.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (!request.relatorio_visita) {
      return res.status(400).json({ error: 'Este chamado ainda não tem relatório de visita' });
    }

    const company = await db.getCompanyById(request.empresa_id);
    const equipment = await db.getEquipmentById(request.equipamento_id);
    const technician = request.assigned_technician ? await db.getUserById(request.assigned_technician) : null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-visita.pdf"');

    const doc = generateVisitReportPdf({ request, company, equipment, technician });
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

async function findContractForRequest(requestId) {
  const budgets = (await db.getBudgets()).filter((b) => b.request_id === requestId && b.status === 'Aprovado');
  for (const budget of budgets) {
    const contract = await db.getContractByBudgetId(budget.id);
    if (contract) return contract;
  }
  return null;
}

async function loadTermoContext(req, res) {
  const request = await db.getRequestById(req.params.id);
  if (!request) {
    res.status(404).json({ error: 'Solicitação não encontrada' });
    return null;
  }
  if (req.user.role === 'cliente' && request.empresa_id !== req.user.empresa_id) {
    res.status(403).json({ error: 'Acesso negado' });
    return null;
  }
  if (!['cliente', 'analista', 'gestor'].includes(req.user.role)) {
    res.status(403).json({ error: 'Acesso negado' });
    return null;
  }
  if (request.status !== 'Concluída') {
    res.status(400).json({ error: 'Só é possível gerar o termo de conclusão para visitas já concluídas' });
    return null;
  }

  const company = await db.getCompanyById(request.empresa_id);
  const unit = request.unidade_id ? await db.getUnitById(request.unidade_id) : null;
  const technician = request.assigned_technician ? await db.getUserById(request.assigned_technician) : null;
  const contract = await findContractForRequest(request.id);

  return { request, company, unit, technician, contract };
}

router.get('/:id/termo-conclusao', async (req, res, next) => {
  try {
    const ctx = await loadTermoContext(req, res);
    if (!ctx) return;
    const { request, company, unit, technician, contract } = ctx;

    const aceite = await db.getVisitaAceiteByRequestId(request.id);

    res.json({
      visita: {
        numero: request.numero,
        descricao: request.descricao,
        relatorio_visita: request.relatorio_visita,
        hora_checkin: request.hora_checkin,
        hora_checkout: request.hora_checkout,
        endereco: request.endereco
      },
      contrato: contract ? { numero: contract.numero, valor_total: contract.valor_total } : null,
      empresa: company ? { razao_social: company.razao_social } : null,
      unidade: unit ? { tipo: unit.tipo, nome: unit.nome } : null,
      tecnico: technician ? { nome: technician.nome } : null,
      versao_termo: TERMO_VERSAO,
      ja_aceito: !!aceite,
      aceite: aceite ? {
        nome_aceitante: aceite.nome_aceitante,
        criado_em: aceite.criado_em,
        codigo_validacao: aceite.codigo_validacao
      } : null
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/termo-conclusao', requireRole('cliente'), async (req, res, next) => {
  try {
    const ctx = await loadTermoContext(req, res);
    if (!ctx) return;
    const { request, company, unit, technician, contract } = ctx;

    const existing = await db.getVisitaAceiteByRequestId(request.id);
    if (existing) {
      return res.status(409).json({ error: 'Esta visita já possui um termo de conclusão assinado.' });
    }

    const { nome, documento, cargo, email, telefone, confirmaDados, aceitaTermo } = req.body;
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ error: 'Informe o nome completo do aceitante' });
    }
    if (!confirmaDados) {
      return res.status(400).json({ error: 'É necessário confirmar que os dados informados estão corretos' });
    }
    if (!aceitaTermo) {
      return res.status(400).json({ error: 'É necessário ler e concordar com o termo de conclusão' });
    }

    const snapshot = {
      visita: {
        numero: request.numero,
        descricao: request.descricao,
        relatorio_visita: request.relatorio_visita,
        hora_checkin: request.hora_checkin,
        hora_checkout: request.hora_checkout,
        endereco: request.endereco
      },
      contrato: contract ? { numero: contract.numero, valor_total: contract.valor_total } : null,
      empresa: company ? { razao_social: company.razao_social } : null,
      unidade: unit ? { tipo: unit.tipo, nome: unit.nome } : null,
      tecnico: technician ? { nome: technician.nome } : null,
      aceitante: {
        nome: nome.trim(),
        documento: (documento || '').trim(),
        cargo: (cargo || '').trim(),
        email: (email || '').trim(),
        telefone: (telefone || '').trim()
      },
      versao_termo: TERMO_VERSAO,
      declaracao: 'Declaro que acompanhei e/ou estou autorizado a representar o contratante para confirmar a conclusão do serviço descrito acima. Declaro ainda que as informações apresentadas correspondem ao atendimento realizado nesta visita técnica.'
    };

    const snapshotJson = JSON.stringify(snapshot);
    const hash = crypto.createHash('sha256').update(snapshotJson).digest('hex');
    const codigo = `VT-${request.numero}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const aceite = await db.createVisitaAceite({
      request_id: request.id,
      contrato_id: contract?.id || null,
      nome_aceitante: nome.trim(),
      documento_aceitante: (documento || '').trim() || null,
      cargo_aceitante: (cargo || '').trim() || null,
      email_aceitante: (email || '').trim() || null,
      telefone_aceitante: (telefone || '').trim() || null,
      ip: req.ip,
      user_agent: req.headers['user-agent'] || null,
      hash_documento: hash,
      codigo_validacao: codigo,
      versao_termo: TERMO_VERSAO,
      snapshot: snapshotJson
    });

    await db.logAudit({
      user: req.user,
      acao: 'termo_conclusao_aceito',
      entidade: 'request',
      entidade_id: request.id,
      detalhes: `Chamado #${request.numero} — termo assinado por ${aceite.nome_aceitante} (código ${codigo})`
    });

    res.status(201).json({
      codigo_validacao: aceite.codigo_validacao,
      criado_em: aceite.criado_em,
      hash_documento: aceite.hash_documento
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/termo-conclusao/pdf', async (req, res, next) => {
  try {
    const ctx = await loadTermoContext(req, res);
    if (!ctx) return;
    const { request, company, unit, technician, contract } = ctx;

    const aceite = await db.getVisitaAceiteByRequestId(request.id);
    if (!aceite) {
      return res.status(400).json({ error: 'Esta visita ainda não tem termo de conclusão assinado' });
    }

    const validationUrl = `${FRONTEND_URL}/validar/${aceite.codigo_validacao}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="termo-conclusao.pdf"');

    const doc = await generateTermoConclusaoPdf({ request, company, unit, technician, contract, aceite, validationUrl });
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
