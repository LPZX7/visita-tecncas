const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { scopeEquipmentsForClient } = require('../lib/scoping');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const equipments = await db.getEquipments();
    if (req.user.role === 'cliente') {
      return res.json(scopeEquipmentsForClient(equipments, req.user));
    }
    res.json(equipments);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('gestor'), async (req, res, next) => {
  try {
    const { empresa_id, unidade_id, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate } = req.body;
    if (!empresa_id || !modelo || !numero_serie) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const equipment = await db.createEquipment({ empresa_id, unidade_id: unidade_id || null, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate });
    res.status(201).json(equipment);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    const existing = await db.getEquipmentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Equipamento não encontrado' });
    }
    const { empresa_id, unidade_id, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate } = req.body;
    if (!empresa_id || !modelo || !numero_serie) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const updated = await db.updateEquipment(req.params.id, { empresa_id, unidade_id: unidade_id || null, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    const existing = await db.getEquipmentById(req.params.id);
    const result = await db.deleteEquipment(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: existem chamados vinculados a este equipamento' });
    }
    if (!result.deleted) {
      return res.status(404).json({ error: 'Equipamento não encontrado' });
    }
    await db.logAudit({
      user: req.user,
      acao: 'equipamento_excluido',
      entidade: 'equipment',
      entidade_id: req.params.id,
      detalhes: existing ? `${existing.modelo} — Série ${existing.numero_serie}` : null
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
