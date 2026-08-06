const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', requireRole('gestor', 'analista', 'tecnico', 'cliente'), (req, res) => {
  res.json(db.getPricingRules());
});

router.post('/', requireRole('gestor'), (req, res) => {
  const { empresa_id, tipo, valor_base, visitas_incluidas } = req.body;
  if (!empresa_id || !tipo || valor_base == null) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  const rule = db.createPricingRule({ empresa_id, tipo, valor_base, visitas_incluidas: visitas_incluidas || 0 });
  res.status(201).json(rule);
});

router.put('/:id', requireRole('gestor'), (req, res) => {
  const existing = db.getPricingRuleById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Regra não encontrada' });
  }
  const { empresa_id, tipo, valor_base, visitas_incluidas } = req.body;
  if (!empresa_id || !tipo || valor_base == null) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  const updated = db.updatePricingRule(req.params.id, { empresa_id, tipo, valor_base, visitas_incluidas: visitas_incluidas || 0 });
  res.json(updated);
});

router.delete('/:id', requireRole('gestor'), (req, res) => {
  const result = db.deletePricingRule(req.params.id);
  if (result.blocked) {
    return res.status(409).json({ error: 'Não é possível excluir: esta regra está usada em orçamentos existentes' });
  }
  if (!result.deleted) {
    return res.status(404).json({ error: 'Regra não encontrada' });
  }
  res.status(204).end();
});

module.exports = router;
