import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import './TechnicianAvailabilityCalendar.css';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return dateKey(new Date());
}

function formatLongDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

function monthLabel(year, month) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildCalendar(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday }, (_, index) => ({ key: `empty-${index}`, empty: true }));
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ key: dateKey(new Date(year, month, day)), day });
  }
  while (cells.length % 7 !== 0) cells.push({ key: `empty-end-${cells.length}`, empty: true });
  return cells;
}

export default function TechnicianAvailabilityCalendar({ manager = false, readOnly = false }) {
  const teamMode = manager || readOnly;
  const [unavailableDates, setUnavailableDates] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [cursor, setCursor] = useState(() => {
    const date = new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [draftUnavailable, setDraftUnavailable] = useState(false);
  const [teamLoading, setTeamLoading] = useState(teamMode);
  const [calendarLoading, setCalendarLoading] = useState(!teamMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedTechnician = technicians.find((technician) => technician.id === selectedTechnicianId);

  useEffect(() => {
    if (!teamMode) return undefined;
    let active = true;
    setTeamLoading(true);
    api.get('/users')
      .then(({ data }) => {
        if (active) setTechnicians(data.filter((user) => user.role === 'tecnico' && user.ativo));
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar os técnicos. Atualize a página e tente novamente.');
      })
      .finally(() => {
        if (active) setTeamLoading(false);
      });
    return () => { active = false; };
  }, [teamMode]);

  useEffect(() => {
    if (teamMode && !selectedTechnicianId) {
      setUnavailableDates({});
      setCalendarLoading(false);
      return undefined;
    }
    let active = true;
    setCalendarLoading(true);
    setError('');
    const url = teamMode
      ? `/technician-availability/team/${encodeURIComponent(selectedTechnicianId)}`
      : '/technician-availability';
    api.get(url)
      .then(({ data }) => {
        if (!active) return;
        setUnavailableDates(Object.fromEntries(data.map((entry) => [String(entry.date).slice(0, 10), true])));
      })
      .catch(() => {
        if (active) setError(teamMode
          ? 'Não foi possível carregar os dias indisponíveis deste técnico.'
          : 'Não foi possível carregar seus dias indisponíveis. Atualize a página e tente novamente.');
      })
      .finally(() => {
        if (active) setCalendarLoading(false);
      });
    return () => { active = false; };
  }, [teamMode, selectedTechnicianId]);

  const cells = useMemo(() => buildCalendar(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const today = todayKey();
  const loading = teamLoading || calendarLoading;
  const savedDaysThisMonth = Object.keys(unavailableDates)
    .filter((key) => key.startsWith(`${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`)).length;
  const isDateUnavailable = Boolean(selectedDate && unavailableDates[selectedDate]);
  const hasChanges = selectedDate && draftUnavailable !== isDateUnavailable;

  function selectDate(value) {
    setSelectedDate(value);
    setDraftUnavailable(Boolean(unavailableDates[value]));
    setError('');
    setNotice('');
  }

  function selectTechnician(value) {
    setSelectedTechnicianId(value);
    setUnavailableDates({});
    setSelectedDate('');
    setError('');
    setNotice('');
  }

  function changeMonth(delta) {
    setSelectedDate('');
    setNotice('');
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  async function saveUnavailableDate() {
    if (!selectedDate || !hasChanges || teamMode) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (draftUnavailable) {
        await api.put(`/technician-availability/${selectedDate}`, {});
        setUnavailableDates((current) => ({ ...current, [selectedDate]: true }));
        setNotice(`Dia marcado como indisponível: ${formatLongDate(selectedDate)}.`);
      } else {
        await api.delete(`/technician-availability/${selectedDate}`);
        setUnavailableDates((current) => {
          const next = { ...current };
          delete next[selectedDate];
          return next;
        });
        setNotice(`Dia liberado para atendimento: ${formatLongDate(selectedDate)}.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="availability-card" aria-labelledby="availability-title">
      <div className="availability-card__header">
        <div>
          <span className="availability-card__eyebrow">AGENDA DE ATENDIMENTO</span>
          <h3 id="availability-title">{teamMode ? 'Dias indisponíveis dos técnicos' : 'Minha disponibilidade'}</h3>
          <p>{teamMode
            ? 'Consulte os dias bloqueados pela equipe. Nos demais dias, o horário padrão é das 07h às 15h.'
            : 'Marque somente os dias em que você não poderá atender. Os outros dias ficam livres das 07h às 15h.'}</p>
        </div>
        <span className="availability-card__count">
          {teamMode && !selectedTechnicianId
            ? 'Selecione um técnico'
            : `${savedDaysThisMonth} dia${savedDaysThisMonth === 1 ? '' : 's'} bloqueado${savedDaysThisMonth === 1 ? '' : 's'} neste mês`}
        </span>
      </div>

      {teamMode && (
        <label className="availability-technician-select">
          <span>Técnico</span>
          <select
            className="form-select"
            value={selectedTechnicianId}
            onChange={(event) => selectTechnician(event.target.value)}
            disabled={teamLoading || technicians.length === 0}
          >
            <option value="">{teamLoading ? 'Carregando técnicos…' : 'Selecione um técnico'}</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>{technician.nome}</option>
            ))}
          </select>
        </label>
      )}

      {loading ? (
        <p className="availability-card__state">Carregando calendário…</p>
      ) : teamMode && !selectedTechnicianId ? (
        <div className="availability-manager-empty">
          <strong>{technicians.length ? 'Selecione um técnico para abrir o calendário.' : 'Nenhum técnico ativo cadastrado.'}</strong>
          <p>{technicians.length
            ? 'Escolha um técnico para consultar os dias que ele bloqueou.'
            : 'Cadastre ou ative um técnico para consultar a agenda da equipe.'}</p>
        </div>
      ) : (
        <div className="availability-layout">
          <div className="availability-calendar" aria-label="Calendário de disponibilidade">
            <div className="availability-calendar__toolbar">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">‹</button>
              <strong>{monthLabel(cursor.year, cursor.month)}</strong>
              <button type="button" onClick={() => changeMonth(1)} aria-label="Mês seguinte">›</button>
            </div>
            <div className="availability-calendar__weekdays">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="availability-calendar__grid">
              {cells.map((cell) => {
                if (cell.empty) return <span key={cell.key} className="availability-calendar__empty" />;
                const unavailable = Boolean(unavailableDates[cell.key]);
                const isPast = cell.key < today;
                const isSelected = cell.key === selectedDate;
                const classes = [
                  'availability-calendar__day',
                  unavailable && 'is-unavailable',
                  isPast && 'is-past',
                  isSelected && 'is-selected',
                  cell.key === today && 'is-today'
                ].filter(Boolean).join(' ');
                const dateLabel = unavailable
                  ? `${formatLongDate(cell.key)}, indisponível`
                  : `${formatLongDate(cell.key)}, disponível das 07 às 15`;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    className={classes}
                    disabled={isPast}
                    onClick={() => selectDate(cell.key)}
                    aria-pressed={isSelected}
                    aria-label={dateLabel}
                    title={unavailable ? 'Indisponível' : 'Disponível das 07:00 às 15:00'}
                  >
                    <span>{cell.day}</span>
                    {unavailable && <i aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <div className="availability-calendar__legend"><i /> Indisponível · demais dias livres das 07h às 15h</div>
          </div>

          <div className="availability-editor">
            {selectedDate ? (
              <>
                <span className="availability-editor__eyebrow">DIA SELECIONADO</span>
                <h4>{formatLongDate(selectedDate)}</h4>
                {teamMode ? (
                  <p className="availability-editor__hint">
                    {isDateUnavailable
                      ? `${selectedTechnician?.nome || 'Este técnico'} marcou este dia como indisponível.`
                      : `${selectedTechnician?.nome || 'Este técnico'} está livre das 07h às 15h.`}
                  </p>
                ) : (
                  <>
                    <label className="availability-editor__toggle">
                      <input
                        type="checkbox"
                        checked={draftUnavailable}
                        onChange={(event) => { setDraftUnavailable(event.target.checked); setNotice(''); }}
                      />
                      <span className="availability-editor__switch" aria-hidden="true" />
                      <span>Não posso atender neste dia</span>
                    </label>
                    <button
                      type="button"
                      className="availability-editor__save"
                      onClick={saveUnavailableDate}
                      disabled={!hasChanges || saving}
                    >
                      {saving ? 'Salvando…' : draftUnavailable ? 'Salvar indisponibilidade' : 'Liberar este dia'}
                    </button>
                    <p className="availability-editor__hint">
                      {isDateUnavailable && !hasChanges
                        ? 'Este dia está bloqueado para novos agendamentos.'
                        : !isDateUnavailable && !hasChanges
                          ? 'Este dia está livre para atendimento das 07h às 15h.'
                          : 'Salve a alteração para atualizar sua agenda.'}
                    </p>
                  </>
                )}
              </>
            ) : (
              <div className="availability-editor__empty">
                <span aria-hidden="true">↖</span>
                <strong>Selecione um dia no calendário</strong>
                <p>{teamMode
                  ? `Veja se ${selectedTechnician?.nome || 'o técnico'} bloqueou a data.`
                  : 'Bloqueie os dias em que não poderá atender.'}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {error && <p className="availability-card__message is-error" role="alert">{error}</p>}
      {notice && <p className="availability-card__message is-success" role="status">{notice}</p>}
    </section>
  );
}
