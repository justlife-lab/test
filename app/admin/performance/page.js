'use client';
// Doctor Performance: appointment, calling, business and utilization metrics per doctor.
import { useState } from 'react';
import { useData } from '@/components/admin/useData';
import { qs } from '@/lib/client-api';
import PeriodFilter from '@/components/admin/PeriodFilter';
import { Loading, StatusBadge, fmtMoney, fmtPct } from '@/components/ui';
import { formatKeyShort } from '@/lib/time';

const GROUPS = [
  ['Appointments', [['total', 'Total'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['noShow', 'No-show'], ['rescheduled', 'Rescheduled']]],
  ['Calling', [['calls', 'Calls'], ['onTimeCalls', 'On-time'], ['lateCalls', 'Late'], ['onTimePct', 'On-time %', fmtPct], ['avgDelayMinutes', 'Avg delay (min)']]],
  ['Business', [['upsellOpportunities', 'Opportunities'], ['upsellsBooked', 'Upsells'], ['upsellConversionPct', 'Conversion %', fmtPct], ['upsellGmv', 'Upsell GMV', fmtMoney], ['avgUpsellValue', 'Avg upsell', fmtMoney]]],
  ['Utilization', [['bookedHours', 'Booked h'], ['workingHours', 'Available h'], ['utilizationPct', 'Utilization %', fmtPct]]],
];

export default function Performance() {
  const [period, setPeriod] = useState({ preset: 'thisMonth' });
  const [group, setGroup] = useState(0);
  const { data, error } = useData(`/api/admin/analytics${qs(period)}`);
  const cols = GROUPS[group][1];
  return (
    <>
      <div className="page-head">
        <div><h1>Doctor Performance</h1><p>{data ? `${formatKeyShort(data.period.fromKey)} – ${formatKeyShort(data.period.toKey)} · on-time = call within ${data.toleranceMinutes} min of window start` : ''}</p></div>
      </div>
      <PeriodFilter value={period} onChange={setPeriod} />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Metric group">
          {GROUPS.map(([g], i) => <button key={g} aria-pressed={group === i} onClick={() => setGroup(i)}>{g}</button>)}
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Doctor</th>{cols.map(([k, l]) => <th key={k} className="right">{l}</th>)}</tr></thead>
            <tbody>
              {data.doctors.map((d) => (
                <tr key={d.doctorId}>
                  <td data-label=""><strong>{d.doctorName}</strong> {d.status !== 'ACTIVE' && <StatusBadge status={d.status} />}</td>
                  {cols.map(([k, l, f]) => <td key={k} data-label={l} className="right">{f ? f(d[k]) : (d[k] ?? '—')}</td>)}
                </tr>
              ))}
              <tr style={{ background: 'var(--mist)' }}>
                <td data-label=""><strong>All doctors</strong></td>
                {cols.map(([k, l, f]) => <td key={k} data-label={l} className="right"><strong>{f ? f(data.totals[k]) : (data.totals[k] ?? '—')}</strong></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>Conversion % = booked upsells ÷ upsell opportunities × 100. Utilization = booked hours ÷ available working hours × 100.</p>
    </>
  );
}
