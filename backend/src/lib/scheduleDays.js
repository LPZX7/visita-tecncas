function parseScheduleSlot(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)) return null;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function normalizeScheduleDays(input, scheduledAt, scheduledUntil) {
  const start = parseScheduleSlot(scheduledAt);
  if (!start) return { error: 'Escolha uma data e um horário de início válidos.' };
  const end = scheduledUntil ? parseScheduleSlot(scheduledUntil) : null;
  if (scheduledUntil && (!end || end.date !== start.date || end.time <= start.time)) {
    return { error: 'O horário de fim precisa ser no mesmo dia e depois do início.' };
  }

  const rawDays = Array.isArray(input) && input.length
    ? input
    : [{ date: start.date, start: start.time, end: end?.time || '' }];
  if (rawDays.length > 31) return { error: 'Uma visita pode ter até 31 dias de trabalho.' };

  const days = [];
  const dates = new Set();
  for (const rawDay of rawDays) {
    const date = String(rawDay?.date || rawDay?.data || '').trim();
    const startTime = String(rawDay?.start || rawDay?.inicio || '').trim();
    const endTime = String(rawDay?.end || rawDay?.fim || '').trim();
    const parsedStart = parseScheduleSlot(`${date}T${startTime}`);
    if (!parsedStart) return { error: 'Confira a data e o horário de cada dia de trabalho.' };
    if (dates.has(parsedStart.date)) return { error: 'Não repita a mesma data nos dias de trabalho.' };
    dates.add(parsedStart.date);

    if (endTime) {
      const parsedEnd = parseScheduleSlot(`${date}T${endTime}`);
      if (!parsedEnd || parsedEnd.time <= parsedStart.time) {
        return { error: 'O horário de fim de cada dia precisa ser depois do início.' };
      }
    }
    days.push({ date: parsedStart.date, start: parsedStart.time, end: endTime || '' });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  if (days[0].date !== start.date || days[0].start !== start.time || (days[0].end || '') !== (end?.time || '')) {
    return { error: 'O primeiro dia de trabalho precisa corresponder à data e ao horário de início da visita.' };
  }
  return { days };
}

function scheduleDaysForVisit(visit) {
  const result = normalizeScheduleDays(visit?.dias_visita, visit?.agendado_para, visit?.agendado_ate);
  return result.days || [];
}

function scheduleDaysEqual(left, right) {
  const normalize = (value) => (Array.isArray(value) ? value : [])
    .map((day) => ({
      date: String(day?.date || day?.data || ''),
      start: String(day?.start || day?.inicio || ''),
      end: String(day?.end || day?.fim || '')
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function scheduleDayDateTime(day) {
  return `${day.date}T${day.start}`;
}

function scheduleDayEndDateTime(day) {
  return day.end ? `${day.date}T${day.end}` : null;
}

function scheduleDaysFromVisit(visit) {
  const days = scheduleDaysForVisit(visit);
  return days.map((day) => ({
    ...visit,
    agendado_para: scheduleDayDateTime(day),
    agendado_ate: scheduleDayEndDateTime(day)
  }));
}

module.exports = {
  normalizeScheduleDays,
  parseScheduleSlot,
  scheduleDayDateTime,
  scheduleDayEndDateTime,
  scheduleDaysEqual,
  scheduleDaysForVisit,
  scheduleDaysFromVisit
};
