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

export default function TechnicianAvailabilityCalendar({ manager = false, readOnly = false }) {
  const teamMode = manager || readOnly;
  const [availability, setAvailability] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [cursor, setCursor] = useState(() => {
    const date = new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftFrom, setDraftFrom] = useState('07:00');
  const [draftUntil, setDraftUntil] = useState('15:00');
  const [teamLoading, setTeamLoading] = useState(teamMode);
  const [availabilityLoading, setAvailabilityLoading] = useState(!teamMode);
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
        if (!active) return;
        setTechnicians(data.filter((user) => user.role === 'tecnico' && user.ativo));
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
      setAvailability({});
      setAvailabilityLoading(false);
      return undefined;
    }
    let active = true;
    setAvailabilityLoading(true);
    setError('');
    const url = teamMode
      ? `/technician-availability/team/${encodeURIComponent(selectedTechnicianId)}`
      : '/technician-availability';
    api.get(url)
      .then(({ data }) => {
        if (!active) return;
        const next = {};
        data.forEach((entry) => {
          next[String(entry.date).slice(0, 10)] = {
            available_from: entry.available_from || '07:00',
            available_until: entry.available_until
          };
        });
        setAvailability(next);
      })
      .catch(() => {
        if (active) setError(teamMode
          ? 'Não foi possível carregar a disponibilidade deste técnico.'
          : 'Não foi possível carregar sua disponibilidade. Tente atualizar a página.');
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, [teamMode, selectedTechnicianId]);

  const cells = useMemo(() => buildCalendar(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const today = todayKey();
  const loading = teamLoading || availabilityLoading;
  const savedDaysThisMonth = Object.keys(availability)
    .filter((key) => key.startsWith(`${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`) && key >= today)
    .length;
  const savedAvailability = selectedDate ? availability[selectedDate] : null;
  const hasChanges = selectedDate && (draftAvailable
    ? !savedAvailability || savedAvailability.available_from !== draftFrom || savedAvailability.available_until !== draftUntil
    : Boolean(savedAvailability));

  function selectDate(value) {
    setSelectedDate(value);
    const storedHours = availability[value];
    setDraftAvailable(Boolean(storedHours));
    setDraftFrom(storedHours?.available_from || '07:00');
    setDraftUntil(storedHours?.available_until || '15:00');
    setError('');
    setNotice('');
  }

  function selectTechnician(value) {
    setSelectedTechnicianId(value);
    setAvailability({});
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

  async function saveAvailability() {
    if (!selectedDate || !hasChanges) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (draftAvailable) {
        const path = teamMode
          ? `/technician-availability/team/${encodeURIComponent(selectedTechnicianId)}/${selectedDate}`
          : `/technician-availability/${selectedDate}`;
        const { data } = await api.put(path, { available_from: draftFrom, available_until: draftUntil });
        setAvailability((current) => ({
          ...current,
          [selectedDate]: {
            available_from: data.available_from || draftFrom,
            available_until: data.available_until
          }
        }));
        setNotice(`${teamMode ? `Disponibilidade de ${selectedTechnician?.nome} salva` : 'Disponibilidade salva'} para ${formatLongDate(selectedDate)}.`);
      } else {
        const path = teamMode
          ? `/technician-availability/team/${encodeURIComponent(selectedTechnicianId)}/${selectedDate}`
          : `/technician-availability/${selectedDate}`;
        await api.delete(path);
        setAvailability((current) => {
          const next = { ...current };
          delete next[selectedDate];
          return next;
        });
        setNotice(`${teamMode ? `Disponibilidade de ${selectedTechnician?.nome} removida` : 'Disponibilidade removida'} para ${formatLongDate(selectedDate)}.`);
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
          <h3 id="availability-title">{manager ? 'Disponibilidade dos técnicos' : readOnly ? 'Disponibilidade da equipe' : 'Minha disponibilidade'}</h3>
          <p>{manager
            ? 'Escolha um técnico e marque os dias e a faixa de horário disponível para atendimento.'
            : readOnly
              ? 'Consulte os dias e horários de cada técnico antes de agendar um chamado.'
              : 'Escolha os dias em que pode atender e informe o horário inicial e final.'}</p>
        </div>
        <span className="availability-card__count">
          {teamMode && !selectedTechnicianId
            ? 'Selecione um técnico'
            : `${savedDaysThisMonth} dia${savedDaysThisMonth === 1 ? '' : 's'} neste mês`}
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
        <p className="availability-card__state">Carregando disponibilidade…</p>
      ) : teamMode && !selectedTechnicianId ? (
        <div className="availability-manager-empty">
          <strong>{technicians.length ? 'Selecione um técnico para abrir o calendário.' : 'Nenhum técnico ativo cadastrado.'}</strong>
          <p>{technicians.length && manager
            ? 'Depois, em Chamados, atribua o técnico e informe o dia, horário e endereço. Ele verá a visita na própria agenda.'
            : technicians.length
              ? 'Escolha o técnico e selecione uma data para consultar a disponibilidade.'
              : 'Cadastre ou ative um técnico para configurar os dias disponíveis.'}</p>
        </div>
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
                    aria-label={`${formatLongDate(cell.key)}${available ? `, disponível das ${availability[cell.key].available_from} às ${availability[cell.key].available_until}` : ', indisponível'}`}
                    title={available ? `Disponível das ${availability[cell.key].available_from} às ${availability[cell.key].available_until}` : ''}
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
                {readOnly ? (
                  <p className="availability-editor__hint">
                    {savedAvailability
                      ? `${selectedTechnician?.nome || 'Este técnico'} está disponível das ${savedAvailability.available_from} às ${savedAvailability.available_until}.`
                      : `${selectedTechnician?.nome || 'Este técnico'} não marcou disponibilidade para este dia.`}
                  </p>
                ) : (
                  <>
                    <label className="availability-editor__toggle">
                      <input
                        type="checkbox"
                        checked={draftAvailable}
                        onChange={(event) => { setDraftAvailable(event.target.checked); setNotice(''); }}
                      />
                      <span className="availability-editor__switch" aria-hidden="true" />
                      <span>{manager ? 'Disponível neste dia' : 'Estou disponível neste dia'}</span>
                    </label>
                    {draftAvailable && (
                      <div className="availability-editor__time-range">
                        <label className="availability-editor__time">
                          <span>Disponível a partir das</span>
                          <input type="time" value={draftFrom} onChange={(event) => { setDraftFrom(event.target.value); setNotice(''); }} />
                        </label>
                        <label className="availability-editor__time">
                          <span>Disponível até</span>
                          <input type="time" value={draftUntil} onChange={(event) => { setDraftUntil(event.target.value); setNotice(''); }} />
                        </label>
                      </div>
                    )}
                    <button
                      type="button"
                      className="availability-editor__save"
                      onClick={saveAvailability}
                      disabled={!hasChanges || saving || (draftAvailable && (!draftFrom || !draftUntil || draftFrom >= draftUntil))}
                    >
                      {saving ? 'Salvando…' : 'Salvar disponibilidade'}
                    </button>
                    <p className="availability-editor__hint">
                      {savedAvailability && !hasChanges
                        ? `Salvo: ${manager ? `${selectedTechnician?.nome} pode` : 'você pode'} atender das ${savedAvailability.available_from} às ${savedAvailability.available_until}.`
                        : hasChanges ? 'As alterações ainda não foram salvas.' : 'Marque sua disponibilidade ou escolha outro dia.'}
                    </p>
                  </>
                )}
              </>
            ) : (
              <div className="availability-editor__empty">
                <span aria-hidden="true">↖</span>
                <strong>Selecione um dia no calendário</strong>
                <p>{readOnly
                  ? `Selecione uma data para consultar os horários de ${selectedTechnician?.nome || 'este técnico'}.`
                  : manager
                    ? `Você poderá marcar a disponibilidade de ${selectedTechnician?.nome || 'este técnico'} e escolher a faixa de horário.`
                    : 'Você poderá marcar a faixa de horário em que pode atender.'}</p>
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
