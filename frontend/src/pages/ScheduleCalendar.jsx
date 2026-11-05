import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';
import './ScheduleCalendar.css';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

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

function companyDisplayName(company) {
  return String(company?.nome || company?.nome_fantasia || company?.razao_social || '').trim();
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
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
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
  const [bookingMode, setBookingMode] = useState('request');
  const [editingVisit, setEditingVisit] = useState(null);
  const [manualCompanyName, setManualCompanyName] = useState('');
  const [manualVisitDescription, setManualVisitDescription] = useState('Visita técnica manual');
  const [bookingTime, setBookingTime] = useState('08:00');
  const [bookingEndEnabled, setBookingEndEnabled] = useState(false);
  const [bookingEndTime, setBookingEndTime] = useState('');
  const [bookingVisitAlreadyDone, setBookingVisitAlreadyDone] = useState(false);
  const [bookingAddress, setBookingAddress] = useState('');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [requestResponse, companyResponse, manualVisitResponse] = await Promise.all([
        api.get('/requests'), api.get('/companies'), api.get('/manual-visits')
      ]);
      setRequests(requestResponse.data);
      setCompanies(companyResponse.data);
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

  const selectedTechnician = technicians.find((entry) => entry.id === selectedTechnicianId);
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
    )),
    ...manualVisits.filter((visit) => (
      visit.assigned_technician === selectedTechnicianId
      && visit.agendado_para
      && visit.status !== 'Cancelada'
    ))
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
    && ['Aberta', 'Agendada'].includes(request.status)
    && !request.hora_checkin
    && !request.hora_checkout
  ));
  const selectedBookingRequest = bookableRequests.find((request) => request.id === bookingRequestId);
  const proposedSchedule = selectedDate ? `${selectedDate}T${bookingTime}` : '';
  const proposedScheduleEnd = bookingEndEnabled && selectedDate && bookingEndTime
    ? `${selectedDate}T${bookingEndTime}`
    : '';
  const bookingSlotIsPast = Boolean(proposedSchedule && proposedSchedule < `${today}T${currentTime}`);
  const hasTimeConflict = !bookingVisitAlreadyDone && technicianVisits.some((visit) => (
    !(editingVisit?.id === visit.id)
    &&
    !(bookingMode === 'request' && visit.id === bookingRequestId)
    && !['Cancelada', 'Concluída'].includes(visit.status)
    && visitOverlapsBooking(visit, selectedDate, bookingTime, bookingEndEnabled ? bookingEndTime : '')
  ));
  const bookingEndNotAfterStart = bookingEndEnabled && bookingEndTime && bookingEndTime <= bookingTime;
  const bookingEndNotPast = bookingVisitAlreadyDone && proposedScheduleEnd
    && proposedScheduleEnd >= `${today}T${currentTime}`;

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
    setManualVisitDescription(mode === 'manual' && visit ? visit.descricao || '' : 'Visita técnica manual');
    if (visit?.agendado_para) setSelectedDate(String(visit.agendado_para).slice(0, 10));
    setBookingEndEnabled(Boolean(visit?.agendado_ate));
    setBookingEndTime(visit?.agendado_ate ? timeOf(visit.agendado_ate) : '');
    setBookingVisitAlreadyDone(false);
    setBookingTime(visit?.agendado_para
      ? timeOf(visit.agendado_para)
      : selectedDate === today && currentTime > '08:00' ? currentTime : '08:00');
    setBookingAddress(visit?.endereco || '');
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
    setBookingAddress(request?.endereco || '');
    const startTime = timeOf(request?.agendado_para);
    if (startTime !== 'Horário não definido') setBookingTime(startTime);
    const endTime = timeOf(request?.agendado_ate);
    setBookingEndEnabled(endTime !== 'Horário não definido');
    setBookingEndTime(endTime === 'Horário não definido' ? '' : endTime);
  }

  function chooseManualCompany(value) {
    setManualCompanyName(value);
    const selectedCompany = manualCompanyOptions.find((company) => (
      companyDisplayName(company).toLocaleLowerCase('pt-BR') === value.trim().toLocaleLowerCase('pt-BR')
    ));
    if (selectedCompany?.endereco && !bookingAddress.trim()) setBookingAddress(selectedCompany.endereco);
  }

  async function saveBooking(event) {
    event.preventDefault();
    if ((bookingMode === 'request' && !selectedBookingRequest) || !selectedDate || !selectedTechnicianId) return;
    if (bookingEndEnabled && (!bookingEndTime || bookingEndNotAfterStart)) {
      setError('O horário de fim precisa ser preenchido e ser depois do início.');
      return;
    }
    if (bookingEndNotPast) {
      setError('Como a visita já foi realizada, o horário de fim também precisa estar no passado.');
      return;
    }
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      if (bookingMode === 'manual') {
        const selectedCompany = manualCompanyOptions.find((company) => (
          companyDisplayName(company).toLocaleLowerCase('pt-BR') === manualCompanyName.trim().toLocaleLowerCase('pt-BR')
        ));
        const manualVisitPayload = {
          empresa_id: selectedCompany?.id || null,
          empresa_nome: manualCompanyName.trim(),
          endereco: bookingAddress.trim(),
          descricao: manualVisitDescription.trim() || 'Visita técnica manual',
          agendado_para: proposedSchedule,
          agendado_ate: proposedScheduleEnd || null
        };
        if (editingVisit?.manual_visit) {
          await api.patch(`/manual-visits/${editingVisit.id}`, manualVisitPayload);
        } else {
          await api.post('/manual-visits', manualVisitPayload);
        }
        setBookingOpen(false);
        setEditingVisit(null);
        setSuccess(editingVisit?.manual_visit
          ? `Visita para ${manualCompanyName.trim()} atualizada na agenda.`
          : `Visita para ${manualCompanyName.trim()} cadastrada na agenda de ${formatDateShort(selectedDate)}.`);
        await load();
        return;
      }

      const response = await api.patch(`/requests/${selectedBookingRequest.id}`, {
        status: bookingVisitAlreadyDone ? 'Concluída' : 'Agendada',
        assigned_technician: selectedTechnicianId,
        agendado_para: proposedSchedule,
        agendado_ate: proposedScheduleEnd || null,
        visita_realizada: bookingVisitAlreadyDone,
        endereco: bookingAddress.trim(),
        sincronizar_responsaveis_milvus: true
      });
      setBookingOpen(false);
      setEditingVisit(null);
      const milvusSynced = bookingVisitAlreadyDone
        ? response.data.milvus_visita_sincronizada
        : response.data.agenda_milvus_sincronizada;
      if (milvusSynced === false) {
        setError('A visita foi salva na agenda do site/TV, mas não foi enviada ao Milvus. Confira a integração.');
      } else {
        setSuccess(bookingVisitAlreadyDone
          ? `Chamado #${selectedBookingRequest.numero} registrado como visita realizada.`
          : `Chamado #${selectedBookingRequest.numero} agendado para ${timeRangeOf({ agendado_para: proposedSchedule, agendado_ate: proposedScheduleEnd })} em ${formatDateShort(selectedDate)}.`);
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
    if (!window.confirm(`Tirar ${name} da agenda? O sistema registrará a ação no histórico.`)) return;

    setError('');
    setSuccess('');
    setSaving(true);
    try {
      let response = null;
      if (visit.manual_visit) {
        await api.delete(`/manual-visits/${visit.id}`);
      } else {
        response = await api.patch(`/requests/${visit.id}`, {
          status: 'Aberta',
          agendado_para: null,
          agendado_ate: null
        });
      }
      await load();
      if (response?.data?.agenda_milvus_sincronizada === false) {
        setError('A visita saiu da agenda do sistema, mas a atualização não foi enviada ao Milvus. Confira a integração.');
      } else {
        setSuccess(visit.manual_visit
          ? `Visita de ${visit.empresa_nome} retirada da agenda. A ação foi registrada no histórico.`
          : `Chamado #${visit.numero} reaberto e retirado da agenda. A ação foi registrada no histórico.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível tirar esta visita da agenda.');
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
                        <span className="schedule-event" key={visit.id} title={`${timeRangeOf(visit)} · ${visit.descricao}`}>
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
              <span><i className="schedule-legend__free" /> Livre para agendamento</span>
              <span><i className="schedule-legend__busy" /> Visita marcada</span>
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
                  {dayVisits.map((visit) => (
                    <article className="schedule-visit" key={visit.id}>
                      <div className="schedule-visit__time">{timeRangeOf(visit)}</div>
                      <div>
                        <strong>{visit.descricao}</strong>
                        <span>{visit.empresa_nome || companies.find((company) => company.id === visit.empresa_id)?.nome_fantasia || companies.find((company) => company.id === visit.empresa_id)?.razao_social || 'Empresa'}</span>
                        {visit.endereco && <small>{visit.endereco}</small>}
                        <span className="schedule-visit__status">{visit.status}{visit.confirmacao_tecnico === 'confirmada' ? ' · Técnico confirmou' : ''}</span>
                        {((canManage && !['Concluída', 'Cancelada', 'Em Atendimento'].includes(visit.status))
                          || (technicianMode && visit.manual_visit && visit.assigned_technician === user?.id && !['Concluída', 'Cancelada'].includes(visit.status))) && (
                          <div className="schedule-visit__actions">
                            <button type="button" onClick={() => openBooking(visit.manual_visit ? 'manual' : 'request', visit)} disabled={saving}>
                              Editar
                            </button>
                            <button type="button" className="schedule-visit__remove" onClick={() => removeVisit(visit)} disabled={saving}>
                              Tirar da agenda
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
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
                </>
              ) : (
                <label className="form-field">
                  Chamado
                  <select className="form-select" value={bookingRequestId} onChange={(event) => chooseRequest(event.target.value)} required>
                    <option value="">Selecione um chamado em aberto</option>
                    {bookableRequests.map((request) => (
                      <option key={request.id} value={request.id}>
                        #{request.numero} · {request.descricao} {request.status === 'Agendada' ? '(reagendar)' : ''}
                      </option>
                    ))}
                  </select>
                  {bookableRequests.length === 0 && <small className="detail-muted">Não há chamados vinculados ao Milvus aguardando agendamento.</small>}
                </label>
              )}
              <div className="schedule-booking-dialog__grid">
                <label className="form-field">
                  Dia
                  <input className="form-input" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} required />
                </label>
                <label className="form-field">
                  Horário de início
                  <input className="form-input" type="time" value={bookingTime} onChange={(event) => { setBookingTime(event.target.value); setBookingVisitAlreadyDone(false); }} required />
                </label>
              </div>
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
              {bookingMode === 'request' && bookingSlotIsPast && (
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
              <button type="submit" className="btn btn-primary" disabled={saving || (bookingMode === 'request' && !selectedBookingRequest) || (bookingMode === 'manual' && !manualCompanyName.trim()) || !bookingAddress.trim() || hasTimeConflict || (bookingEndEnabled && (!bookingEndTime || bookingEndNotAfterStart)) || bookingEndNotPast}>
                {saving ? 'Salvando agenda…' : editingVisit ? 'Salvar alterações' : bookingMode === 'manual' ? 'Agendar visita' : bookingVisitAlreadyDone ? 'Confirmar visita realizada' : 'Confirmar agendamento'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
