const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { scopeEquipmentsForClient } = require('../lib/scoping');

const router = express.Router();
router.use(verifyToken);

function normalizeSerial(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isPlaceholderSerial(value) {
  return new Set(['a definir', 'definir', 'n/a', 'na', 'sem serie', 'nao informado', 'pendente']).has(normalizeSerial(value));
}

router.get('/models', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    res.json(await db.getEquipmentModels());
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const equipments = await db.getEquipments();
    if (req.user.role === 'cliente') {
      return res.json(scopeEquipmentsForClient(equipments, req.user));
    }
    if (req.user.role === 'tecnico') {
      const requests = await db.getRequests();
      const equipmentIds = new Set(requests
        .filter((request) => request.assigned_technician === req.user.sub)
        .map((request) => request.equipamento_id));
      return res.json(equipments.filter((equipment) => equipmentIds.has(equipment.id)));
    }
    res.json(equipments);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const { empresa_id, unidade_id, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate } = req.body;
    const modeloReal = String(modelo || '').trim();
    const numeroSerieReal = String(numero_serie || '').trim();
    if (!empresa_id || !modeloReal || !numeroSerieReal) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    if (isPlaceholderSerial(numeroSerieReal)) {
      return res.status(400).json({ error: 'Informe o número de série real do aparelho; “A definir” não é válido.' });
    }
    if (!(await db.getCompanyById(empresa_id))) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }
    if (unidade_id) {
      const unit = await db.getUnitById(unidade_id);
      if (!unit || unit.empresa_id !== empresa_id) {
        return res.status(400).json({ error: 'A filial/sede não pertence à empresa selecionada' });
      }
    }
    const equipment = await db.createEquipment({ empresa_id, unidade_id: unidade_id || null, modelo: modeloReal, numero_serie: numeroSerieReal, local_instalacao, data_instalacao, garantia_ate });
    res.status(201).json(equipment);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const existing = await db.getEquipmentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Equipamento não encontrado' });
    }
    const { empresa_id, unidade_id, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate } = req.body;
    const modeloReal = String(modelo || '').trim();
    const numeroSerieReal = String(numero_serie || '').trim();
    if (!empresa_id || !modeloReal || !numeroSerieReal) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    if (isPlaceholderSerial(numeroSerieReal)) {
      return res.status(400).json({ error: 'Informe o número de série real do aparelho; “A definir” não é válido.' });
    }
    if (!(await db.getCompanyById(empresa_id))) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }
    if (unidade_id) {
      const unit = await db.getUnitById(unidade_id);
      if (!unit || unit.empresa_id !== empresa_id) {
        return res.status(400).json({ error: 'A filial/sede não pertence à empresa selecionada' });
      }
    }
    const updated = await db.updateEquipment(req.params.id, { empresa_id, unidade_id: unidade_id || null, modelo: modeloReal, numero_serie: numeroSerieReal, local_instalacao, data_instalacao, garantia_ate });
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
