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
    const date = new Date(year, month, day);
    cells.push({ key: dateKey(date), day });
  }
  while (cells.length % 7 !== 0) cells.push({ key: `empty-end-${cells.length}`, empty: true });
  return cells;
}

export default function TechnicianAvailabilityCalendar() {
  const [availability, setAvailability] = useState({});
  const [cursor, setCursor] = useState(() => {
    const date = new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftTime, setDraftTime] = useState('17:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/technician-availability')
      .then(({ data }) => {
        if (!active) return;
        const next = {};
        data.forEach((entry) => {
          next[String(entry.date).slice(0, 10)] = entry.available_until;
        });
        setAvailability(next);
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar sua disponibilidade. Tente atualizar a página.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const cells = useMemo(() => buildCalendar(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const today = todayKey();
  const savedDaysThisMonth = Object.keys(availability)
    .filter((key) => key.startsWith(`${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`) && key >= today)
    .length;
  const savedTime = selectedDate ? availability[selectedDate] : null;
  const hasChanges = selectedDate && (draftAvailable
    ? !savedTime || savedTime !== draftTime
    : Boolean(savedTime));

  function selectDate(value) {
    setSelectedDate(value);
    const storedTime = availability[value];
    setDraftAvailable(Boolean(storedTime));
    setDraftTime(storedTime || '17:00');
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

  async function saveAvailability() {
    if (!selectedDate || !hasChanges) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (draftAvailable) {
        const { data } = await api.put(`/technician-availability/${selectedDate}`, { available_until: draftTime });
        setAvailability((current) => ({ ...current, [selectedDate]: data.available_until }));
        setNotice(`Disponibilidade salva para ${formatLongDate(selectedDate)}.`);
      } else {
        await api.delete(`/technician-availability/${selectedDate}`);
        setAvailability((current) => {
          const next = { ...current };
          delete next[selectedDate];
          return next;
        });
        setNotice(`Disponibilidade removida para ${formatLongDate(selectedDate)}.`);
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
          <h3 id="availability-title">Minha disponibilidade</h3>
          <p>Escolha os dias em que pode sair para atendimento e defina o horário limite.</p>
        </div>
        <span className="availability-card__count">
          {savedDaysThisMonth} dia{savedDaysThisMonth === 1 ? '' : 's'} neste mês
        </span>
      </div>

      {loading ? (
        <p className="availability-card__state">Carregando sua disponibilidade…</p>
      ) : (
        <div className="availability-layout">
          <div className="availability-calendar" aria-label="Calendário de disponibilidade">
            <div className="availability-calendar__toolbar">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">‹</button>
              <strong>{monthLabel(cursor.year, cursor.month)}</strong>
              <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês">›</button>
            </div>
            <div className="availability-calendar__weekdays">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="availability-calendar__grid">
              {cells.map((cell) => {
                if (cell.empty) return <span key={cell.key} className="availability-calendar__empty" />;
                const available = Boolean(availability[cell.key]);
                const isPast = cell.key < today;
                const isSelected = cell.key === selectedDate;
                const classes = [
                  'availability-calendar__day',
                  available && 'is-available',
                  isPast && 'is-past',
                  isSelected && 'is-selected',
                  cell.key === today && 'is-today'
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={cell.key}
                    type="button"
                    className={classes}
                    disabled={isPast}
                    onClick={() => selectDate(cell.key)}
                    aria-pressed={isSelected}
                    aria-label={`${formatLongDate(cell.key)}${available ? `, disponível até ${availability[cell.key]}` : ', indisponível'}`}
                    title={available ? `Disponível até ${availability[cell.key]}` : ''}
                  >
                    <span>{cell.day}</span>
                    {available && <i aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <div className="availability-calendar__legend"><i /> Disponível para atendimento</div>
          </div>

          <div className="availability-editor">
            {selectedDate ? (
              <>
                <span className="availability-editor__eyebrow">DIA SELECIONADO</span>
                <h4>{formatLongDate(selectedDate)}</h4>
                <label className="availability-editor__toggle">
                  <input
                    type="checkbox"
                    checked={draftAvailable}
                    onChange={(event) => { setDraftAvailable(event.target.checked); setNotice(''); }}
                  />
                  <span className="availability-editor__switch" aria-hidden="true" />
                  <span>Estou disponível neste dia</span>
                </label>
                {draftAvailable && (
                  <label className="availability-editor__time">
                    <span>Posso sair para atendimento até</span>
                    <input type="time" value={draftTime} onChange={(event) => { setDraftTime(event.target.value); setNotice(''); }} />
                  </label>
                )}
                <button
                  type="button"
                  className="availability-editor__save"
                  onClick={saveAvailability}
                  disabled={!hasChanges || saving || (draftAvailable && !draftTime)}
                >
                  {saving ? 'Salvando…' : 'Salvar disponibilidade'}
                </button>
                <p className="availability-editor__hint">
                  {savedTime && !hasChanges
                    ? `Salvo: você pode sair até ${savedTime}.`
                    : hasChanges ? 'As alterações ainda não foram salvas.' : 'Marque sua disponibilidade ou escolha outro dia.'}
                </p>
              </>
            ) : (
              <div className="availability-editor__empty">
                <span aria-hidden="true">↖</span>
                <strong>Selecione um dia no calendário</strong>
                <p>Você poderá marcar disponibilidade e escolher o horário limite para sair.</p>
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
