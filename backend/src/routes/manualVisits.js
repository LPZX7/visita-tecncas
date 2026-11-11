const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { normalizeScheduleDays, scheduleDayDateTime, scheduleDayEndDateTime, scheduleDaysEqual } = require('../lib/scheduleDays');

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
    const schedule = normalizeScheduleDays(req.body.dias_visita, agendado_para, agendado_ate);
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
    if (schedule.error) return res.status(400).json({ error: schedule.error });

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

    for (const day of schedule.days) {
      if (scheduleDayDateTime(day) >= currentDateTimeInSaoPaulo()) {
        const unavailable = await db.getTechnicianUnavailabilityForDate(technician.id, day.date);
        if (unavailable) {
          return res.status(409).json({ error: `Você marcou ${day.date} como indisponível. Remova o bloqueio antes de agendar.` });
        }
      }
      const conflictingBooking = await db.getTechnicianBookingAt(
        technician.id,
        scheduleDayDateTime(day),
        scheduleDayEndDateTime(day),
        ''
      );
      if (conflictingBooking) {
        return res.status(409).json({ error: `Você já tem outra visita em ${day.date} neste horário.` });
      }
    }

    const visit = await db.createManualVisit({
      assigned_technician: technician.id,
      empresa_id,
      empresa_nome,
      endereco,
      descricao,
      agendado_para,
      agendado_ate,
      dias_visita: schedule.days,
      criado_por: technician.id
    });
    await db.logAudit({
      user: req.user,
      acao: 'visita_manual_agendada',
      entidade: 'manual_visit',
      entidade_id: visit.id,
      detalhes: `${empresa_nome} — ${agendado_para}${agendado_ate ? ` até ${agendado_ate}` : ''}; técnico ${technician.nome}; endereço: ${endereco}.`
    });
    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireRole('tecnico', 'analista', 'gestor'), async (req, res, next) => {
  try {
    const existing = await db.getManualVisitById(req.params.id);
    if (!existing || existing.status === 'Cancelada') {
      return res.status(404).json({ error: 'Visita não encontrada na agenda.' });
    }
    if (existing.agenda_oculta) {
      return res.status(404).json({ error: 'Esta visita já foi removida do calendário.' });
    }
    if (req.user.role === 'tecnico' && existing.assigned_technician !== req.user.sub) {
      return res.status(403).json({ error: 'Você só pode alterar suas próprias visitas manuais.' });
    }
    if (existing.status === 'Concluída') {
      return res.status(409).json({ error: 'Uma visita concluída não pode ser alterada.' });
    }

    const empresa_nome = String(req.body.empresa_nome ?? existing.empresa_nome).trim();
    const endereco = String(req.body.endereco ?? existing.endereco).trim();
    const descricao = String(req.body.descricao ?? existing.descricao).trim();
    const empresa_id = req.body.empresa_id === undefined ? existing.empresa_id : String(req.body.empresa_id || '').trim() || null;
    const agendado_para = String(req.body.agendado_para ?? existing.agendado_para).trim();
    const agendado_ate = req.body.agendado_ate === undefined
      ? (existing.agendado_ate || null)
      : String(req.body.agendado_ate || '').trim() || null;
    const schedule = normalizeScheduleDays(req.body.dias_visita, agendado_para, agendado_ate);
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
    if (schedule.error) return res.status(400).json({ error: schedule.error });

    if (empresa_id) {
      const company = await db.getCompanyById(empresa_id);
      if (!company || String(company.status || '').toLowerCase() !== 'ativo') {
        return res.status(400).json({ error: 'Selecione uma empresa ativa ou digite o nome para usar neste agendamento.' });
      }
      if (companyName(company).toLocaleLowerCase('pt-BR') !== empresa_nome.toLocaleLowerCase('pt-BR')) {
        return res.status(400).json({ error: 'O nome da empresa selecionada não corresponde ao cadastro.' });
      }
    }

    const scheduleChanged = agendado_para !== existing.agendado_para
      || agendado_ate !== (existing.agendado_ate || null)
      || !scheduleDaysEqual(schedule.days, existing.dias_visita);
    if (scheduleChanged) {
      for (const day of schedule.days) {
        if (scheduleDayDateTime(day) >= currentDateTimeInSaoPaulo()) {
          const unavailable = await db.getTechnicianUnavailabilityForDate(existing.assigned_technician, day.date);
          if (unavailable) {
            return res.status(409).json({ error: `O técnico marcou ${day.date} como indisponível. Escolha outra data.` });
          }
        }
        const conflictingBooking = await db.getTechnicianBookingAt(
          existing.assigned_technician,
          scheduleDayDateTime(day),
          scheduleDayEndDateTime(day),
          existing.id
        );
        if (conflictingBooking) {
          return res.status(409).json({ error: `O técnico já tem outra visita em ${day.date} neste horário.` });
        }
      }
    }

    const updated = await db.updateManualVisit(existing.id, {
      empresa_id,
      empresa_nome,
      endereco,
      descricao,
      agendado_para,
      agendado_ate,
      dias_visita: schedule.days,
      agenda_oculta: false
    });
    await db.logAudit({
      user: req.user,
      acao: 'visita_manual_alterada',
      entidade: 'manual_visit',
      entidade_id: existing.id,
      detalhes: `${existing.empresa_nome} (${existing.agendado_para}${existing.agendado_ate ? ` até ${existing.agendado_ate}` : ''}) alterada para ${empresa_nome} (${agendado_para}${agendado_ate ? ` até ${agendado_ate}` : ''}); endereço: ${endereco}.`
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('tecnico', 'analista', 'gestor'), async (req, res, next) => {
  try {
    const existing = await db.getManualVisitById(req.params.id);
    if (!existing || existing.status === 'Cancelada') {
      return res.status(404).json({ error: 'Visita não encontrada na agenda.' });
    }
    if (existing.agenda_oculta) {
      return res.status(404).json({ error: 'Esta visita já foi removida do calendário.' });
    }
    if (req.user.role === 'tecnico' && existing.assigned_technician !== req.user.sub) {
      return res.status(403).json({ error: 'Você só pode retirar suas próprias visitas manuais da agenda.' });
    }
    const completed = existing.status === 'Concluída';
    await db.updateManualVisit(existing.id, completed ? { agenda_oculta: true } : { status: 'Cancelada' });
    await db.logAudit({
      user: req.user,
      acao: completed ? 'visita_manual_removida_calendario' : 'visita_manual_retirada_agenda',
      entidade: 'manual_visit',
      entidade_id: existing.id,
      detalhes: `${existing.empresa_nome} — ${existing.agendado_para}${existing.agendado_ate ? ` até ${existing.agendado_ate}` : ''}; técnico: ${existing.technician_name || existing.assigned_technician}. ${completed ? 'Conclusão preservada; evento ocultado do calendário.' : 'Visita cancelada na agenda.'}`
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
