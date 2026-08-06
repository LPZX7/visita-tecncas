import { useState } from 'react';

const MUTED = '#64748b';
const GRID = '#e2e8f0';
const INK = '#0f172a';

function niceMax(value) {
  if (value <= 1) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return Math.ceil(value / magnitude) * magnitude;
}

export function BarTrend({ data, color = 'var(--azul)', height = 180 }) {
  const [hover, setHover] = useState(null);
  const width = 640;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const barSlot = plotW / data.length;
  const barWidth = Math.min(24, barSlot * 0.6);
  const ticks = [0, max / 2, max];

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Gráfico de barras">
        {ticks.map((t) => {
          const y = padTop + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
              <text x={padLeft - 8} y={y + 4} fontSize="11" fill={MUTED} textAnchor="end">{Math.round(t)}</text>
            </g>
          );
        })}
        <line x1={padLeft} x2={padLeft} y1={padTop} y2={padTop + plotH} stroke={GRID} strokeWidth="1" />

        {data.map((d, i) => {
          const x = padLeft + i * barSlot + (barSlot - barWidth) / 2;
          const barH = max === 0 ? 0 : (d.value / max) * plotH;
          const y = padTop + plotH - barH;
          const showLabel = data.length <= 14 || i % Math.ceil(data.length / 10) === 0;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}>
              <rect
                x={x}
                y={barH > 0 ? y : padTop + plotH - 2}
                width={barWidth}
                height={Math.max(barH, 2)}
                rx="4"
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
              {showLabel && (
                <text x={x + barWidth / 2} y={height - 8} fontSize="10" fill={MUTED} textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tooltip" style={{ left: `${((padLeft + hover * barSlot + barSlot / 2) / width) * 100}%` }}>
          <strong>{data[hover].value}</strong>
          <span>{data[hover].fullLabel || data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ data, color = 'var(--azul)', width = 120, height = 36 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="sparkline" preserveAspectRatio="none">
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

export function DonutChart({ data, size = 200, thickness = 26 }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="donut-svg">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total === 0 ? (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={thickness} />
          ) : (
            data.map((d, i) => {
              const frac = d.value / total;
              const dash = frac * c;
              const offset = -cumulative;
              cumulative += dash;
              return (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={offset}
                  opacity={hover === null || hover === i ? 1 : 0.35}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                  style={{ transition: 'opacity 0.15s ease', cursor: 'pointer' }}
                />
              );
            })
          )}
        </g>
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill={INK}>{total}</text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="11" fill={MUTED}>visitas</text>
      </svg>
      <ul className="donut-legend">
        {data.map((d, i) => (
          <li
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}
          >
            <span className="donut-legend__dot" style={{ background: d.color }} />
            <span className="donut-legend__label">{d.label}</span>
            <span className="donut-legend__value">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryBars({ data, height }) {
  const [hover, setHover] = useState(null);
  const width = 560;
  const rowH = 34;
  const padLeft = 130;
  const padRight = 56;
  const padTop = 8;
  const chartHeight = height || data.length * rowH + padTop;
  const plotW = width - padLeft - padRight;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));

  return (
    <svg viewBox={`0 0 ${width} ${chartHeight}`} className="chart-svg" role="img" aria-label="Gráfico de categorias">
      {data.map((d, i) => {
        const y = padTop + i * rowH;
        const barW = max === 0 ? 0 : (d.value / max) * plotW;
        return (
          <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}>
            <text x={padLeft - 12} y={y + rowH / 2 + 4} fontSize="12" fill={INK} textAnchor="end">{d.label}</text>
            <rect x={padLeft} y={y + 6} width={plotW} height={rowH - 14} rx="4" fill={GRID} />
            <rect
              x={padLeft}
              y={y + 6}
              width={Math.max(barW, d.value > 0 ? 4 : 0)}
              height={rowH - 14}
              rx="4"
              fill={d.color}
              opacity={hover === null || hover === i ? 1 : 0.55}
            />
            <text x={padLeft + Math.max(barW, 4) + 8} y={y + rowH / 2 + 4} fontSize="12" fill={MUTED}>{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
}
