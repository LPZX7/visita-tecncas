const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { verifyVisitApprovalToken } = require('../lib/approvalToken');

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});
router.use(publicLimiter);

async function loadFromToken(req, res) {
  let payload;
  try {
    payload = verifyVisitApprovalToken(req.params.token);
  } catch {
    res.status(400).json({ error: 'Link inválido ou expirado' });
    return null;
  }

  const request = await db.getRequestById(payload.requestId);
  if (!request) {
    res.status(404).json({ error: 'Chamado não encontrado' });
    return null;
  }

  const company = await db.getCompanyById(request.empresa_id);
  const unit = request.unidade_id ? await db.getUnitById(request.unidade_id) : null;
  const equipment = await db.getEquipmentById(request.equipamento_id);

  return { request, company, unit, equipment };
}

router.get('/:token', async (req, res, next) => {
  try {
    const data = await loadFromToken(req, res);
    if (!data) return;
    res.json({
      numero: data.request.numero,
      descricao: data.request.descricao,
      urgencia: data.request.urgencia,
      endereco: data.request.endereco,
      agendado_para: data.request.agendado_para,
      empresa: data.company?.razao_social || null,
      unidade: data.unit ? `${data.unit.tipo} — ${data.unit.nome}` : null,
      equipamento: data.equipment ? `${data.equipment.modelo} — ${data.equipment.numero_serie}` : null,
      aprovacao_cliente: data.request.aprovacao_cliente || null
    });
  } catch (err) {
    next(err);
  }
});

async function respond(req, res, decision) {
  const data = await loadFromToken(req, res);
  if (!data) return;

  if (data.request.aprovacao_cliente) {
    return res.status(409).json({
      error: `Esta visita já foi ${data.request.aprovacao_cliente === 'aprovado' ? 'aprovada' : 'recusada'} anteriormente.`,
      aprovacao_cliente: data.request.aprovacao_cliente
    });
  }

  const updated = await db.updateRequest(data.request.id, {
    aprovacao_cliente: decision,
    data_aprovacao_cliente: new Date().toISOString()
  });

  await db.createNotification({
    empresa_id: data.request.empresa_id,
    titulo: decision === 'aprovado' ? `Chamado #${updated.numero} aprovado pelo cliente` : `Chamado #${updated.numero} recusado pelo cliente`,
    mensagem: data.company?.razao_social || '',
    link: '/requests'
  });

  await db.logAudit({
    user: { nome: `${data.company?.razao_social || 'Cliente'} (via link de aprovação de visita)` },
    acao: decision === 'aprovado' ? 'visita_aprovada' : 'visita_recusada',
    entidade: 'request',
    entidade_id: updated.id,
    detalhes: `Chamado #${updated.numero} — ${decision} sem login, via link enviado por email`
  });

  res.json({
    aprovacao_cliente: decision,
    message: decision === 'aprovado'
      ? 'Visita aprovada com sucesso. Nossa equipe foi notificada.'
      : 'Visita recusada. Nossa equipe foi notificada.'
  });
}

router.post('/:token/aprovar', async (req, res, next) => {
  try {
    await respond(req, res, 'aprovado');
  } catch (err) {
    next(err);
  }
});

router.post('/:token/recusar', async (req, res, next) => {
  try {
    await respond(req, res, 'recusado');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
