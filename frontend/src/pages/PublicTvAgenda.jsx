import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './PublicTvAgenda.css';

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function buildMonthDays(year, month, today) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month, 1 - firstWeekday + index));
    const key = dateKey(date);
    return { key, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month, isToday: key === today };
  });
}

function monthLabel(year, month) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function longDateLabel(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return 'Data não definida';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function visitTime(value) {
  return String(value || '').match(/[T ](\d{2}:\d{2})/)?.[1] || '--:--';
}

function visitTimeRange(visit) {
  const start = visitTime(visit.agendado_para);
  const end = visitTime(visit.agendado_ate);
  return end === '--:--' ? start : `${start}–${end}`;
}

function initialsFor(value) {
  return String(value || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function currentTimeLabel() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date());
}

function updatedAtLabel(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

export default function PublicTvAgenda() {
  const location = useLocation();
  const linkKey = location.hash.slice(1).trim();
  const today = todayInSaoPaulo();
  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { year, month: month - 1 };
  });
  const [visits, setVisits] = useState([]);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [clock, setClock] = useState(currentTimeLabel());
  const days = useMemo(() => buildMonthDays(cursor.year, cursor.month, today), [cursor.year, cursor.month, today]);
  const visibleFrom = days[0]?.key || today;
  const visibleTo = days[days.length - 1]?.key || today;
  const visitsByDay = useMemo(() => {
    const grouped = Object.fromEntries(days.map((day) => [day.key, []]));
    for (const visit of visits) {
      const date = String(visit.agendado_para || '').slice(0, 10);
      if (grouped[date]) grouped[date].push(visit);
    }
    return grouped;
  }, [days, visits]);
  const sortedVisits = useMemo(
    () => [...visits].sort((a, b) => String(a.agendado_para || '').localeCompare(String(b.agendado_para || ''))),
    [visits]
  );

  useEffect(() => {
    const originalTitle = document.title;
    const originalRobots = document.querySelector('meta[name="robots"]');
    const originalRobotsContent = originalRobots?.content;
    const robots = originalRobots || document.createElement('meta');
    if (!originalRobots) {
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex, nofollow, noarchive';
    document.title = 'Agenda de visitas | Mirontec';

    let active = true;
    let inFlight = false;

    async function loadAgenda() {
      if (!linkKey) {
        if (active) {
          setError('Este link está incompleto. Use o endereço completo enviado pelo gestor.');
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }
      if (inFlight) return;
      inFlight = true;
      if (active) setRefreshing(true);
      try {
        const query = new URLSearchParams({ from: visibleFrom, to: visibleTo });
        const response = await fetch(`/api/public/agenda-tv?${query}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { 'X-Agenda-TV-Key': linkKey }
        });
        if (!response.ok) {
          throw new Error(response.status === 404
            ? 'Este link não é válido. Peça um link atualizado ao gestor.'
            : 'Não foi possível atualizar a agenda agora.');
        }
        const data = await response.json();
        if (active) {
          setVisits(Array.isArray(data.visitas) ? data.visitas : []);
          setUpdatedAt(data.atualizado_em || new Date().toISOString());
          setError('');
        }
      } catch (err) {
        if (active) setError(err.message || 'Agenda temporariamente indisponível.');
      } finally {
        inFlight = false;
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadAgenda();
    const refreshId = window.setInterval(loadAgenda, 60 * 1000);
    const clockId = window.setInterval(() => setClock(currentTimeLabel()), 15 * 1000);

    return () => {
      active = false;
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
      document.title = originalTitle;
      if (originalRobots) originalRobots.content = originalRobotsContent;
      else robots.remove();
    };
  }, [linkKey, visibleFrom, visibleTo]);

  function changeMonth(delta) {
    setCursor((current) => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
    setSelectedVisit(null);
  }

  function goToCurrentMonth() {
    const [year, month] = today.split('-').map(Number);
    setCursor({ year, month: month - 1 });
    setSelectedVisit(null);
  }

  return (
    <main className="tv-agenda">
      <div className="tv-agenda__glow tv-agenda__glow--one" />
      <div className="tv-agenda__glow tv-agenda__glow--two" />
      <div className="tv-agenda__content">
        <header className="tv-agenda__header">
          <div className="tv-agenda__brand">
            <img className="tv-agenda__logo" src="/mirontec-logo.jpg" alt="Logo da Mirontec" />
            <div>
              <strong>MIRONTEC</strong>
              <span>OPERAÇÕES DE CAMPO</span>
            </div>
          </div>
          <div className="tv-agenda__heading">
            <span className="tv-agenda__eyebrow">PLANEJAMENTO DA EQUIPE</span>
            <h1>Próximas visitas</h1>
          </div>
          <div className="tv-agenda__clock" aria-label={`Horário de Brasília: ${clock}`}>
            <strong>{clock}</strong>
            <span>HORÁRIO DE BRASÍLIA</span>
          </div>
        </header>

        <section className="tv-agenda__summary" aria-live="polite">
          <div>
            <span className="tv-agenda__live-dot" />
            <span>VISITAS DO MÊS</span>
          </div>
          <strong>{visits.length === 0 ? 'Nenhuma visita neste mês' : `${visits.length} visita${visits.length === 1 ? '' : 's'} neste mês`}</strong>
          <small>{refreshing ? 'Atualizando…' : `Atualizado às ${updatedAtLabel(updatedAt)}`}</small>
        </section>

        {error ? (
          <section className="tv-agenda__state tv-agenda__state--error" role="alert">
            <span className="tv-agenda__state-icon">!</span>
            <h2>{error}</h2>
            {!linkKey && <p>Confira se o endereço da TV termina com a chave completa do link.</p>}
          </section>
        ) : loading ? (
          <section className="tv-agenda__state"><span className="tv-agenda__spinner" /><h2>Carregando agenda…</h2></section>
        ) : (
          <div className="tv-agenda__schedule-layout">
          <section className="tv-calendar" aria-label="Calendário mensal das visitas">
            <div className="tv-calendar__toolbar">
              <div className="tv-calendar__controls">
                <button className="tv-calendar__today" type="button" onClick={goToCurrentMonth}>Hoje</button>
                <button className="tv-calendar__arrow" type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">‹</button>
                <button className="tv-calendar__arrow" type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês">›</button>
              </div>
              <h2>{monthLabel(cursor.year, cursor.month)}</h2>
              <span className="tv-calendar__view">MÊS</span>
            </div>
            <div className="tv-calendar__weekdays" aria-hidden="true">
              {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className={`tv-calendar__grid ${days.length === 42 ? 'has-six-weeks' : ''}`}>
              {days.map((day) => {
                const dayVisits = visitsByDay[day.key] || [];
                return (
                  <section className={`tv-calendar__day ${day.inMonth ? '' : 'is-outside'} ${day.isToday ? 'is-today' : ''}`} key={day.key}>
                    <header className="tv-calendar__date">
                      <span className={day.isToday ? 'tv-calendar__today-number' : ''}>{day.day}</span>
                      {day.isToday && <small>HOJE</small>}
                    </header>
                    <div className="tv-calendar__events">
                      {dayVisits.slice(0, 3).map((visit) => (
                        <button
                          className={`tv-calendar__event ${visit.status === 'Concluída' ? 'is-completed' : ''}`}
                          type="button"
                          key={`${visit.manual_id || visit.milvus_codigo}-${visit.agendado_para}`}
                          onClick={() => setSelectedVisit(visit)}
                          aria-label={`${visitTimeRange(visit)}, ${visit.technician_name}, ${visit.company_name}, ${visit.local}${visit.status === 'Concluída' ? ', visita concluída' : ''}. Ver detalhes`}
                        >
                          <span className="tv-calendar__event-avatar">
                            {visit.technician_avatar ? <img src={visit.technician_avatar} alt="" /> : initialsFor(visit.technician_name)}
                          </span>
                          <span className="tv-calendar__event-copy">
                            <span className="tv-calendar__event-time">{visitTimeRange(visit)}</span>
                            <strong>{visit.technician_name}</strong>
                            <small>{visit.company_name} · {visit.local}</small>
                          </span>
                        </button>
                      ))}
                      {dayVisits.length > 3 && (
                        <span className="tv-calendar__more">+ {dayVisits.length - 3} visita{dayVisits.length - 3 === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
          <aside className="tv-visit-board" aria-label="Lista de visitas do mês">
            <header className="tv-visit-board__header">
              <div><span>AGENDA DO MÊS</span><h2>Visitas programadas</h2></div>
              <strong>{String(sortedVisits.length).padStart(2, '0')}</strong>
            </header>
            {sortedVisits.length ? (
              <div className="tv-visit-board__list">
                {sortedVisits.slice(0, 5).map((visit) => (
                  <button
                    className={`tv-visit-card ${visit.status === 'Concluída' ? 'is-completed' : ''}`}
                    type="button"
                    key={`${visit.manual_id || visit.milvus_codigo}-${visit.agendado_para}`}
                    onClick={() => setSelectedVisit(visit)}
                  >
                    <span className="tv-visit-card__avatar">
                      {visit.technician_avatar ? <img src={visit.technician_avatar} alt="" /> : initialsFor(visit.technician_name)}
                    </span>
                    <span className="tv-visit-card__body">
                      <span className="tv-visit-card__date">{longDateLabel(visit.agendado_para)}</span>
                      <strong>{visit.technician_name}</strong>
                      <span className="tv-visit-card__time">{visitTimeRange(visit)}</span>
                      <span className="tv-visit-card__company">{visit.company_name}</span>
                      <span className="tv-visit-card__local">{visit.local}</span>
                    </span>
                    <span className="tv-visit-card__status">{visit.status === 'Concluída' ? 'CONCLUÍDA' : 'AGENDADA'}</span>
                  </button>
                ))}
                {sortedVisits.length > 5 && <div className="tv-visit-board__more">+ {sortedVisits.length - 5} outras visitas no calendário</div>}
              </div>
            ) : (
              <div className="tv-visit-board__empty"><span>✓</span><strong>Nenhuma visita programada</strong><small>Chamados e visitas manuais aparecem aqui automaticamente.</small></div>
            )}
          </aside>
          </div>
        )}

        <footer className="tv-agenda__footer">
          <span>Chamados do Milvus e visitas manuais da equipe</span>
          <span>Atualização automática a cada minuto</span>
        </footer>
      </div>
      {selectedVisit && (
        <div className="tv-visit-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedVisit(null)}>
          <section className="tv-visit-modal__card" role="dialog" aria-modal="true" aria-labelledby="tv-visit-modal-title">
            <button className="tv-visit-modal__close" type="button" onClick={() => setSelectedVisit(null)} aria-label="Fechar detalhes">×</button>
            <div className="tv-visit-modal__heading">
              <span className="tv-visit-modal__avatar">
                {selectedVisit.technician_avatar ? <img src={selectedVisit.technician_avatar} alt={`Foto de ${selectedVisit.technician_name}`} /> : initialsFor(selectedVisit.technician_name)}
              </span>
              <div>
                <span>TÉCNICO MIRONTEC</span>
                <h2 id="tv-visit-modal-title">{selectedVisit.technician_name}</h2>
              </div>
            </div>
            <div className="tv-visit-modal__schedule">
              <strong>{visitTimeRange(selectedVisit)}</strong>
              <span>{longDateLabel(selectedVisit.agendado_para)}</span>
            </div>
            <div className="tv-visit-modal__details">
              <div><span>STATUS DA VISITA</span><strong>{selectedVisit.status === 'Concluída' ? '✓ Concluída' : 'Agendada'}</strong></div>
              <div><span>EMPRESA ATENDIDA</span><strong>{selectedVisit.company_name}</strong></div>
              <div><span>LOCAL DA VISITA</span><strong>{selectedVisit.local}</strong></div>
              <div>
                <span>{selectedVisit.manual_id ? 'TIPO DE REGISTRO' : 'CHAMADO MILVUS'}</span>
                <strong>{selectedVisit.manual_id ? 'Agendamento manual' : `#${selectedVisit.milvus_codigo}`}</strong>
              </div>
              <div>
                <span>CONFIRMAÇÃO</span>
                <strong className={selectedVisit.confirmacao === 'Confirmada' ? 'is-confirmed' : ''}>
                  {selectedVisit.confirmacao === 'Confirmada'
                    ? '✓ Confirmada pelo técnico'
                    : selectedVisit.manual_id ? 'Criada pelo técnico' : '◷ Aguardando confirmação'}
                </strong>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
