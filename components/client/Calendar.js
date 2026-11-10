'use client';
// Horizontal date strip — Today, Tomorrow and future AVAILABLE dates only.
import { formatKeyWeekday, relativeDayLabel, diffDays, dateKey } from '@/lib/time';

export default function Calendar({ dates, counts = {}, value, onChange }) {
  const today = dateKey();
  if (!dates.length) return <p className="muted">No available dates in the next two weeks.</p>;
  return (
    <div className="date-strip" role="group" aria-label="Choose a date">
      {dates.map((k) => {
        const rel = diffDays(today, k);
        const top = rel === 0 ? 'Today' : rel === 1 ? 'Tomorrow' : formatKeyWeekday(k);
        return (
          <button key={k} type="button" className="date-chip" aria-pressed={value === k} onClick={() => onChange(k)} aria-label={relativeDayLabel(k)}>
            <span className="w">{top}</span>
            <span className="d">{Number(k.slice(8))}</span>
            <span className="w">{new Date(`${k}T12:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>
            {counts[k] != null && <span className="n">{counts[k]} slot{counts[k] === 1 ? '' : 's'}</span>}
          </button>
        );
      })}
    </div>
  );
}
