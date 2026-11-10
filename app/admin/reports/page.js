'use client';
// Business dashboard: KPIs, highlights and all business charts for a period.
import { useState } from 'react';
import { useData } from '@/components/admin/useData';
import { qs } from '@/lib/client-api';
import PeriodFilter from '@/components/admin/PeriodFilter';
import { AnalyticsCard, ColumnChart, HBarList } from '@/components/admin/Charts';
import { Loading, fmtMoney, fmtPct, SOURCE_LABEL, CONTACT_LABEL } from '@/components/ui';
import { formatKeyDayMonth, formatKeyShort, resolvePeriod } from '@/lib/time';

export default function Reports() {
  const [period, setPeriod] = useState({ preset: 'thisMonth' });
  const [doctorId, setDoctorId] = useState('');
  const { data, error } = useData(`/api/admin/analytics${qs({ ...period, doctorId })}`);
  const { data: doctors } = useData('/api/admin/doctors');
  const t = data?.totals;
  const h = data?.highlights;
  const range = resolvePeriod(period.preset, period.from, period.to);

  return (
    <>
      <div className="page-head">
        <div><h1>Reports</h1><p>{data ? `${formatKeyShort(data.period.fromKey)} – ${formatKeyShort(data.period.toKey)}` : 'Business performance'}</p></div>
        <a className="btn" href={`/api/admin/export${qs({ from: range.fromKey, to: range.toKey, doctorId })}`}>Export bookings CSV</a>
      </div>
      <PeriodFilter value={period} onChange={setPeriod} doctors={doctors} doctorId={doctorId} onDoctor={setDoctorId} />
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading rows={5} /> : (
        <>
          <div className="kpis">
            <AnalyticsCard accent label="Total teleconsultations" value={t.total} sub={`${t.rescheduled} rescheduled versions`} />
            <AnalyticsCard label="Completed consultations" value={t.completed} sub={`${fmtPct(t.completionPct)} completion`} />
            <AnalyticsCard label="Doctor calling on-time" value={fmtPct(t.onTimePct)} sub={`${t.onTimeCalls} of ${t.calls} calls · tolerance ${data.toleranceMinutes} min`} />
            <AnalyticsCard label="Client conversion" value={fmtPct(t.clientConversionPct)} sub={`${t.consultsWithUpsell} of ${t.completed} completed`} />
            <AnalyticsCard label="Upsell GMV" value={fmtMoney(t.upsellGmv)} sub={`${t.upsellsBooked} booked of ${t.upsellOpportunities}`} />
            <AnalyticsCard label="Average upsell value" value={fmtMoney(t.avgUpsellValue)} />
            <AnalyticsCard label="Cancellation rate" value={fmtPct(t.cancellationPct)} sub={`${fmtPct(t.noShowPct)} no-show`} />
            <AnalyticsCard label="Doctor utilization" value={fmtPct(t.utilizationPct)} sub={`${t.bookedHours} booked of ${t.workingHours} working h`} />
          </div>
          <div className="kpis">
            <AnalyticsCard label="Top doctor" value={h.topDoctor?.doctorName || '—'} sub={h.topDoctor ? `${h.topDoctor.value} completed` : ''} />
            <AnalyticsCard label="Highest conversion" value={h.highestConversionDoctor?.doctorName || '—'} sub={h.highestConversionDoctor ? `${h.highestConversionDoctor.value}% upsell conversion` : ''} />
            <AnalyticsCard label="Most utilized" value={h.mostUtilizedDoctor?.doctorName || '—'} sub={h.mostUtilizedDoctor ? `${h.mostUtilizedDoctor.value}% utilization` : ''} />
            <AnalyticsCard label="Repeat clients" value={fmtPct(t.repeatClientPct)} sub={`${t.uniqueClients} unique clients`} />
          </div>

          <div className="grid-dash">
            <div className="card"><h2>Bookings by day</h2>
              <ColumnChart data={data.series.byDay.map((d) => ({ label: formatKeyDayMonth(d.date), sub: formatKeyShort(d.date), values: d }))} series={[{ key: 'bookings', label: 'Bookings' }]} emptyText="Choose a range of 3 months or less for daily data." />
            </div>
            <div className="card"><h2>Completed vs cancelled</h2>
              <ColumnChart data={data.series.byDay.map((d) => ({ label: formatKeyDayMonth(d.date), sub: formatKeyShort(d.date), values: d }))} series={[{ key: 'completed', label: 'Completed' }, { key: 'cancelled', label: 'Cancelled' }]} />
            </div>
            <div className="card"><h2>Upsell GMV by day</h2>
              <ColumnChart data={data.series.byDay.map((d) => ({ label: formatKeyDayMonth(d.date), sub: formatKeyShort(d.date), values: d }))} series={[{ key: 'gmv', label: 'GMV (AED)' }]} format={(v) => Math.round(v).toLocaleString()} />
            </div>
            <div className="card"><h2>Bookings by doctor</h2>
              <HBarList items={data.doctors.filter((d) => d.total).map((d) => ({ label: d.doctorName, value: d.total }))} />
            </div>
            <div className="card"><h2>On-time calling by doctor</h2>
              <HBarList max={100} items={data.doctors.filter((d) => d.calls).map((d) => ({ label: d.doctorName, value: d.onTimePct, display: `${d.onTimePct}% (${d.onTimeCalls}/${d.calls})` }))} emptyText="No calls recorded." />
            </div>
            <div className="card"><h2>Upsell conversion by doctor</h2>
              <HBarList max={100} items={data.doctors.filter((d) => d.upsellOpportunities).map((d) => ({ label: d.doctorName, value: d.upsellConversionPct, display: `${d.upsellConversionPct}% (${d.upsellsBooked}/${d.upsellOpportunities})` }))} emptyText="No upsell opportunities recorded." />
            </div>
            <div className="card"><h2>Upsell GMV by doctor</h2>
              <HBarList items={data.doctors.filter((d) => d.upsellGmv).map((d) => ({ label: d.doctorName, value: d.upsellGmv, display: fmtMoney(d.upsellGmv) }))} emptyText="No booked upsells." />
            </div>
            <div className="card"><h2>Doctor utilization</h2>
              <HBarList max={100} items={data.doctors.filter((d) => d.workingMinutes).map((d) => ({ label: d.doctorName, value: d.utilizationPct || 0, display: `${d.utilizationPct ?? 0}% · ${d.bookedHours}/${d.workingHours} h` }))} emptyText="No working hours in this period." />
            </div>
            <div className="card"><h2>Booking source</h2>
              <HBarList items={data.series.bySource.map((s) => ({ label: SOURCE_LABEL[s.label] || s.label, value: s.value }))} />
            </div>
            <div className="card"><h2>Contact method</h2>
              <HBarList items={data.series.byContact.map((s) => ({ label: CONTACT_LABEL[s.label], value: s.value }))} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
