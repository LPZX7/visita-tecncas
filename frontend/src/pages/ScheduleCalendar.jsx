import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';
import './ScheduleCalendar.css';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function currentTimeInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.hour}:${values.minute}`;
}

function formatMonth(year, month) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

function formatDateShort(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function timeOf(value) {
  return String(value || '').match(/[T ](\d{2}:\d{2})/)?.[1] || 'Horário não definido';
}

function timeRangeOf(visit) {
  const start = timeOf(visit.agendado_para);
  const end = timeOf(visit.agendado_ate);
  return end === 'Horário não definido' ? start : `${start}–${end}`;
}

function workDaysOf(visit) {
  const savedDays = Array.isArray(visit?.dias_visita) ? visit.dias_visita : [];
  if (savedDays.length) {
    return savedDays.map((day) => ({
      date: day.date || day.data,
      start: day.start || day.inicio,
      end: day.end || day.fim || ''
    })).sort((a, b) => a.date.localeCompare(b.date));
  }
  const date = String(visit?.agendado_para || '').slice(0, 10);
  const start = timeOf(visit?.agendado_para);
  if (!date || start === 'Horário não definido') return [];
  const end = timeOf(visit?.agendado_ate);
  return [{ date, start, end: end === 'Horário não definido' ? '' : end }];
}

function visitsForWorkDays(visit) {
  const days = workDaysOf(visit);
  return days.map((day, index) => ({
    ...visit,
    dia_visita_index: index + 1,
    dias_visita_total: days.length,
    agendado_para: `${day.date}T${day.start}`,
    agendado_ate: day.end ? `${day.date}T${day.end}` : null
  }));
}

function companyDisplayName(company) {
  return String(company?.nome || company?.nome_fantasia || company?.razao_social || '').trim();
}

function unitAddress(unit) {
  return [unit?.endereco, unit?.numero, unit?.complemento, unit?.bairro,
    unit?.cidade && unit?.estado ? `${unit.cidade}/${unit.estado}` : unit?.cidade, unit?.cep]
    .filter(Boolean)
    .join(', ');
}

function visitVisualState(visit) {
  if (visit.status === 'Concluída') return { kind: 'completed', icon: '✓', label: 'Realizada' };
  const scheduledAt = String(visit.agendado_para || '').slice(0, 16);
  if (scheduledAt && scheduledAt < `${todayKey()}T${currentTimeInSaoPaulo()}`) {
    return { kind: 'overdue', icon: '⚠️', label: 'Atrasada' };
  }
  return { kind: 'pending', icon: '🕒', label: 'Pendente' };
}

function canConfirmVisitAsCompleted(visit, today, currentTime) {
  const statusCanBeCompleted = visit?.manual_visit
    ? visit.status === 'Agendada'
    : ['Aberta', 'Agendada', 'Em Atendimento'].includes(visit?.status);
  if (!statusCanBeCompleted) return false;
  const days = workDaysOf(visit);
  return days.length > 0 && days.every((day) => (
    /^\d{4}-\d{2}-\d{2}$/.test(day.date || '')
    && /^\d{2}:\d{2}$/.test(day.start || '')
    && `${day.date}T${day.start}` < `${today}T${currentTime}`
    && (!day.end || (/^\d{2}:\d{2}$/.test(day.end) && `${day.date}T${day.end}` < `${today}T${currentTime}`))
  ));
}

function visitOverlapsBooking(visit, date, start, end) {
  if (String(visit.agendado_para).slice(0, 10) !== date) return false;
  const existingStart = timeOf(visit.agendado_para);
  const existingEnd = timeOf(visit.agendado_ate);
  if (!end) {
    return existingStart === start
      || (existingEnd !== 'Horário não definido' && existingStart < start && existingEnd > start);
  }
  if (existingEnd === 'Horário não definido') return existingStart >= start && existingStart < end;
  return existingStart < end && existingEnd > start;
}

function makeCalendarCells(year, month) {
  const offset = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: offset }, (_, index) => ({ key: `empty-${index}`, empty: true }));
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ key: dateKey(date), day });
  }
  while (cells.length % 7 !== 0) cells.push({ key: `empty-end-${cells.length}`, empty: true });
  return cells;
}

export default function ScheduleCalendar() {
  const user = getUser();
  const canManage = ['gestor', 'analista'].includes(user?.role);
  const technicianMode = user?.role === 'tecnico';
  const [requests, setRequests] = useState([]);
  const [manualVisits, setManualVisits] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [manualCompanyOptions, setManualCompanyOptions] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [unavailableDates, setUnavailableDates] = useState([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(technicianMode ? user?.id || '' : '');
  const [cursor, setCursor] = useState(() => {
    const date = new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [bookingRequestId, setBookingRequestId] = useState('');
  const [bookingUnitId, setBookingUnitId] = useState('');
  const [bookingMode, setBookingMode] = useState('request');
  const [editingVisit, setEditingVisit] = useState(null);
  const [manualCompanyName, setManualCompanyName] = useState('');
  const [manualCompanyId, setManualCompanyId] = useState('');
  const [manualVisitDescription, setManualVisitDescription] = useState('Visita técnica manual');
  const [bookingTime, setBookingTime] = useState('08:00');
  const [bookingEndEnabled, setBookingEndEnabled] = useState(false);
  const [bookingEndTime, setBookingEndTime] = useState('');
  const [additionalVisitDays, setAdditionalVisitDays] = useState([]);
  const [bookingVisitAlreadyDone, setBookingVisitAlreadyDone] = useState(false);
  const [bookingAddress, setBookingAddress] = useState('');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingTickets, setSyncingTickets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [requestResponse, companyResponse, manualVisitResponse, unitsResponse] = await Promise.all([
        api.get('/requests'), api.get('/companies'), api.get('/manual-visits'), api.get('/units')
      ]);
      setRequests(requestResponse.data);
      setCompanies(companyResponse.data);
      setUnits(unitsResponse.data);
      setManualCompanyOptions(companyResponse.data
        .map((company) => ({ id: company.id, nome: companyDisplayName(company), endereco: company.endereco || '' }))
        .filter((company) => company.nome));
      setManualVisits(manualVisitResponse.data);
      if (canManage) {
        const [usersResponse, unavailableResponse] = await Promise.all([
          api.get('/users'),
          api.get('/technician-availability/team')
        ]);
        const activeTechnicians = usersResponse.data.filter((entry) => (
          entry.role === 'tecnico' && entry.ativo && entry.milvus_email && entry.milvus_nome
        ));
        setTechnicians(activeTechnicians);
        setUnavailableDates(unavailableResponse.data);
        setSelectedTechnicianId((current) => current || activeTechnicians[0]?.id || '');
      } else if (technicianMode) {
        const [availabilityResponse, companyOptionsResponse] = await Promise.all([
          api.get('/technician-availability'), api.get('/manual-visits/companies')
        ]);
        setUnavailableDates(availabilityResponse.data.map((entry) => ({ ...entry, technician_id: user.id })));
        setManualCompanyOptions(companyOptionsResponse.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar a agenda. Atualize a página e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  async function syncTicketsFromMilvus() {
    setSyncingTickets(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/milvus-import/sync');
      await load();
      setSuccess(`Milvus consultado: ${data.novos || 0} chamado(s) novo(s), ${data.importados_automaticamente || 0} pronto(s) para agendar e ${data.aguardando_revisao || 0} aguardando revisão.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível buscar chamados no Milvus.');
    } finally {
      setSyncingTickets(false);
    }
  }

  const selectedTechnician = technicians.find((entry) => entry.id === selectedTechnicianId);
  const unitsForCompany = (companyId) => units.filter((unit) => unit.empresa_id === companyId
    && String(unit.status || '').toLowerCase() === 'ativo');
  const cells = useMemo(() => makeCalendarCells(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const today = todayKey();
  const currentTime = currentTimeInSaoPaulo();
  const blockedDateSet = useMemo(() => new Set(
    unavailableDates
      .filter((entry) => entry.technician_id === selectedTechnicianId && String(entry.date).slice(0, 10) >= today)
      .map((entry) => String(entry.date).slice(0, 10))
  ), [unavailableDates, selectedTechnicianId, today]);
  const technicianVisits = useMemo(() => [
    ...requests.filter((request) => (
      request.assigned_technician === selectedTechnicianId
      && request.agendado_para
      && request.status !== 'Cancelada'
      && !request.agenda_oculta
    )).flatMap(visitsForWorkDays),
    ...manualVisits.filter((visit) => (
      visit.assigned_technician === selectedTechnicianId
      && visit.agendado_para
      && visit.status !== 'Cancelada'
      && !visit.agenda_oculta
    )).flatMap(visitsForWorkDays)
  ], [requests, manualVisits, selectedTechnicianId]);
  const visitsByDate = useMemo(() => technicianVisits.reduce((result, visit) => {
    const day = String(visit.agendado_para).slice(0, 10);
    result[day] ||= [];
    result[day].push(visit);
    result[day].sort((a, b) => String(a.agendado_para).localeCompare(String(b.agendado_para)));
    return result;
  }, {}), [technicianVisits]);
  const dayVisits = visitsByDate[selectedDate] || [];
  const selectedDateUnavailable = blockedDateSet.has(selectedDate);
  const bookableRequests = requests.filter((request) => (
    request.milvus_codigo
    && (request.status === 'Concluída'
      ? user?.role === 'gestor' && !editingVisit?.manual_visit && editingVisit?.id === request.id
      : ['Aberta', 'Agendada'].includes(request.status) && !request.hora_checkin && !request.hora_checkout)
  ));
  const selectedBookingRequest = bookableRequests.find((request) => request.id === bookingRequestId);
  const proposedWorkDays = [
    ...(selectedDate ? [{ date: selectedDate, start: bookingTime, end: bookingEndEnabled ? bookingEndTime : '' }] : []),
    ...additionalVisitDays.filter(Boolean).map((date) => ({ date, start: bookingTime, end: bookingEndEnabled ? bookingEndTime : '' }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  const proposedSchedule = proposedWorkDays[0] ? `${proposedWorkDays[0].date}T${proposedWorkDays[0].start}` : '';
  const proposedScheduleEnd = proposedWorkDays[0]?.end ? `${proposedWorkDays[0].date}T${proposedWorkDays[0].end}` : '';
  const duplicateWorkDays = new Set(proposedWorkDays.map((day) => day.date)).size !== proposedWorkDays.length;
  const additionalDayBeforeStart = additionalVisitDays.some((day) => day <= selectedDate);
  const proposedWorkDaysArePast = proposedWorkDays.length > 0 && proposedWorkDays.every((day) => (
    `${day.date}T${day.start}` < `${today}T${currentTime}`
    && (!day.end || `${day.date}T${day.end}` < `${today}T${currentTime}`)
  ));
  const canConcludeScheduledVisit = user?.role === 'gestor'
    && bookingMode === 'request'
    && Boolean(editingVisit)
    && !editingVisit?.manual_visit
    && selectedBookingRequest
    && !['Concluída', 'Cancelada'].includes(selectedBookingRequest.status)
    && proposedWorkDaysArePast;
  const canConcludeManualVisit = bookingMode === 'manual'
    && editingVisit?.manual_visit
    && editingVisit.status === 'Agendada'
    && proposedWorkDaysArePast
    && (user?.role === 'gestor'
      || (technicianMode && editingVisit.assigned_technician === user?.id));
  const unavailableWorkDay = proposedWorkDays.find((day) => blockedDateSet.has(day.date) && day.date >= today);
  const hasTimeConflict = !bookingVisitAlreadyDone && proposedWorkDays.some((day) => technicianVisits.some((visit) => (
    !(editingVisit?.id === visit.id)
    && !(bookingMode === 'request' && visit.id === bookingRequestId)
    && !['Cancelada', 'Concluída'].includes(visit.status)
    && visitOverlapsBooking(visit, day.date, day.start, day.end)
  )));
  const bookingEndNotAfterStart = bookingEndEnabled && bookingEndTime && bookingEndTime <= bookingTime;
  const bookingEndNotPast = bookingVisitAlreadyDone && proposedWorkDays.some((day) => (
    `${day.date}T${day.start}` >= `${today}T${currentTime}`
    || (day.end && `${day.date}T${day.end}` >= `${today}T${currentTime}`)
  ));

  function changeMonth(delta) {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
    setSelectedDate('');
  }

  function openBooking(mode = 'request', visit = null) {
    setError('');
    setSuccess('');
    setBookingMode(mode);
    setEditingVisit(visit);
    setBookingRequestId(mode === 'request' && visit ? visit.id : '');
    setManualCompanyName(mode === 'manual' && visit ? visit.empresa_nome || '' : '');
    setManualCompanyId(mode === 'manual' && visit ? visit.empresa_id || '' : '');
    setManualVisitDescription(mode === 'manual' && visit ? visit.descricao || '' : 'Visita técnica manual');
    const visitWorkDays = visit ? workDaysOf(visit) : [];
    if (visitWorkDays.length) setSelectedDate(visitWorkDays[0].date);
    setAdditionalVisitDays(visitWorkDays.slice(1).map((day) => day.date));
    setBookingEndEnabled(Boolean(visitWorkDays[0]?.end));
    setBookingEndTime(visitWorkDays[0]?.end || '');
    setBookingVisitAlreadyDone(false);
    setBookingTime(visitWorkDays[0]?.start || (selectedDate === today && currentTime > '08:00' ? currentTime : '08:00'));
    const initialCompanyId = visit?.empresa_id;
    const companyUnits = unitsForCompany(initialCompanyId);
    const initialUnitId = visit?.unidade_id || (companyUnits.length === 1 ? companyUnits[0].id : '');
    setBookingUnitId(initialUnitId);
    setBookingAddress(visit?.endereco || unitAddress(units.find((unit) => unit.id === initialUnitId))
      || companies.find((company) => company.id === initialCompanyId)?.endereco || '');
    setBookingOpen(true);
  }

  function closeBooking() {
    if (saving) return;
    setBookingOpen(false);
  }

  function chooseRequest(requestId) {
    setBookingRequestId(requestId);
    setBookingVisitAlreadyDone(false);
    const request = bookableRequests.find((entry) => entry.id === requestId);
    const companyUnits = unitsForCompany(request?.empresa_id);
    const unitId = request?.unidade_id || (companyUnits.length === 1 ? companyUnits[0].id : '');
    setBookingUnitId(unitId);
    setBookingAddress(unitAddress(units.find((unit) => unit.id === unitId))
      || request?.endereco
      || companies.find((company) => company.id === request?.empresa_id)?.endereco || '');
    const days = workDaysOf(request);
    if (days.length) setSelectedDate(days[0].date);
    setAdditionalVisitDays(days.slice(1).map((day) => day.date));
    if (days[0]?.start) setBookingTime(days[0].start);
    setBookingEndEnabled(Boolean(days[0]?.end));
    setBookingEndTime(days[0]?.end || '');
  }

  function chooseManualCompany(value) {
    setManualCompanyName(value);
    const selectedCompany = manualCompanyOptions.find((company) => (
      companyDisplayName(company).toLocaleLowerCase('pt-BR') === value.trim().toLocaleLowerCase('pt-BR')
    ));
    setManualCompanyId(selectedCompany?.id || '');
    const companyUnits = unitsForCompany(selectedCompany?.id);
    const unitId = companyUnits.length === 1 ? companyUnits[0].id : '';
    setBookingUnitId(unitId);
    setBookingAddress(unitAddress(units.find((unit) => unit.id === unitId)) || selectedCompany?.endereco || '');
  }

  function addWorkDay() {
    const currentDays = [selectedDate, ...additionalVisitDays].filter(Boolean).sort();
    if (!currentDays.length) return;
    const nextDay = new Date(`${currentDays[currentDays.length - 1]}T12:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    setAdditionalVisitDays((days) => [...days, dateKey(nextDay)]);
    setBookingVisitAlreadyDone(false);
  }

  function changeWorkDay(index, date) {
    setAdditionalVisitDays((days) => days.map((day, dayIndex) => dayIndex === index ? date : day));
    setBookingVisitAlreadyDone(false);
  }

  async function saveBooking(event, confirmVisitRealizada = false) {
    event.preventDefault();
    if ((bookingMode === 'request' && !selectedBookingRequest) || !selectedDate || !bookingTime || !selectedTechnicianId) {
      setError('Preencha o chamado, a data, o horário e o técnico da visita.');
      return;
    }
    if (!bookingAddress.trim()) {
      setError('Informe o endereço da visita.');
      return;
    }
    if (duplicateWorkDays) {
      setError('Escolha datas diferentes para cada dia de trabalho.');
      return;
    }
    if (additionalDayBeforeStart) {
      setError('Os dias adicionais precisam ser depois do primeiro dia da visita.');
      return;
    }
    if (unavailableWorkDay) {
      setError(`O técnico está indisponível em ${formatDateShort(unavailableWorkDay.date)}. Remova esse dia ou escolha outra data.`);
      return;
    }
    if (bookingEndEnabled && (!bookingEndTime || bookingEndNotAfterStart)) {
      setError('O horário de fim precisa ser preenchido e ser depois do início.');
      return;
    }
    const confirmVisit = confirmVisitRealizada || bookingVisitAlreadyDone;
    if ((confirmVisit && !proposedWorkDaysArePast) || (bookingVisitAlreadyDone && bookingEndNotPast)) {
      setError('Para concluir uma visita passada, todos os dias e horários precisam estar no passado.');
      return;
    }
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      if (bookingMode === 'manual') {
        const editingCompletedManualVisit = editingVisit?.manual_visit && editingVisit.status === 'Concluída';
        const selectedCompany = manualCompanyOptions.find((company) => (
          companyDisplayName(company).toLocaleLowerCase('pt-BR') === manualCompanyName.trim().toLocaleLowerCase('pt-BR')
        ));
        const manualVisitPayload = {
          empresa_id: selectedCompany?.id || null,
          unidade_id: bookingUnitId || null,
          empresa_nome: manualCompanyName.trim(),
          endereco: bookingAddress.trim(),
          descricao: manualVisitDescription.trim() || 'Visita técnica manual',
          agendado_para: proposedSchedule,
          agendado_ate: proposedScheduleEnd || null,
          dias_visita: proposedWorkDays
        };
        if (editingVisit?.manual_visit) {
          await api.patch(`/manual-visits/${editingVisit.id}`, manualVisitPayload);
          if (confirmVisitRealizada) await api.patch(`/manual-visits/${editingVisit.id}/conclude`);
        } else {
          await api.post('/manual-visits', manualVisitPayload);
        }
        setBookingOpen(false);
        setEditingVisit(null);
        setSuccess(editingVisit?.manual_visit
          ? editingCompletedManualVisit
            ? `Agenda da visita concluída para ${manualCompanyName.trim()} atualizada. O atendimento continua concluído.`
            : confirmVisitRealizada
              ? `Agenda da visita para ${manualCompanyName.trim()} atualizada e confirmada como concluída.`
            : `Visita para ${manualCompanyName.trim()} atualizada com ${proposedWorkDays.length} dia(s) de trabalho.`
          : `Visita para ${manualCompanyName.trim()} cadastrada com ${proposedWorkDays.length} dia(s) de trabalho.`);
        await load();
        return;
      }

      const editingCompletedVisit = editingVisit?.status === 'Concluída';
      const requestPayload = {
        assigned_technician: selectedTechnicianId,
        unidade_id: bookingUnitId || null,
        agendado_para: proposedSchedule,
        agendado_ate: proposedScheduleEnd || null,
        dias_visita: proposedWorkDays,
        endereco: bookingAddress.trim(),
        sincronizar_agenda_milvus: !editingCompletedVisit && !confirmVisit
      };
      if (!editingCompletedVisit) {
        requestPayload.status = confirmVisit ? 'Concluída' : 'Agendada';
        requestPayload.visita_realizada = confirmVisit;
      }
      const response = await api.patch(`/requests/${selectedBookingRequest.id}`, requestPayload);
      setBookingOpen(false);
      setEditingVisit(null);
      const milvusSynced = editingCompletedVisit
        ? null
        : confirmVisit
        ? response.data.milvus_visita_sincronizada
        : response.data.agenda_milvus_sincronizada;
      if (milvusSynced === false) {
        setError('A visita foi salva na agenda do site/TV, mas não foi enviada ao Milvus. Confira a integração.');
      } else {
        setSuccess(editingCompletedVisit
          ? `Agenda da visita concluída do chamado #${selectedBookingRequest.numero} atualizada. O atendimento continua concluído.`
          : confirmVisit
          ? `Chamado #${selectedBookingRequest.numero} registrado como visita realizada.`
          : `Chamado #${selectedBookingRequest.numero} agendado em ${proposedWorkDays.length} dia(s) de trabalho.`);
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível agendar esta visita.');
    } finally {
      setSaving(false);
    }
  }

  async function removeVisit(visit) {
    const name = visit.manual_visit
      ? visit.empresa_nome
      : `chamado #${visit.numero}`;
    const completed = visit.status === 'Concluída';
    const completedMessage = visit.manual_visit
      ? 'A conclusão continuará salva no histórico.'
      : 'O chamado voltará para Aberta e poderá receber novas datas. O relatório anterior ficará no histórico.';
    const confirmation = completed
      ? `Excluir ${name} do calendário? ${completedMessage}`
      : visit.manual_visit
        ? `Excluir a visita de ${name} da agenda? Ela será cancelada e a ação ficará no histórico.`
        : `Excluir ${name} da agenda? O chamado voltará para Aberta e ficará disponível para novo agendamento.`;
    if (!window.confirm(confirmation)) return;

    setError('');
    setSuccess('');
    setSaving(true);
    try {
      let response = null;
      if (visit.manual_visit) {
        await api.delete(`/manual-visits/${visit.id}`);
      } else {
        response = await api.delete(`/requests/${visit.id}/agenda`);
      }
      await load();
      if (response?.data?.agenda_milvus_sincronizada === false) {
        setError('A visita saiu da agenda do sistema, mas a atualização não foi enviada ao Milvus. Confira a integração.');
      } else {
        setSuccess(visit.manual_visit
          ? `${completed ? 'Visita concluída' : 'Visita'} de ${visit.empresa_nome} retirada da agenda. A ação foi registrada no histórico.`
          : `Chamado #${visit.numero} voltou para Aberta e ficou disponível para novo agendamento.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível tirar esta visita da agenda.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmVisitCompleted(visit) {
    if (saving || !visit) return;
    const name = visit.manual_visit ? visit.empresa_nome : `chamado #${visit.numero}`;
    const question = visit.manual_visit
      ? `Confirmar que a visita de ${name} foi realizada?`
      : `Confirmar que a visita do chamado #${visit.numero} foi realizada? O chamado será concluído e o pagamento ficará pendente até a confirmação.`;
    if (!window.confirm(question)) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const response = visit.manual_visit
        ? await api.patch(`/manual-visits/${visit.id}/conclude`)
        : await api.patch(`/requests/${visit.id}`, { status: 'Concluída', visita_realizada: true });
      await load();
      if (!visit.manual_visit && response.data.milvus_visita_sincronizada === false) {
        setError('A visita foi concluída no portal, mas o fechamento não foi sincronizado ao Milvus.');
      } else {
        setSuccess(visit.manual_visit
          ? `Visita de ${visit.empresa_nome} confirmada como concluída.`
          : `Visita do chamado #${visit.numero} confirmada como realizada. O pagamento continua pendente até ser confirmado.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível confirmar a visita como realizada.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="schedule-page">
      <div className="schedule-page__header">
        <div>
          <span className="page-eyebrow">MIRONTEC · OPERAÇÕES DE CAMPO</span>
          <h2 className="page-title">Agenda de visitas</h2>
          <p>{canManage
            ? 'Escolha um técnico e agende um chamado diretamente em um dia livre.'
            : 'Veja seus chamados e agende visitas para empresas, mesmo quando ainda não estão cadastradas.'}</p>
          {canManage && <div className="row-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={syncTicketsFromMilvus} disabled={syncingTickets}>
              {syncingTickets ? 'Buscando chamados…' : 'Buscar chamados do Milvus'}
            </button>
            <Link className="btn btn-outline btn-sm" to="/milvus-import">Revisar chamados pendentes</Link>
          </div>}
        </div>
        {canManage && (
          <label className="schedule-technician-picker">
            <span>Técnico</span>
            <select
              className="form-select"
              value={selectedTechnicianId}
              onChange={(event) => { setSelectedTechnicianId(event.target.value); setSelectedDate(''); }}
              disabled={!technicians.length}
            >
              <option value="">{technicians.length ? 'Selecione um técnico' : 'Nenhum técnico ativo'}</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>{technician.nome}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      {loading ? (
        <section className="schedule-empty-card"><p>Carregando agenda…</p></section>
      ) : canManage && technicians.length === 0 ? (
        <section className="schedule-empty-card">
          <div className="schedule-empty-card__icon">＋</div>
          <h3>Cadastre ou ative um técnico</h3>
          <p>Para agendar, cadastre ou ative um técnico e vincule a conta dele ao Milvus.</p>
          <Link className="btn btn-primary" to="/users">Abrir usuários</Link>
        </section>
      ) : (
        <div className="schedule-workspace">
          <section className="schedule-calendar-card" aria-label="Agenda mensal">
            <div className="schedule-calendar-toolbar">
              <div className="schedule-calendar-toolbar__month">
                <strong>{formatMonth(cursor.year, cursor.month)}</strong>
                <span>Sem limite fixo de horário</span>
              </div>
              <div className="schedule-calendar-toolbar__controls">
                <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">‹</button>
                <button type="button" onClick={() => { setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() }); setSelectedDate(today); }}>Hoje</button>
                <button type="button" onClick={() => changeMonth(1)} aria-label="Mês seguinte">›</button>
              </div>
            </div>
            <div className="schedule-weekdays">
              {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="schedule-grid">
              {cells.map((cell) => {
                if (cell.empty) return <div className="schedule-day schedule-day--empty" key={cell.key} />;
                const isToday = cell.key === today;
                const isSelected = cell.key === selectedDate;
                const unavailable = blockedDateSet.has(cell.key);
                const visits = visitsByDate[cell.key] || [];
                const classes = [
                  'schedule-day',
                  isToday && 'is-today',
                  isSelected && 'is-selected',
                  unavailable && 'is-unavailable'
                ].filter(Boolean).join(' ');
                return (
                  <button
                    className={classes}
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedDate(cell.key)}
                    aria-pressed={isSelected}
                    aria-label={`${formatDate(cell.key)}${unavailable ? ', indisponível' : ', disponível'}, ${visits.length} visita(s)`}
                  >
                    <span className="schedule-day__number">{cell.day}</span>
                    {unavailable && <span className="schedule-day__blocked">Indisponível</span>}
                    {!unavailable && canManage && visits.length === 0 && cell.key >= today && <span className="schedule-day__free">Livre</span>}
                    <span className="schedule-day__events">
                      {visits.slice(0, 3).map((visit) => (
                        <span
                          className={`schedule-event schedule-event--${visitVisualState(visit).kind}`}
                          key={visit.id}
                          title={`${visit.dias_visita_total > 1 ? `Dia ${visit.dia_visita_index} de ${visit.dias_visita_total} · ` : ''}${visitVisualState(visit).label} · ${timeRangeOf(visit)} · ${visit.descricao}`}
                        >
                          <span className="schedule-event__marker" aria-hidden="true">{visitVisualState(visit).icon}</span>
                          <b>{timeRangeOf(visit)}</b> {visit.descricao}
                        </span>
                      ))}
                      {visits.length > 3 && <span className="schedule-event-more">+{visits.length - 3} mais</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="schedule-legend">
              <span><b className="schedule-legend__icon schedule-legend__icon--completed">✓</b> Visita realizada</span>
              <span><b className="schedule-legend__icon schedule-legend__icon--pending">🕒</b> Visita pendente</span>
              <span><b className="schedule-legend__icon schedule-legend__icon--overdue">⚠️</b> Data/horário passou</span>
              <span><i className="schedule-legend__free" /> Livre para agendamento</span>
              <span><i className="schedule-legend__blocked" /> Técnico indisponível</span>
            </div>
          </section>

          <aside className="schedule-day-panel">
            <div className="schedule-day-panel__header">
              <div>
                <span className="page-eyebrow">{selectedTechnician?.nome || (technicianMode ? 'MINHA AGENDA' : 'DIA SELECIONADO')}</span>
                <h3>{selectedDate ? formatDate(selectedDate) : 'Escolha um dia'}</h3>
              </div>
              {selectedDate && <span className={selectedDateUnavailable ? 'schedule-status schedule-status--blocked' : 'schedule-status schedule-status--free'}>
                {selectedDate < today ? 'Data passada' : selectedDateUnavailable ? 'Indisponível' : 'Livre para agendamento'}
              </span>}
            </div>
            {selectedDate ? (
              <>
                {selectedDateUnavailable && <p className="schedule-day-panel__note">O técnico bloqueou esta data. Escolha outro dia para agendar.</p>}
                {!selectedDateUnavailable && dayVisits.length === 0 && <p className="schedule-day-panel__note">{selectedDate < today ? 'Nenhuma visita registrada neste dia. Você ainda pode lançar um agendamento atrasado.' : 'Nenhuma visita neste dia. Escolha o horário de atendimento conforme a necessidade.'}</p>}
                <div className="schedule-visit-list">
                  {dayVisits.map((visit) => {
                    const visitUnit = units.find((unit) => unit.id === visit.unidade_id);
                    const canEditVisit = (canManage && !['Concluída', 'Cancelada', 'Em Atendimento'].includes(visit.status))
                      || (user?.role === 'gestor' && visit.status === 'Concluída')
                      || (technicianMode && visit.manual_visit && visit.assigned_technician === user?.id && !['Concluída', 'Cancelada'].includes(visit.status));
                    const visitCanBeRemoved = !['Cancelada', 'Em Atendimento'].includes(visit.status);
                    const canRemoveVisit = (user?.role === 'gestor' && visitCanBeRemoved)
                      || (technicianMode && visit.assigned_technician === user?.id && visitCanBeRemoved);
                    const canConfirmVisit = canConfirmVisitAsCompleted(visit, today, currentTime)
                      && (user?.role === 'gestor'
                        || (visit.manual_visit && technicianMode && visit.assigned_technician === user?.id));
                    return <article className={`schedule-visit schedule-visit--${visitVisualState(visit).kind}`} key={`${visit.id}-${visit.agendado_para}`}>
                      <div className={`schedule-visit__time schedule-visit__time--${visitVisualState(visit).kind}`}>
                        <span aria-hidden="true">{visitVisualState(visit).icon}</span> {timeRangeOf(visit)}
                      </div>
                      <div>
                        <strong>{visit.descricao}</strong>
                        <span>{visit.empresa_nome || companies.find((company) => company.id === visit.empresa_id)?.nome_fantasia || companies.find((company) => company.id === visit.empresa_id)?.razao_social || 'Empresa'}</span>
                        {visitUnit && <small>{visitUnit.tipo}: {visitUnit.nome}</small>}
                        {visit.endereco && <small>{visit.endereco}</small>}
                        <span className={`schedule-visit__status schedule-visit__status--${visitVisualState(visit).kind}`}>
                          {visit.dias_visita_total > 1 ? `Dia ${visit.dia_visita_index} de ${visit.dias_visita_total} · ` : ''}{visitVisualState(visit).label} · {visit.status}{visit.confirmacao_tecnico === 'confirmada' ? ' · Técnico confirmou' : ''}
                        </span>
                        {(canEditVisit || canRemoveVisit || canConfirmVisit) && (
                          <div className="schedule-visit__actions">
                            {canEditVisit && <button type="button" onClick={() => openBooking(visit.manual_visit ? 'manual' : 'request', visit)} disabled={saving}>Editar</button>}
                            {canConfirmVisit && <button type="button" className="schedule-visit__complete" onClick={() => confirmVisitCompleted(visit)} disabled={saving}>Concluir visita</button>}
                            {canRemoveVisit && <button type="button" className="schedule-visit__remove" onClick={() => removeVisit(visit)} disabled={saving}>
                              {visit.status === 'Concluída' ? 'Excluir do calendário' : 'Excluir da agenda'}
                            </button>}
                          </div>
                        )}
                      </div>
                    </article>;
                  })}
                </div>
                {canManage && !selectedDateUnavailable && selectedTechnicianId && (
                  <button type="button" className="schedule-add-button" onClick={openBooking}>
                    <span>＋</span> {selectedDate < today ? 'Registrar visita atrasada neste dia' : 'Agendar chamado neste dia'}
                  </button>
                )}
                {technicianMode && !selectedDateUnavailable && (
                  <button type="button" className="schedule-add-button schedule-add-button--manual" onClick={() => openBooking('manual')}>
                    <span>＋</span> Agendar visita para uma empresa
                  </button>
                )}
              </>
            ) : (
              <p className="schedule-day-panel__note">Clique em qualquer data para ver os horários e visitas.</p>
            )}
          </aside>
        </div>
      )}

      {bookingOpen && (
        <div className="checkout-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeBooking()}>
          <form className="checkout-modal__dialog schedule-booking-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-booking-title" onSubmit={saveBooking}>
            <div className="checkout-modal__header">
              <div>
                <span className="checkout-modal__eyebrow">{editingVisit ? 'ALTERAR AGENDAMENTO' : bookingMode === 'manual' ? 'VISITA MANUAL' : 'NOVO COMPROMISSO'}</span>
                <h3 id="schedule-booking-title">{editingVisit ? 'Editar visita' : 'Agendar visita'}</h3>
                <p>{selectedTechnician?.nome || user?.nome || 'Técnico'} · {formatDate(selectedDate)}</p>
              </div>
              <button type="button" className="checkout-modal__close" onClick={closeBooking} aria-label="Fechar">×</button>
            </div>
            <div className="checkout-modal__body">
              {bookingMode === 'manual' ? (
                <>
                  <label className="form-field">
                    Empresa
                    <input
                      className="form-input"
                      list="manual-visit-company-options"
                      value={manualCompanyName}
                      onChange={(event) => chooseManualCompany(event.target.value)}
                      placeholder="Selecione ou digite o nome da empresa"
                      maxLength={160}
                      autoComplete="off"
                      required
                    />
                    <datalist id="manual-visit-company-options">
                      {manualCompanyOptions.map((company) => <option key={company.id} value={company.nome} />)}
                    </datalist>
                    <small className="detail-muted">Se não aparecer na lista, digite o nome. Ele ficará salvo nesta visita.</small>
                  </label>
                  <label className="form-field">
                    Descrição da visita
                    <input className="form-input" value={manualVisitDescription} onChange={(event) => setManualVisitDescription(event.target.value)} maxLength={300} placeholder="Ex.: manutenção preventiva" />
                  </label>
                  <label className="form-field">
                    Filial / sede
                    <select
                      className="form-select"
                      value={bookingUnitId}
                      onChange={(event) => {
                        const id = event.target.value;
                        setBookingUnitId(id);
                        const company = manualCompanyOptions.find((item) => item.id === manualCompanyId);
                        setBookingAddress(unitAddress(units.find((unit) => unit.id === id)) || company?.endereco || '');
                      }}
                      disabled={!manualCompanyId || unitsForCompany(manualCompanyId).length === 0}
                    >
                      <option value="">{manualCompanyId ? 'Endereço principal da empresa' : 'Selecione uma empresa primeiro'}</option>
                      {unitsForCompany(manualCompanyId).map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.tipo} — {unit.nome}{unit.endereco ? ` · ${unit.endereco}` : ''}</option>
                      ))}
                    </select>
                    {manualCompanyId && unitsForCompany(manualCompanyId).length === 0 && <small className="detail-muted">Nenhuma filial importada para essa empresa. Sincronize os endereços do Milvus em “Cadastrar Filial”.</small>}
                  </label>
                </>
              ) : (
                <label className="form-field">
                  Chamado
                  <select className="form-select" value={bookingRequestId} onChange={(event) => chooseRequest(event.target.value)} required>
                    <option value="">Selecione um chamado em aberto</option>
                    {bookableRequests.map((request) => (
                      <option key={request.id} value={request.id}>
                        #{request.numero} · {companyDisplayName(companies.find((company) => company.id === request.empresa_id))} · {request.descricao} {request.status === 'Agendada' ? '(reagendar)' : ''}
                      </option>
                    ))}
                  </select>
                  {bookableRequests.length === 0 && <small className="detail-muted">Não há chamados vinculados ao Milvus aguardando agendamento.</small>}
                </label>
              )}
              {bookingMode === 'request' && selectedBookingRequest && (
                <>
                  <label className="form-field">
                    Empresa
                    <input className="form-input" value={companyDisplayName(companies.find((company) => company.id === selectedBookingRequest.empresa_id))} readOnly />
                  </label>
                  <label className="form-field">
                    Filial / sede
                    <select
                      className="form-select"
                      value={bookingUnitId}
                      onChange={(event) => {
                        const id = event.target.value;
                        setBookingUnitId(id);
                        setBookingAddress(unitAddress(units.find((unit) => unit.id === id))
                          || companies.find((company) => company.id === selectedBookingRequest.empresa_id)?.endereco || '');
                      }}
                      disabled={unitsForCompany(selectedBookingRequest.empresa_id).length === 0}
                    >
                      <option value="">Endereço principal da empresa</option>
                      {unitsForCompany(selectedBookingRequest.empresa_id).map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.tipo} — {unit.nome}{unit.endereco ? ` · ${unit.endereco}` : ''}</option>
                      ))}
                    </select>
                    {unitsForCompany(selectedBookingRequest.empresa_id).length === 0 && <small className="detail-muted">Nenhuma filial importada para essa empresa. Sincronize os endereços do Milvus em “Cadastrar Filial”.</small>}
                  </label>
                </>
              )}
              <div className="schedule-booking-dialog__grid">
                <label className="form-field">
                  Primeiro dia
                  <input className="form-input" type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setBookingVisitAlreadyDone(false); }} required />
                </label>
                <label className="form-field">
                  Horário de início
                  <input className="form-input" type="time" value={bookingTime} onChange={(event) => { setBookingTime(event.target.value); setBookingVisitAlreadyDone(false); }} required />
                </label>
              </div>
              {additionalVisitDays.length > 0 && (
                <div className="schedule-extra-days">
                  <p>Mais dias de trabalho <small>O horário configurado acima vale para todos os dias.</small></p>
                  {additionalVisitDays.map((day, index) => (
                    <div className="schedule-extra-day" key={`workday-${index}`}>
                      <label className="form-field">
                        Dia {index + 2}
                        <input className="form-input" type="date" value={day} onChange={(event) => changeWorkDay(index, event.target.value)} required />
                      </label>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAdditionalVisitDays((days) => days.filter((_, dayIndex) => dayIndex !== index)); setBookingVisitAlreadyDone(false); }} disabled={saving}>
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="schedule-add-workday" onClick={addWorkDay} disabled={!selectedDate || saving}>
                ＋ Adicionar dia trabalhado
              </button>
              <label className="schedule-booking-dialog__end-toggle">
                <input type="checkbox" checked={bookingEndEnabled} onChange={(event) => setBookingEndEnabled(event.target.checked)} />
                <span>Adicionar horário de fim (opcional)</span>
              </label>
              {bookingEndEnabled && (
                <label className="form-field schedule-booking-dialog__end-time">
                  Horário de fim
                  <input className="form-input" type="time" value={bookingEndTime} onChange={(event) => { setBookingEndTime(event.target.value); setBookingVisitAlreadyDone(false); }} required />
                </label>
              )}
              {bookingEndNotAfterStart && <p className="schedule-booking-dialog__conflict">O horário de fim precisa ser depois do início.</p>}
              {hasTimeConflict && <p className="schedule-booking-dialog__conflict">O técnico já tem outra visita nesse horário. Escolha outro horário.</p>}
              {editingVisit?.status === 'Concluída' && <p className="schedule-day-panel__note">{editingVisit.manual_visit ? 'A visita continuará concluída; você está alterando apenas os dados da agenda.' : 'A conclusão, o check-in e o relatório serão mantidos. Você está alterando apenas os dados da agenda.'}</p>}
              {bookingMode === 'request' && user?.role === 'gestor' && proposedWorkDaysArePast
                && !['Concluída', 'Cancelada'].includes(editingVisit?.status) && (
                <label className="schedule-booking-dialog__completed-confirm">
                  <input type="checkbox" checked={bookingVisitAlreadyDone} onChange={(event) => setBookingVisitAlreadyDone(event.target.checked)} />
                  <span><strong>A visita já foi realizada?</strong><small>Marque para concluir o chamado. Sem marcar, ele ficará como visita atrasada e pendente.</small></span>
                </label>
              )}
              <label className="form-field">
                Endereço da visita
                <input className="form-input" value={bookingAddress} onChange={(event) => setBookingAddress(event.target.value)} placeholder="Rua, número, bairro e cidade" required />
              </label>
              {bookingMode === 'request' && selectedBookingRequest?.agendado_para && <p className="schedule-booking-dialog__previous">Horário atual do chamado: {formatDateShort(String(selectedBookingRequest.agendado_para).slice(0, 10))} às {timeRangeOf(selectedBookingRequest)}.</p>}
            </div>
            <div className="checkout-modal__footer">
              <button type="button" className="btn btn-outline" onClick={closeBooking} disabled={saving}>Cancelar</button>
              {canConcludeScheduledVisit && (
                <button type="button" className="btn btn-primary" onClick={(event) => saveBooking(event, true)} disabled={saving || !bookingAddress.trim() || !bookingTime || duplicateWorkDays || additionalDayBeforeStart || (bookingEndEnabled && (!bookingEndTime || bookingEndNotAfterStart))}>
                  {saving ? 'Concluindo visita…' : 'Concluir visita'}
                </button>
              )}
              {canConcludeManualVisit && (
                <button type="button" className="btn btn-primary" onClick={(event) => saveBooking(event, true)} disabled={saving || !manualCompanyName.trim() || !bookingAddress.trim() || !bookingTime || duplicateWorkDays || additionalDayBeforeStart || (bookingEndEnabled && (!bookingEndTime || bookingEndNotAfterStart))}>
                  {saving ? 'Concluindo visita…' : 'Concluir visita'}
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving || (bookingMode === 'request' && !selectedBookingRequest) || (bookingMode === 'manual' && !manualCompanyName.trim()) || !bookingAddress.trim() || hasTimeConflict || (bookingEndEnabled && (!bookingEndTime || bookingEndNotAfterStart)) || bookingEndNotPast}>
                {saving ? 'Salvando agenda…' : bookingVisitAlreadyDone ? 'Concluir visita' : editingVisit ? 'Salvar alterações' : bookingMode === 'manual' ? 'Agendar visita' : 'Confirmar agendamento'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
