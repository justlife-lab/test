'use client';
import { formatRange } from '@/lib/time';

const period = (iso) => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Dubai' }).format(new Date(iso)));
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
};

/** Grid of available 1-hour windows. Booked slots never reach this component. */
export default function TimeSlots({ slots, value, onChange }) {
  if (!slots?.length) return <p className="muted">No times left on this day. Please choose another date.</p>;
  return (
    <div className="slots" role="group" aria-label="Available times">
      {slots.map((s) => (
        <button key={s.startAt} type="button" className="slot" aria-pressed={value === s.startAt} onClick={() => onChange(s)}>
          <span className="t">{formatRange(s.startAt, s.endAt)}</span>
          <span className="p">{period(s.startAt)}</span>
        </button>
      ))}
    </div>
  );
}
