const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');

const router = express.Router();
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas atualizações. Tente novamente em alguns minutos.' }
});

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    dateTime: `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
  };
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function hasValidLinkKey(provided) {
  const expected = process.env.TV_AGENDA_LINK_TOKEN || '';
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

router.use(publicLimiter);

router.get('/', async (req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (!hasValidLinkKey(req.get('x-agenda-tv-key'))) {
    return res.status(404).json({ error: 'Link da agenda inválido.' });
  }

  try {
    const now = saoPauloNow();
    const untilDateTime = `${addDays(now.date, 7)}T00:00`;
    const visitas = await db.getTvAgendaVisits(now.dateTime, untilDateTime);
    res.json({ visitas, atualizado_em: new Date().toISOString(), janela_dias: 7 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
