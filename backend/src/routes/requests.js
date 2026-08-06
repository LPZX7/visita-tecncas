const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { sendMail } = require('../lib/mailer');
const { generateVisitReportPdf } = require('../lib/visitReportPdf');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    const requests = await db.getRequests();
    if (user.role === 'cliente') {
      return res.json(requests.filter((item) => item.empresa_id === user.empresa_id));
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

module.exports = router;
