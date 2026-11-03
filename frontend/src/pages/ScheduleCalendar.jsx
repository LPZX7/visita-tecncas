import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';
import './ScheduleCalendar.css';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const OPENING_TIME = '07:00';
const CLOSING_TIME = '15:00';

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
  const [companies, setCompanies] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [unavailableDates, setUnavailableDates] = useState([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(technicianMode ? user?.id || '' : '');
  const [cursor, setCursor] = useState(() => {
    const date = new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [bookingRequestId, setBookingRequestId] = useState('');
  const [bookingTime, setBookingTime] = useState('08:00');
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
      const [requestResponse, companyResponse] = await Promise.all([api.get('/requests'), api.get('/companies')]);
      setRequests(requestResponse.data);
      setCompanies(companyResponse.data);
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
        const response = await api.get('/technician-availability');
        setUnavailableDates(response.data.map((entry) => ({ ...entry, technician_id: user.id })));
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
  const minimumBookingTime = selectedDate === today && currentTime > OPENING_TIME ? currentTime : OPENING_TIME;
  const blockedDateSet = useMemo(() => new Set(
    unavailableDates
      .filter((entry) => entry.technician_id === selectedTechnicianId)
      .map((entry) => String(entry.date).slice(0, 10))
  ), [unavailableDates, selectedTechnicianId]);
  const technicianRequests = requests.filter((request) => (
    request.assigned_technician === selectedTechnicianId
    && request.agendado_para
    && request.status !== 'Cancelada'
  ));
  const visitsByDate = useMemo(() => technicianRequests.reduce((result, request) => {
    const day = String(request.agendado_para).slice(0, 10);
    result[day] ||= [];
    result[day].push(request);
    result[day].sort((a, b) => String(a.agendado_para).localeCompare(String(b.agendado_para)));
    return result;
  }, {}), [requests, selectedTechnicianId]);
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
  const bookingSlotIsPast = Boolean(proposedSchedule && proposedSchedule < `${today}T${currentTime}`);
  const hasTimeConflict = !bookingVisitAlreadyDone && technicianRequests.some((request) => (
    request.id !== bookingRequestId
    && String(request.agendado_para).slice(0, 10) === selectedDate
    && timeOf(request.agendado_para) === bookingTime
  ));
  const bookingTimeOutsideRange = bookingTime < minimumBookingTime || bookingTime > CLOSING_TIME;

  function changeMonth(delta) {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
    setSelectedDate('');
  }

  function openBooking() {
    setError('');
    setSuccess('');
    setBookingRequestId('');
    setBookingVisitAlreadyDone(false);
    setBookingTime(selectedDate === today && currentTime > '08:00' && currentTime <= CLOSING_TIME ? currentTime : '08:00');
    setBookingAddress('');
    setBookingOpen(true);
  }

  function closeBooking() {
    if (saving) return;
    setBookingOpen(false);
  }

  function chooseRequest(requestId) {
    setBookingRequestId(requestId);
    const request = bookableRequests.find((entry) => entry.id === requestId);
    setBookingAddress(request?.endereco || '');
  }

  async function saveBooking(event) {
    event.preventDefault();
    if (!selectedBookingRequest || !selectedDate || !selectedTechnicianId) return;
    if (bookingSlotIsPast && !bookingVisitAlreadyDone) {
      setError('Esse horário já passou. Confirme se a visita foi realizada ou escolha uma data futura.');
      return;
    }
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api.patch(`/requests/${selectedBookingRequest.id}`, {
        status: bookingVisitAlreadyDone ? 'Concluída' : 'Agendada',
        assigned_technician: selectedTechnicianId,
        agendado_para: proposedSchedule,
        visita_realizada: bookingVisitAlreadyDone,
        endereco: bookingAddress.trim(),
        sincronizar_responsaveis_milvus: true
      });
      setBookingOpen(false);
      setSuccess(bookingVisitAlreadyDone
        ? `Chamado #${selectedBookingRequest.numero} registrado como visita realizada.`
        : `Chamado #${selectedBookingRequest.numero} agendado para ${timeOf(proposedSchedule)} em ${formatDateShort(selectedDate)}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível agendar esta visita.');
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
            : 'Veja seus chamados e os dias em que você marcou indisponibilidade.'}</p>
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
                <span>Expediente padrão {OPENING_TIME}–{CLOSING_TIME}</span>
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
                        <span className="schedule-event" key={visit.id} title={`${timeOf(visit.agendado_para)} · ${visit.descricao}`}>
                          <b>{timeOf(visit.agendado_para)}</b> {visit.descricao}
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
                {selectedDateUnavailable ? 'Indisponível' : 'Livre · 07h–15h'}
              </span>}
            </div>
            {selectedDate ? (
              <>
                {selectedDateUnavailable && <p className="schedule-day-panel__note">O técnico bloqueou esta data. Escolha outro dia para agendar.</p>}
                {!selectedDateUnavailable && dayVisits.length === 0 && <p className="schedule-day-panel__note">Nenhuma visita neste dia. Expediente disponível das 07h às 15h.</p>}
                <div className="schedule-visit-list">
                  {dayVisits.map((visit) => (
                    <article className="schedule-visit" key={visit.id}>
                      <div className="schedule-visit__time">{timeOf(visit.agendado_para)}</div>
                      <div>
                        <strong>{visit.descricao}</strong>
                        <span>{companies.find((company) => company.id === visit.empresa_id)?.razao_social || 'Empresa'}</span>
                        {visit.endereco && <small>{visit.endereco}</small>}
                        <span className="schedule-visit__status">{visit.status}{visit.confirmacao_tecnico === 'confirmada' ? ' · Técnico confirmou' : ''}</span>
                      </div>
                    </article>
                  ))}
                </div>
                {canManage && selectedDate >= today && !selectedDateUnavailable && selectedTechnicianId && (
                  <button type="button" className="schedule-add-button" onClick={openBooking}>
                    <span>＋</span> Agendar chamado neste dia
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
                <span className="checkout-modal__eyebrow">NOVO COMPROMISSO</span>
                <h3 id="schedule-booking-title">Agendar visita</h3>
                <p>{selectedTechnician?.nome} · {formatDate(selectedDate)}</p>
              </div>
              <button type="button" className="checkout-modal__close" onClick={closeBooking} aria-label="Fechar">×</button>
            </div>
            <div className="checkout-modal__body">
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
              <div className="schedule-booking-dialog__grid">
                <label className="form-field">
                  Dia
                  <input className="form-input" type="date" value={selectedDate} min={today} readOnly />
                </label>
                <label className="form-field">
                  Horário
                  <input className="form-input" type="time" value={bookingTime} onChange={(event) => { setBookingTime(event.target.value); setBookingVisitAlreadyDone(false); }} required />
                </label>
              </div>
              {hasTimeConflict && <p className="schedule-booking-dialog__conflict">O técnico já tem outra visita nesse horário. Escolha outro horário.</p>}
              {bookingSlotIsPast ? (
                <label className="schedule-booking-dialog__completed-confirm">
                  <input type="checkbox" checked={bookingVisitAlreadyDone} onChange={(event) => setBookingVisitAlreadyDone(event.target.checked)} />
                  <span><strong>A visita já foi realizada?</strong><small>Marque para registrar o chamado como concluído. Se ainda não aconteceu, escolha uma data futura.</small></span>
                </label>
              ) : bookingTimeOutsideRange ? (
                <p className="schedule-booking-dialog__conflict">O expediente é das 07h às 15h. Escolha um horário dentro desse período.</p>
              ) : null}
              <label className="form-field">
                Endereço da visita
                <input className="form-input" value={bookingAddress} onChange={(event) => setBookingAddress(event.target.value)} placeholder="Rua, número, bairro e cidade" required />
              </label>
              {selectedBookingRequest?.agendado_para && <p className="schedule-booking-dialog__previous">Horário atual do chamado: {formatDateShort(String(selectedBookingRequest.agendado_para).slice(0, 10))} às {timeOf(selectedBookingRequest.agendado_para)}.</p>}
            </div>
            <div className="checkout-modal__footer">
              <button type="button" className="btn btn-outline" onClick={closeBooking} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !selectedBookingRequest || !bookingAddress.trim() || hasTimeConflict || (bookingTimeOutsideRange && !bookingVisitAlreadyDone) || (bookingSlotIsPast && !bookingVisitAlreadyDone)}>
                {saving ? 'Salvando agenda…' : bookingVisitAlreadyDone ? 'Confirmar visita realizada' : 'Confirmar agendamento'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
