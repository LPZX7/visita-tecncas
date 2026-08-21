const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { syncBomControleParts, getBomControleSyncStatus } = require('../lib/bomControle');

const router = express.Router();
router.use(verifyToken);

router.get('/', requireRole('gestor', 'analista', 'tecnico'), async (req, res, next) => {
  try {
    res.json(await db.getParts());
  } catch (err) {
    next(err);
  }
});

router.get('/bomcontrole/status', requireRole('gestor'), (req, res) => {
  res.json(getBomControleSyncStatus());
});

router.post('/bomcontrole/sync', requireRole('gestor'), async (req, res, next) => {
  try {
    const result = await syncBomControleParts();
    await db.logAudit({
      user: req.user,
      acao: 'estoque_bomcontrole_sincronizado',
      entidade: 'pecas',
      detalhes: `${result.total} produtos processados (${result.created} novos, ${result.updated} atualizados)`
    });
    res.json(result);
  } catch (err) {
    if (err.message.includes('não configurada')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

router.post('/', requireRole('gestor'), async (req, res, next) => {
  try {
    const { codigo, nome, categoria, preco_unitario, estoque, fornecedor } = req.body;
    if (!codigo || !nome || !categoria || preco_unitario == null) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const part = await db.createPart({ codigo, nome, categoria, preco_unitario, estoque: estoque || 0, fornecedor });
    res.status(201).json(part);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    const existing = await db.getPartById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Peça não encontrada' });
    }
    const { codigo, nome, categoria, preco_unitario, estoque, fornecedor } = req.body;
    if (!codigo || !nome || !categoria || preco_unitario == null) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const updated = await db.updatePart(req.params.id, { codigo, nome, categoria, preco_unitario, estoque: estoque || 0, fornecedor });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    const result = await db.deletePart(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: esta peça está usada em orçamentos existentes' });
    }
    if (!result.deleted) {
      return res.status(404).json({ error: 'Peça não encontrada' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
