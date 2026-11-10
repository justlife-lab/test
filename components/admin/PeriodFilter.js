'use client';
// Date filter shared by Dashboard / Reports / Doctor Performance.
import { PERIOD_PRESETS } from '@/lib/time';

export default function PeriodFilter({ value, onChange, doctors, doctorId, onDoctor }) {
  return (
    <div className="toolbar">
      <div className="seg" role="group" aria-label="Period">
        {PERIOD_PRESETS.map(([k, label]) => (
          <button key={k} aria-pressed={value.preset === k} onClick={() => onChange({ ...value, preset: k })}>{label}</button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <>
          <input className="input input-sm" type="date" aria-label="From" value={value.from || ''} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <input className="input input-sm" type="date" aria-label="To" value={value.to || ''} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
      {doctors && (
        <select className="select select-sm" aria-label="Doctor" value={doctorId || ''} onChange={(e) => onDoctor(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All doctors</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
    </div>
  );
}
