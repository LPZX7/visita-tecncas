const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { verifyApprovalToken } = require('../lib/approvalToken');

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});
router.use(publicLimiter);

// Este endpoint é só leitura (identifica o orçamento a partir do link do
// email). A aprovação em si exige login — ver PATCH /budgets/:id/status —
// para que um link vazado não permita autorizar o orçamento sem uma conta.
router.get('/:token', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = verifyApprovalToken(req.params.token);
    } catch {
      return res.status(400).json({ error: 'Link inválido ou expirado' });
    }

    const budget = await db.getBudgetById(payload.budgetId);
    if (!budget) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    const request = await db.getRequestById(budget.request_id);
    const company = request ? await db.getCompanyById(budget.empresa_id || request.empresa_id) : null;
    const unit = budget.unidade_id ? await db.getUnitById(budget.unidade_id) : null;
    const equipment = request?.equipamento_id ? await db.getEquipmentById(request.equipamento_id) : null;
    const items = await Promise.all(budget.items.map(async (item) => ({
      nome: (await db.getPartById(item.peca_id))?.nome || 'Peça',
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario
    })));

    res.json({
      budget_id: budget.id,
      status: budget.status,
      total: budget.total,
      pecas_total: budget.pecas_total,
      deslocamento: budget.deslocamento,
      items,
      empresa: company?.razao_social || null,
      unidade: unit ? `${unit.tipo} — ${unit.nome}` : null,
      chamado: request?.descricao || null,
      equipamento: equipment ? `${equipment.modelo} — ${equipment.numero_serie}` : null,
      problema: request?.descricao || null,
      motivo_troca: budget.motivo_troca || null,
      observacoes_tecnicas: budget.observacoes_tecnicas || null
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
