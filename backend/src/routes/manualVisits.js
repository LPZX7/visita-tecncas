const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

function parseScheduledSlot(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)) return null;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function companyName(company) {
  return String(company?.nome_fantasia || company?.razao_social || '').trim();
}

function currentDateTimeInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

router.get('/companies', requireRole('tecnico'), async (req, res, next) => {
  try {
    const companies = await db.getCompanies();
    res.json(companies
      .filter((company) => String(company.status || '').toLowerCase() === 'ativo')
      .map((company) => ({
        id: company.id,
        nome: companyName(company),
        endereco: company.endereco || ''
      }))
      .filter((company) => company.nome));
  } catch (err) {
    next(err);
  }
});

router.get('/', requireRole('tecnico', 'analista', 'gestor'), async (req, res, next) => {
  try {
    const technicianId = req.user.role === 'tecnico' ? req.user.sub : null;
    res.json(await db.getManualVisits(technicianId));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('tecnico'), async (req, res, next) => {
  try {
    const technician = await db.getUserById(req.user.sub);
    if (!technician || technician.role !== 'tecnico' || !technician.ativo) {
      return res.status(403).json({ error: 'Somente um técnico ativo pode cadastrar uma visita manual.' });
    }

    const empresa_nome = String(req.body.empresa_nome || '').trim();
    const endereco = String(req.body.endereco || '').trim();
    const descricao = String(req.body.descricao || 'Visita técnica manual').trim();
    const empresa_id = String(req.body.empresa_id || '').trim() || null;
    const agendado_para = String(req.body.agendado_para || '').trim();
    const agendado_ate = String(req.body.agendado_ate || '').trim() || null;
    const start = parseScheduledSlot(agendado_para);

    if (!empresa_nome || empresa_nome.length > 160) {
      return res.status(400).json({ error: 'Informe o nome da empresa (máximo de 160 caracteres).' });
    }
    if (!endereco || endereco.length > 500) {
      return res.status(400).json({ error: 'Informe o endereço da visita (máximo de 500 caracteres).' });
    }
    if (!descricao || descricao.length > 300) {
      return res.status(400).json({ error: 'A descrição precisa ter até 300 caracteres.' });
    }
    if (!start) {
      return res.status(400).json({ error: 'Escolha uma data e um horário de início válidos.' });
    }
    if (agendado_ate) {
      const end = parseScheduledSlot(agendado_ate);
      if (!end || end.date !== start.date || end.time <= start.time) {
        return res.status(400).json({ error: 'O horário de fim precisa ser no mesmo dia e depois do início.' });
      }
    }

    if (empresa_id) {
      const company = await db.getCompanyById(empresa_id);
      if (!company || String(company.status || '').toLowerCase() !== 'ativo') {
        return res.status(400).json({ error: 'Selecione uma empresa ativa ou digite o nome para usar neste agendamento.' });
      }
      const expectedName = companyName(company);
      if (expectedName.toLocaleLowerCase('pt-BR') !== empresa_nome.toLocaleLowerCase('pt-BR')) {
        return res.status(400).json({ error: 'O nome da empresa selecionada não corresponde ao cadastro.' });
      }
    }

    if (agendado_para >= currentDateTimeInSaoPaulo()) {
      const unavailable = await db.getTechnicianUnavailabilityForDate(technician.id, start.date);
      if (unavailable) {
        return res.status(409).json({ error: 'Você marcou este dia como indisponível. Remova o bloqueio antes de agendar.' });
      }
    }

    const conflictingBooking = await db.getTechnicianBookingAt(
      technician.id,
      agendado_para,
      agendado_ate,
      ''
    );
    if (conflictingBooking) {
      return res.status(409).json({ error: 'Você já tem outra visita neste horário. Escolha outro horário.' });
    }

    const visit = await db.createManualVisit({
      assigned_technician: technician.id,
      empresa_id,
      empresa_nome,
      endereco,
      descricao,
      agendado_para,
      agendado_ate,
      criado_por: technician.id
    });
    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
