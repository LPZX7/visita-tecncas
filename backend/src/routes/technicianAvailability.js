const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateFutureDate(date, res) {
  if (!isValidDateKey(date)) {
    res.status(400).json({ error: 'Informe uma data válida no formato AAAA-MM-DD' });
    return false;
  }
  if (date < todayInSaoPaulo()) {
    res.status(400).json({ error: 'Não é possível alterar a disponibilidade de uma data passada' });
    return false;
  }
  return true;
}

async function findActiveTechnician(technicianId, res) {
  const technician = await db.getUserById(technicianId);
  if (!technician || technician.role !== 'tecnico' || !technician.ativo) {
    res.status(404).json({ error: 'Técnico ativo não encontrado' });
    return null;
  }
  return technician;
}

function parseAvailabilityHours(body, res) {
  const availableFrom = String(body?.available_from || '07:00');
  const availableUntil = String(body?.available_until || '');
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!validTime.test(availableFrom) || !validTime.test(availableUntil)) {
    res.status(400).json({ error: 'Informe os horários inicial e final no formato HH:MM' });
    return null;
  }
  if (availableFrom >= availableUntil) {
    res.status(400).json({ error: 'O horário final deve ser depois do horário inicial' });
    return null;
  }
  return { availableFrom, availableUntil };
}

router.get('/team', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    res.json(await db.getTeamTechnicianAvailability(todayInSaoPaulo()));
  } catch (err) {
    next(err);
  }
});

router.get('/team/:technicianId', requireRole('gestor'), async (req, res, next) => {
  try {
    const technician = await findActiveTechnician(req.params.technicianId, res);
    if (!technician) return;
    res.json(await db.getTechnicianAvailability(technician.id));
  } catch (err) {
    next(err);
  }
});

router.get('/', requireRole('tecnico'), async (req, res, next) => {
  try {
    res.json(await db.getTechnicianAvailability(req.user.sub));
  } catch (err) {
    next(err);
  }
});

router.put('/team/:technicianId/:date', requireRole('gestor'), async (req, res, next) => {
  try {
    const technician = await findActiveTechnician(req.params.technicianId, res);
    if (!technician || !validateFutureDate(req.params.date, res)) return;
    const hours = parseAvailabilityHours(req.body, res);
    if (!hours) return;
    res.json(await db.setTechnicianAvailability(technician.id, req.params.date, hours.availableFrom, hours.availableUntil));
  } catch (err) {
    next(err);
  }
});

router.put('/:date', requireRole('tecnico'), async (req, res, next) => {
  try {
    if (!validateFutureDate(req.params.date, res)) return;
    const hours = parseAvailabilityHours(req.body, res);
    if (!hours) return;
    res.json(await db.setTechnicianAvailability(req.user.sub, req.params.date, hours.availableFrom, hours.availableUntil));
  } catch (err) {
    next(err);
  }
});

router.delete('/team/:technicianId/:date', requireRole('gestor'), async (req, res, next) => {
  try {
    const technician = await findActiveTechnician(req.params.technicianId, res);
    if (!technician || !validateFutureDate(req.params.date, res)) return;
    await db.deleteTechnicianAvailability(technician.id, req.params.date);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.delete('/:date', requireRole('tecnico'), async (req, res, next) => {
  try {
    if (!validateFutureDate(req.params.date, res)) return;
    await db.deleteTechnicianAvailability(req.user.sub, req.params.date);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
