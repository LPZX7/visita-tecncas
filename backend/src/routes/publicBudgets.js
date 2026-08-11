const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { verifyApprovalToken } = require('../lib/approvalToken');
const { sendMail } = require('../lib/mailer');
const { pushVisitaTecnicaAprovadaToMilvus } = require('../lib/milvusSync');

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
    payload = verifyApprovalToken(req.params.token);
  } catch {
    res.status(400).json({ error: 'Link inválido ou expirado' });
    return null;
  }

  const budget = await db.getBudgetById(payload.budgetId);
  if (!budget) {
    res.status(404).json({ error: 'Orçamento não encontrado' });
    return null;
  }

  const request = await db.getRequestById(budget.request_id);
  const company = request ? await db.getCompanyById(budget.empresa_id || request.empresa_id) : null;
  const unit = budget.unidade_id ? await db.getUnitById(budget.unidade_id) : null;
  const items = await Promise.all(budget.items.map(async (item) => ({
    ...item,
    peca: await db.getPartById(item.peca_id)
  })));

  return { budget, request, company, unit, items };
}

router.get('/:token', async (req, res, next) => {
  try {
    const data = await loadFromToken(req, res);
    if (!data) return;
    const equipment = data.request?.equipamento_id ? await db.getEquipmentById(data.request.equipamento_id) : null;
    res.json({
      status: data.budget.status,
      total: data.budget.total,
      pecas_total: data.budget.pecas_total,
      deslocamento: data.budget.deslocamento,
      items: data.items.map((item) => ({ nome: item.peca?.nome || 'Peça', quantidade: item.quantidade, valor_unitario: item.valor_unitario })),
      empresa: data.company?.razao_social || null,
      unidade: data.unit ? `${data.unit.tipo} — ${data.unit.nome}` : null,
      chamado: data.request?.descricao || null,
      equipamento: equipment ? `${equipment.modelo} — ${equipment.numero_serie}` : null,
      problema: data.request?.descricao || null,
      motivo_troca: data.budget.motivo_troca || null,
      servico_realizado: data.budget.servico_realizado || null,
      observacoes_tecnicas: data.budget.observacoes_tecnicas || null
    });
  } catch (err) {
    next(err);
  }
});

async function respond(req, res, status, successMessage) {
  const data = await loadFromToken(req, res);
  if (!data) return;

  if (data.budget.status !== 'Enviado') {
    return res.status(409).json({ error: `Este orçamento já foi ${data.budget.status.toLowerCase()} anteriormente.`, status: data.budget.status });
  }

  const patch = { status };
  if (status === 'Aprovado') {
    patch.autorizado_por = 'Cliente via link de email (sem login)';
  }
  const updated = await db.updateBudget(data.budget.id, patch);
  await db.logAudit({
    user: { nome: `${data.company?.razao_social || 'Cliente'} (via link de aprovação por email)` },
    acao: `orcamento_${status.toLowerCase()}`,
    entidade: 'budget',
    entidade_id: updated.id,
    detalhes: `Orçamento de R$ ${Number(updated.total).toFixed(2)} — aprovado/rejeitado sem login, via link enviado por email`
  });

  let contract = null;
  if (status === 'Aprovado') {
    contract = await db.createContractForBudget(updated);
    pushVisitaTecnicaAprovadaToMilvus(
      updated,
      data.request,
      data.company,
      data.items.map((item) => ({ nome: item.peca?.nome || 'Peça', quantidade: item.quantidade, valor_unitario: item.valor_unitario })),
      { email: data.company?.email, contato: data.company?.responsavel }
    );
  }

  const draftUser = data.budget.draft_by ? await db.getUserById(data.budget.draft_by) : null;
  if (draftUser?.email) {
    sendMail({
      to: draftUser.email,
      subject: `Orçamento ${status.toLowerCase()} pelo cliente`,
      text: contract
        ? `O orçamento de R$ ${Number(updated.total).toFixed(2)} (${data.company?.razao_social || 'cliente'}) foi aprovado pelo cliente diretamente pelo email.\n\nContrato gerado automaticamente: ${contract.numero}`
        : `O orçamento de R$ ${Number(updated.total).toFixed(2)} (${data.company?.razao_social || 'cliente'}) foi ${status.toLowerCase()} pelo cliente diretamente pelo email.`
    });
  }

  if (data.request) {
    await db.createNotification({
      empresa_id: data.request.empresa_id,
      titulo: contract ? 'Orçamento aprovado' : 'Orçamento rejeitado',
      mensagem: contract ? `Contrato ${contract.numero} gerado automaticamente` : `Orçamento de R$ ${Number(updated.total).toFixed(2)} rejeitado`,
      link: contract ? '/contracts' : '/budgets'
    });
  }

  res.json({ status: updated.status, message: successMessage, contractNumber: contract?.numero || null });
}

router.post('/:token/approve', async (req, res, next) => {
  try {
    await respond(req, res, 'Aprovado', 'Orçamento aprovado com sucesso. Nossa equipe foi notificada e o contrato foi gerado.');
  } catch (err) {
    next(err);
  }
});

router.post('/:token/reject', async (req, res, next) => {
  try {
    await respond(req, res, 'Rejeitado', 'Orçamento rejeitado. Nossa equipe foi notificada.');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
