'use client';
// =============================================================================
// Lightweight SVG charts (no chart library → small bundle).
// Palette validated for colour-vision deficiency (dataviz validator, worst
// CVD ΔE 20.3): sky #02c2ff · deep sky #00759c · orange #e07b24.
// Rules: one y-axis, thin bars with rounded data-ends, hover tooltips,
// legend for ≥2 series, labels in ink (never the series colour).
// =============================================================================
import { useEffect, useRef, useState } from 'react';

export const SERIES_COLORS = ['#02c2ff', '#00759c', '#e07b24'];

function niceMax(v) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v);
  return n * p;
}

/**
 * Grouped column chart.
 * @param data   [{ label, sub?, values: { key: number } }]
 * @param series [{ key, label }]   colours assigned in fixed order
 */
export function ColumnChart({ data, series, height = 220, format = (v) => v.toLocaleString(), emptyText = 'No data for this period.' }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const [boxW, setBoxW] = useState(640);
  // Draw at the container's real pixel width so text never scales down.
  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [data.length]); // re-attach when the chart first appears after an empty state
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] || 0))));
  if (!data.length || max === 4 && data.every((d) => series.every((s) => !d.values[s.key]))) {
    return <p className="muted small" style={{ padding: '30px 0', textAlign: 'center' }}>{emptyText}</p>;
  }
  // Below ~6px per bar the chart scrolls horizontally instead of squashing.
  const W = Math.max(boxW, 40 + data.length * (series.length * 6 + 6));
  const H = height; const padL = 34; const padB = 26; const padT = 8;
  const plotW = W - padL; const plotH = H - padB - padT;
  const band = plotW / data.length;
  const gap = 2;
  const barW = Math.max(3, Math.min(18, (band - 8) / series.length - gap));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / 12);
  const y = (v) => padT + plotH - (v / max) * plotH;

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto' }} ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ width: W, maxWidth: 'none' }} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(', ')}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={padL} x2={W} y1={y(t)} y2={y(t)} strokeWidth={t === 0 ? 1 : 0.6} />
              <text className="axis" x={padL - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = padL + i * band + (band - series.length * (barW + gap)) / 2;
            return (
              <g key={d.label + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
                <rect x={padL + i * band} y={padT} width={band} height={plotH} fill={hover === i ? '#eef8fd' : 'transparent'} />
                {series.map((s, si) => {
                  const v = d.values[s.key] || 0;
                  const h = (v / max) * plotH;
                  const r = Math.min(4, barW / 2, h);
                  const x = x0 + si * (barW + gap);
                  const top = padT + plotH - h;
                  return v > 0 ? (
                    <path key={s.key} fill={SERIES_COLORS[si]}
                      d={`M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${padT + plotH} Z`} />
                  ) : null;
                })}
                {i % labelEvery === 0 && <text className="axis" x={padL + i * band + band / 2} y={H - 8} textAnchor="middle">{d.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {hover != null && (
        <div className="card card-tight small" style={{ position: 'absolute', top: 0, right: 0, pointerEvents: 'none', boxShadow: 'var(--shadow)', minWidth: 150 }}>
          <strong>{data[hover].sub || data[hover].label}</strong>
          {series.map((s, si) => (
            <div key={s.key} className="row between"><span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: SERIES_COLORS[si], marginRight: 6 }} />{s.label}</span><b>{format(data[hover].values[s.key] || 0)}</b></div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">{series.map((s, si) => <span key={s.key}><i style={{ background: SERIES_COLORS[si] }} />{s.label}</span>)}</div>
      )}
    </div>
  );
}

/** Horizontal bar list — single series, value printed in ink beside each bar. */
export function HBarList({ items, max: maxIn, format = (v) => v.toLocaleString(), emptyText = 'No data for this period.' }) {
  const max = maxIn ?? Math.max(0, ...items.map((i) => i.value || 0));
  if (!items.length || max === 0) return <p className="muted small" style={{ padding: '20px 0', textAlign: 'center' }}>{emptyText}</p>;
  return (
    <div role="list">
      {items.map((it) => (
        <div className="hbar" role="listitem" key={it.label} title={`${it.label}: ${it.display ?? format(it.value || 0)}`}>
          <span className="name">{it.label}</span>
          <span className="track"><span className="fill" style={{ width: `${Math.max(0, Math.min(100, ((it.value || 0) / max) * 100))}%` }} /></span>
          <b>{it.display ?? format(it.value || 0)}</b>
        </div>
      ))}
    </div>
  );
}

/** KPI tile (AnalyticsCard). */
export function AnalyticsCard({ label, value, sub, accent = false }) {
  return (
    <div className={`kpi ${accent ? 'accent' : ''}`}>
      <div className="v">{value}</div>
      <div className="l">{label}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}
