const crypto = require('crypto');
const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { sendMail, actionEmailHtml } = require('../lib/mailer');
const { generateVisitReportPdf } = require('../lib/visitReportPdf');
const { generateTermoConclusaoPdf } = require('../lib/termoConclusaoPdf');
const { scopeRequestsForClient, isEquipmentAllowedForClient } = require('../lib/scoping');
const { ensureRequestInMilvus, syncRequestAssigneeToMilvus, syncRequestUpdateToMilvus } = require('../lib/milvusSync');
const { buildAutomaticServiceReport, buildCompletionEmail, buildCompletionSummary } = require('../lib/visitCompletion');
const { isValidEmail, resolveContactEmail } = require('../lib/contact');
const { validateVisitExecution } = require('../lib/visitWorkflow');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';
const TERMO_VERSAO = '1.0';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function sendMilvusConfirmationEmail(request, company, equipment, signatureUser) {
  const to = request.solicitante_email;
  if (!to) return;
  const portalUrl = `${FRONTEND_URL}/requests`;
  const details = `Chamado Mirontec: #${request.numero}\nChamado Milvus: #${request.milvus_codigo}\nCliente: ${company?.razao_social || 'não informado'}\nEquipamento: ${equipment ? `${equipment.modelo} — série ${equipment.numero_serie}` : 'não informado'}\nDescrição: ${request.descricao}\nUrgência: ${request.urgencia}\nEndereço: ${request.endereco || 'não informado'}`;
  return sendMail({
    to,
    subject: `Chamado #${request.milvus_codigo} criado no Milvus`,
    text: `Olá,\n\nSeu atendimento foi registrado no portal Mirontec e no Milvus.\n\n${details}\n\nAcompanhe pelo portal: ${portalUrl}`,
    html: actionEmailHtml({
      title: `Chamado registrado no Milvus #${escapeHtml(request.milvus_codigo)}`,
      message: `Seu atendimento foi registrado com sucesso.<br><br><strong>Chamado Mirontec:</strong> #${request.numero}<br><strong>Cliente:</strong> ${escapeHtml(company?.razao_social || 'não informado')}<br><strong>Equipamento:</strong> ${escapeHtml(equipment ? `${equipment.modelo} — série ${equipment.numero_serie}` : 'não informado')}<br><strong>Descrição:</strong> ${escapeHtml(request.descricao)}<br><strong>Urgência:</strong> ${escapeHtml(request.urgencia)}<br><strong>Endereço:</strong> ${escapeHtml(request.endereco || 'não informado')}`,
      buttonLabel: 'Acompanhar chamado',
      buttonUrl: portalUrl,
      footnote: 'Guarde o número do chamado Milvus para facilitar o atendimento.'
    }),
    signatureUser
  });
}

const router = express.Router();
router.use(verifyToken);

async function approvedContextForRequest(requestId) {
  const budgets = await db.getBudgets();
  const approved = budgets.find((budget) => budget.request_id === requestId && budget.status === 'Aprovado');
  if (!approved) return { budget: null, parts: [] };

  const parts = await Promise.all((approved.items || []).map(async (item) => ({
    nome: (await db.getPartById(item.peca_id))?.nome || 'Peça',
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario
  })));
  return { budget: approved, parts };
}

async function attachTechnicalRecords(requests) {
  const completed = requests.filter((request) => request.relatorio_visita);
  if (!completed.length) return requests;

  const requestIds = new Set(completed.map((request) => request.id));
  const budgets = await db.getBudgets();
  const approvedByRequest = new Map();
  for (const budget of budgets) {
    if (budget.status === 'Aprovado' && requestIds.has(budget.request_id) && !approvedByRequest.has(budget.request_id)) {
      approvedByRequest.set(budget.request_id, budget);
    }
  }

  const partIds = new Set();
  for (const budget of approvedByRequest.values()) {
    for (const item of budget.items || []) partIds.add(item.peca_id);
  }
  const technicianIds = new Set(completed.map((request) => request.assigned_technician).filter(Boolean));
  const [partEntries, technicianEntries] = await Promise.all([
    Promise.all([...partIds].map(async (id) => [id, await db.getPartById(id)])),
    Promise.all([...technicianIds].map(async (id) => [id, await db.getUserById(id)]))
  ]);
  const partsById = new Map(partEntries);
  const techniciansById = new Map(technicianEntries);

  return requests.map((request) => {
    if (!request.relatorio_visita) return request;
    const budget = approvedByRequest.get(request.id);
    const approvedParts = (budget?.items || []).map((item) => ({
      nome: partsById.get(item.peca_id)?.nome || 'Peça',
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario
    }));
    const technician = techniciansById.get(request.assigned_technician);
    return {
      ...request,
      registro_tecnico: buildCompletionSummary({ request, approvedParts, technician: technician?.nome })
    };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    const requests = await db.getRequests();
    if (user.role === 'cliente') {
      const equipments = await db.getEquipments();
      const visibleRequests = scopeRequestsForClient(requests, equipments, user);
      return res.json(await attachTechnicalRecords(visibleRequests));
    }
    res.json(await attachTechnicalRecords(requests));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('cliente', 'analista', 'gestor'), async (req, res, next) => {
  try {
    const { equipamento_id, descricao, urgencia, endereco, solicitante_email } = req.body;
    let empresa_id = req.body.empresa_id;

    let requesterUser = null;
    if (req.user.role === 'cliente') {
      if (!req.user.empresa_id) {
        return res.status(403).json({ error: 'Sua conta ainda não está vinculada a uma empresa. Aguarde o contato do gestor.' });
      }
      empresa_id = req.user.empresa_id;

      requesterUser = await db.getUserById(req.user.sub);
      if (!requesterUser?.liberado_para_chamado) {
        return res.status(403).json({ error: 'Fale com o suporte antes de abrir um chamado — sua conta ainda não foi liberada.' });
      }
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

    const company = await db.getCompanyById(empresa_id);
    const unit = equipment.unidade_id ? await db.getUnitById(equipment.unidade_id) : null;
    const actorUser = requesterUser || await db.getUserById(req.user.sub);
    const contactEmail = resolveContactEmail({ provided: solicitante_email, unit, company, user: requesterUser || req.user });
    if (!isValidEmail(contactEmail)) {
      return res.status(400).json({ error: 'Informe um e-mail válido do cliente. Ele é obrigatório para criar e acompanhar o chamado no Milvus.' });
    }
    if (!company.email) {
      await db.updateCompany(company.id, { email: contactEmail });
      company.email = contactEmail;
    }

    const request = {
      empresa_id,
      equipamento_id,
      descricao,
      urgencia: urgencia || 'Normal',
      endereco: endereco || '',
      aberto_por: req.user.sub,
      assigned_analyst: actorUser?.role === 'analista' ? actorUser.id : null,
      solicitante_email: contactEmail
    };

    let created = await db.createRequest(request);
    try {
      created = await ensureRequestInMilvus(created, company, {
        email: contactEmail,
        telefone: unit?.telefone || company.telefone,
        contato: unit?.responsavel || company.responsavel || requesterUser?.nome || req.user.name,
        equipment,
        assignee: actorUser?.role === 'analista' ? actorUser : null
      });
    } catch (err) {
      await db.deleteRequest(created.id);
      if (err.expose) return res.status(err.statusCode || 502).json({ error: err.message });
      throw err;
    }

    if (req.user.role === 'cliente') {
      // Liberação é de uso único — precisa passar pelo suporte de novo pro próximo chamado.
      await db.updateUser(req.user.sub, { liberado_para_chamado: false });
    }

    const emailConfirmationSent = await sendMilvusConfirmationEmail(created, company, equipment, actorUser?.role === 'cliente' ? null : actorUser);
    await db.createNotification({
      empresa_id,
      titulo: `Chamado #${created.numero} aberto`,
      mensagem: created.descricao,
      link: '/requests'
    });
    await db.logAudit({
      user: req.user,
      acao: 'chamado_criado',
      entidade: 'request',
      entidade_id: created.id,
      detalhes: `Chamado #${created.numero} — ${created.descricao}`
    });

    res.status(201).json({ ...created, email_confirmacao_enviado: emailConfirmationSent });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/milvus', requireRole('analista', 'gestor'), async (req, res, next) => {
  try {
    let request = await db.getRequestById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Chamado não encontrado' });

    const company = await db.getCompanyById(request.empresa_id);
    const equipment = await db.getEquipmentById(request.equipamento_id);
    const unit = equipment?.unidade_id ? await db.getUnitById(equipment.unidade_id) : null;
    const actorUser = await db.getUserById(req.user.sub);
    const contactEmail = resolveContactEmail({ provided: req.body.solicitante_email, request, unit, company });
    if (!isValidEmail(contactEmail)) {
      return res.status(400).json({ error: 'Informe um e-mail válido do cliente para criar o chamado no Milvus.' });
    }

    request = await db.updateRequest(request.id, {
      solicitante_email: contactEmail,
      ...(actorUser?.role === 'analista' && !request.assigned_analyst ? { assigned_analyst: actorUser.id } : {})
    });
    if (!company.email) {
      await db.updateCompany(company.id, { email: contactEmail });
      company.email = contactEmail;
    }
    const linked = await ensureRequestInMilvus(request, company, {
      email: contactEmail,
      telefone: unit?.telefone || company.telefone,
      contato: unit?.responsavel || company.responsavel,
      equipment,
      assignee: actorUser?.role === 'analista' ? actorUser : null
    });
    const emailConfirmationSent = await sendMilvusConfirmationEmail(linked, company, equipment, actorUser);
    await db.logAudit({
      user: req.user,
      acao: 'chamado_vinculado_milvus',
      entidade: 'request',
      entidade_id: linked.id,
      detalhes: `Chamado #${linked.numero} vinculado ao Milvus #${linked.milvus_codigo} — contato ${contactEmail}`
    });
    res.json({ ...linked, email_confirmacao_enviado: emailConfirmationSent });
  } catch (err) {
    if (err.expose) return res.status(err.statusCode || 502).json({ error: err.message });
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

    const {
      status,
      assigned_analyst,
      assigned_technician,
      agendado_para,
      relatorio_visita,
      teve_adicional,
      adicional_descricao,
      custo_adicional,
      observacao_final,
      sincronizar_responsaveis_milvus
    } = req.body;
    const patch = {};
    let completionContext = null;

    const executionError = validateVisitExecution(request, status);
    if (executionError) {
      return res.status(409).json({ error: executionError });
    }

    if (status && status !== 'Cancelada' && !request.milvus_codigo) {
      return res.status(409).json({ error: 'Este chamado ainda não está vinculado ao Milvus. Abra os detalhes, informe o e-mail do cliente e crie o ticket antes de continuar.' });
    }

    const jaTemAceite = await db.getVisitaAceiteByRequestId(request.id);
    if (jaTemAceite && (relatorio_visita !== undefined || assigned_analyst !== undefined || assigned_technician !== undefined || agendado_para !== undefined)) {
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
        if (status === 'Concluída' && request.hora_checkout) {
          return res.status(409).json({ error: 'Esta visita já foi finalizada' });
        }
        if (status === 'Concluída' && typeof teve_adicional !== 'boolean') {
          return res.status(400).json({ error: 'Informe se houve peça extra ou custo adicional' });
        }
        if (status === 'Concluída' && teve_adicional && !(adicional_descricao || '').trim()) {
          return res.status(400).json({ error: 'Descreva a peça extra ou o custo adicional' });
        }
        const additionalCost = Number(custo_adicional || 0);
        if (status === 'Concluída' && (!Number.isFinite(additionalCost) || additionalCost < 0)) {
          return res.status(400).json({ error: 'Informe um valor adicional válido' });
        }
        patch.status = status;
        if (status === 'Em Atendimento' && !request.hora_checkin) {
          patch.hora_checkin = new Date().toISOString();
        }
        if (status === 'Concluída') {
          completionContext = await approvedContextForRequest(request.id);
          patch.hora_checkout = new Date().toISOString();
          patch.relatorio_visita = (relatorio_visita || '').trim() || buildAutomaticServiceReport(completionContext.parts);
          patch.teve_adicional = teve_adicional;
          patch.adicional_descricao = teve_adicional ? adicional_descricao.trim() : null;
          patch.custo_adicional = teve_adicional ? additionalCost : 0;
          patch.observacao_final = (observacao_final || '').trim() || null;
        }
      }
    } else {
      if (status !== undefined) {
        if (!STAFF_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Status inválido' });
        }
        patch.status = status;
      }
      if (assigned_analyst !== undefined) {
        if (assigned_analyst) {
          const analyst = await db.getUserById(assigned_analyst);
          if (!analyst || analyst.role !== 'analista' || !analyst.ativo) {
            return res.status(400).json({ error: 'Analista inválido ou inativo' });
          }
          if (!isValidEmail(analyst.milvus_email) || !analyst.milvus_nome?.trim()) {
            return res.status(422).json({ error: `O analista ${analyst.nome} ainda não está vinculado ao Milvus` });
          }
        }
        patch.assigned_analyst = assigned_analyst || null;
      }
      if (assigned_technician !== undefined) {
        if (assigned_technician) {
          const tech = await db.getUserById(assigned_technician);
          if (!tech || tech.role !== 'tecnico' || !tech.ativo) {
            return res.status(400).json({ error: 'Técnico inválido ou inativo' });
          }
          if (!isValidEmail(tech.milvus_email) || !tech.milvus_nome?.trim()) {
            return res.status(422).json({ error: `O técnico ${tech.nome} ainda não está vinculado ao Milvus` });
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

    const assigneeChanged = (
      ('assigned_analyst' in patch && patch.assigned_analyst !== request.assigned_analyst)
      || ('assigned_technician' in patch && patch.assigned_technician !== request.assigned_technician)
    );
    const assigneeSyncRequested = assigneeChanged || sincronizar_responsaveis_milvus === true;
    if (assigneeSyncRequested && req.user.role !== 'tecnico') {
      if (!request.milvus_codigo) {
        return res.status(409).json({ error: 'Vincule o chamado ao Milvus antes de definir os responsáveis' });
      }
      const effectiveAnalystId = 'assigned_analyst' in patch ? patch.assigned_analyst : request.assigned_analyst;
      const effectiveTechnicianId = 'assigned_technician' in patch ? patch.assigned_technician : request.assigned_technician;
      const [analyst, technician] = await Promise.all([
        effectiveAnalystId ? db.getUserById(effectiveAnalystId) : Promise.resolve(null),
        effectiveTechnicianId ? db.getUserById(effectiveTechnicianId) : Promise.resolve(null)
      ]);
      await syncRequestAssigneeToMilvus(request, { analyst, technician });
    }

    const updated = await db.updateRequest(request.id, patch);

    if (patch.status) {
      const company = await db.getCompanyById(updated.empresa_id);
      const signatureUser = updated.assigned_technician
        ? await db.getUserById(updated.assigned_technician)
        : (updated.assigned_analyst ? await db.getUserById(updated.assigned_analyst) : await db.getUserById(req.user.sub));
      const isTechnicalCompletion = patch.status === 'Concluída' && Boolean(patch.hora_checkout);
      const statusEmail = updated.solicitante_email || company?.email;
      if (statusEmail && !isTechnicalCompletion) {
        sendMail({
          to: statusEmail,
          subject: `Atualização do chamado — ${updated.status}`,
          text: `O status do seu chamado "${updated.descricao}" foi atualizado para: ${updated.status}.`,
          signatureUser
        });
      }
      await db.createNotification({
        empresa_id: updated.empresa_id,
        titulo: `Chamado #${updated.numero} atualizado`,
        mensagem: `Novo status: ${updated.status}`,
        link: '/requests'
      });

      if (patch.status === 'Em Atendimento' && patch.hora_checkin) {
        await syncRequestUpdateToMilvus(updated, { tipo: 'checkin', technician: req.user.name });
      } else if (isTechnicalCompletion) {
        const [approvedContext, equipment, technician] = await Promise.all([
          completionContext || approvedContextForRequest(updated.id),
          db.getEquipmentById(updated.equipamento_id),
          updated.assigned_technician ? db.getUserById(updated.assigned_technician) : Promise.resolve(null)
        ]);
        const unit = approvedContext.budget?.unidade_id
          ? await db.getUnitById(approvedContext.budget.unidade_id)
          : null;
        const approvedParts = approvedContext.parts;
        const emailDestino = updated.solicitante_email || company?.email;
        const completionEmail = buildCompletionEmail({
          request: updated,
          company,
          unit,
          equipment,
          technician,
          approvedParts,
          portalUrl: `${FRONTEND_URL}/requests`
        });

        await Promise.all([
          syncRequestUpdateToMilvus(updated, { tipo: 'concluida', approvedParts, technician: technician?.nome }),
          emailDestino
            ? sendMail({ to: emailDestino, subject: completionEmail.subject, text: completionEmail.text, html: completionEmail.html, signatureUser: technician || signatureUser })
            : Promise.resolve()
        ]);

        await db.logAudit({
          user: req.user,
          acao: 'visita_finalizada',
          entidade: 'request',
          entidade_id: updated.id,
          detalhes: `Chamado #${updated.numero} finalizado${updated.teve_adicional ? ` com adicional de R$ ${Number(updated.custo_adicional).toFixed(2)}` : ' sem custo adicional'}${emailDestino ? ` — resumo enviado ao contato do chamado (${emailDestino})` : ' — sem email de destinatário cadastrado'}`
        });
      }
    }

    res.json(updated);
  } catch (err) {
    if (err.expose) return res.status(err.statusCode || 502).json({ error: err.message });
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

router.patch('/:id/aprovacao-visita', requireRole('cliente'), async (req, res, next) => {
  try {
    const request = await db.getRequestById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    if (request.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    return res.status(409).json({
      error: 'A visita é autorizada automaticamente quando o cliente aprova o orçamento. Acesse Orçamentos para revisar e responder.'
    });
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
    const approvedContext = await approvedContextForRequest(request.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-visita.pdf"');

    const doc = generateVisitReportPdf({ request, company, equipment, technician, approvedParts: approvedContext.parts });
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
  const approvedContext = await approvedContextForRequest(request.id);
  const unitId = approvedContext.budget?.unidade_id || request.unidade_id;
  const unit = unitId ? await db.getUnitById(unitId) : null;
  const technician = request.assigned_technician ? await db.getUserById(request.assigned_technician) : null;
  const contract = await findContractForRequest(request.id);

  return { request, company, unit, technician, contract, approvedParts: approvedContext.parts };
}

router.get('/:id/termo-conclusao', async (req, res, next) => {
  try {
    const ctx = await loadTermoContext(req, res);
    if (!ctx) return;
    const { request, company, unit, technician, contract, approvedParts } = ctx;

    const aceite = await db.getVisitaAceiteByRequestId(request.id);

    res.json({
      visita: {
        numero: request.numero,
        descricao: request.descricao,
        relatorio_visita: request.relatorio_visita,
        registro_tecnico: buildCompletionSummary({ request, approvedParts, technician: technician?.nome }),
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
    const { request, company, unit, technician, contract, approvedParts } = ctx;

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
        registro_tecnico: buildCompletionSummary({ request, approvedParts, technician: technician?.nome }),
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
    const { request, company, unit, technician, contract, approvedParts } = ctx;

    const aceite = await db.getVisitaAceiteByRequestId(request.id);
    if (!aceite) {
      return res.status(400).json({ error: 'Esta visita ainda não tem termo de conclusão assinado' });
    }

    const validationUrl = `${FRONTEND_URL}/validar/${aceite.codigo_validacao}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="termo-conclusao.pdf"');

    const doc = await generateTermoConclusaoPdf({ request, company, unit, technician, contract, aceite, validationUrl, approvedParts });
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/termo-conclusao', requireRole('gestor'), async (req, res, next) => {
  try {
    const request = await db.getRequestById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    const aceite = await db.getVisitaAceiteByRequestId(request.id);
    if (!aceite) {
      return res.status(404).json({ error: 'Este chamado não tem termo de conclusão assinado' });
    }
    await db.deleteVisitaAceiteByRequestId(request.id);
    await db.logAudit({
      user: req.user,
      acao: 'termo_conclusao_excluido',
      entidade: 'request',
      entidade_id: request.id,
      detalhes: `Chamado #${request.numero} — termo assinado por ${aceite.nome_aceitante} (código ${aceite.codigo_validacao}) excluído`
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
