const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', requireRole('gestor', 'analista', 'tecnico', 'cliente'), (req, res) => {
  res.json(db.getParts());
});

router.post('/', requireRole('gestor'), (req, res) => {
  const { codigo, nome, categoria, preco_unitario, estoque, fornecedor } = req.body;
  if (!codigo || !nome || !categoria || preco_unitario == null) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  const part = db.createPart({ codigo, nome, categoria, preco_unitario, estoque: estoque || 0, fornecedor });
  res.status(201).json(part);
});

router.put('/:id', requireRole('gestor'), (req, res) => {
  const existing = db.getPartById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Peça não encontrada' });
  }
  const { codigo, nome, categoria, preco_unitario, estoque, fornecedor } = req.body;
  if (!codigo || !nome || !categoria || preco_unitario == null) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  const updated = db.updatePart(req.params.id, { codigo, nome, categoria, preco_unitario, estoque: estoque || 0, fornecedor });
  res.json(updated);
});

router.delete('/:id', requireRole('gestor'), (req, res) => {
  const result = db.deletePart(req.params.id);
  if (result.blocked) {
    return res.status(409).json({ error: 'Não é possível excluir: esta peça está usada em orçamentos existentes' });
  }
  if (!result.deleted) {
    return res.status(404).json({ error: 'Peça não encontrada' });
  }
  res.status(204).end();
});

module.exports = router;
