const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function money(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function VisitCalendar({ year, month, dayData, onDayClick, selectedKey }) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = first.getDay();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, key, ...(dayData[key] || { count: 0, valor: 0 }) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const maxValor = Math.max(...Object.values(dayData).map((d) => d.valor), 1);

  return (
    <div className="visit-calendar">
      <div className="visit-calendar__weekdays">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="visit-calendar__grid">
        {cells.map((c, i) => {
          if (!c) return <div key={`empty-${i}`} className="visit-calendar__cell visit-calendar__cell--empty" />;
          const intensity = c.valor > 0 ? Math.max(0.14, c.valor / maxValor) : 0;
          const isToday = c.key === todayKey;
          const isSelected = c.key === selectedKey;
          const clickable = c.count > 0 && onDayClick;
          return (
            <div
              key={c.key}
              className={`visit-calendar__cell ${c.count > 0 ? 'has-visit' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
              style={c.valor > 0 ? { background: `rgba(34, 197, 94, ${intensity})` } : undefined}
              title={c.count > 0 ? `${c.count} visita${c.count === 1 ? '' : 's'} — R$ ${money(c.valor)} — clique para ver detalhes` : ''}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onDayClick(isSelected ? null : c.key) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onDayClick(isSelected ? null : c.key); } : undefined}
            >
              <span className="visit-calendar__day">{c.day}</span>
              {c.count > 0 && (
                <>
                  <span className="visit-calendar__badge">{c.count}</span>
                  {c.valor > 0 && <span className="visit-calendar__valor">R$ {money(c.valor)}</span>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
