const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');

const router = express.Router();
const MAX_PUBLIC_AVATAR_LENGTH = 400 * 1024;
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas atualizações. Tente novamente em alguns minutos.' }
});

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function hasValidLinkKey(provided) {
  const expected = process.env.TV_AGENDA_LINK_TOKEN || '';
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function safePublicAvatar(value) {
  if (typeof value !== 'string' || value.length > MAX_PUBLIC_AVATAR_LENGTH) return null;
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
}

router.use(publicLimiter);

router.get('/', async (req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (!hasValidLinkKey(req.get('x-agenda-tv-key'))) {
    return res.status(404).json({ error: 'Link da agenda inválido.' });
  }

  const fromDate = String(req.query.from || '');
  const toDate = String(req.query.to || '');
  if (!isValidDateKey(fromDate) || !isValidDateKey(toDate)) {
    return res.status(400).json({ error: 'Informe o período do calendário.' });
  }
  const rangeDays = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000;
  if (rangeDays < 0 || rangeDays > 41) {
    return res.status(400).json({ error: 'O calendário pode consultar até 42 dias por vez.' });
  }

  try {
    const visitas = await db.getTvAgendaVisits(`${fromDate}T00:00`, `${addDays(toDate, 1)}T00:00`);
    const visitasPublicas = visitas.map((visita) => ({
      ...visita,
      technician_avatar: safePublicAvatar(visita.technician_avatar)
    }));
    res.json({ visitas: visitasPublicas, atualizado_em: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
