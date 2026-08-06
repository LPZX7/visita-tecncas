const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const empresaId = req.user.role === 'cliente' ? req.user.empresa_id : req.query.empresa_id;
    res.json(await db.getUnits(empresaId || undefined));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const { empresa_id, nome, tipo = 'Filial', endereco, telefone, responsavel } = req.body;
    if (!empresa_id || !nome) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    if (!(await db.getCompanyById(empresa_id))) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }
    const unit = await db.createUnit({ empresa_id, nome, tipo, endereco, telefone, responsavel });
    res.status(201).json(unit);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const existing = await db.getUnitById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }
    const { nome, tipo, endereco, telefone, responsavel } = req.body;
    if (!nome) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const updated = await db.updateUnit(req.params.id, { nome, tipo, endereco, telefone, responsavel });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const result = await db.deleteUnit(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: existem equipamentos vinculados a esta unidade' });
    }
    if (!result.deleted) {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
