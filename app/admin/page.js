'use client';
// Admin Dashboard — live counters + period KPIs + key charts.
import Link from 'next/link';
import { useState } from 'react';
import { useData } from '@/components/admin/useData';
import { qs } from '@/lib/client-api';
import PeriodFilter from '@/components/admin/PeriodFilter';
import { AnalyticsCard, ColumnChart, HBarList } from '@/components/admin/Charts';
import { Loading, fmtMoney, fmtPct } from '@/components/ui';
import { formatKeyDayMonth, formatKeyShort } from '@/lib/time';

export default function Dashboard() {
  const [period, setPeriod] = useState({ preset: 'thisMonth' });
  const { data, error } = useData(`/api/admin/analytics${qs(period)}`);
  const t = data?.totals;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{data ? `${formatKeyShort(data.period.fromKey)} – ${formatKeyShort(data.period.toKey)}` : 'Teleconsultation overview'}</p>
        </div>
        <div className="row">
          <Link className="btn" href="/admin/links">Create Booking Link</Link>
          <Link className="btn btn-primary" href="/admin/bookings/new">New booking</Link>
        </div>
      </div>
      <PeriodFilter value={period} onChange={setPeriod} />
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading rows={4} /> : (
        <>
          <div className="kpis six">
            <AnalyticsCard accent label="Today's bookings" value={data.live.today} sub={`${data.live.inCall} in a call now`} />
            <AnalyticsCard label="Upcoming bookings" value={data.live.upcoming} sub="Scheduled from now" />
            <AnalyticsCard label="Total bookings" value={t.total} sub={`${t.uniqueClients} clients`} />
            <AnalyticsCard label="Completed consultations" value={t.completed} sub={`${fmtPct(t.completionPct)} completion`} />
            <AnalyticsCard label="Cancelled" value={t.cancelled} sub={`${t.noShow} no-show`} />
            <AnalyticsCard label="Rescheduled" value={t.rescheduled} />
          </div>
          <div className="kpis six">
            <AnalyticsCard label="Conversion rate" value={fmtPct(t.clientConversionPct)} sub="Completed consults with a booked upsell" />
            <AnalyticsCard label="Upsell GMV" value={fmtMoney(t.upsellGmv)} sub={`${t.upsellsBooked} booked upsells`} />
            <AnalyticsCard label="Upsell conversion" value={fmtPct(t.upsellConversionPct)} sub={`${t.upsellOpportunities} opportunities`} />
            <AnalyticsCard label="On-time calling" value={fmtPct(t.onTimePct)} sub={`Within ${data.toleranceMinutes} min · avg delay ${t.avgDelayMinutes ?? '—'} min`} />
            <AnalyticsCard label="Avg consultation" value={t.avgCallMinutes != null ? `${t.avgCallMinutes} min` : '—'} sub="Call start to completion" />
            <AnalyticsCard label="Doctor utilization" value={fmtPct(t.utilizationPct)} sub={`${t.bookedHours} of ${t.workingHours} h`} />
          </div>

          <div className="grid-side">
            <div className="card">
              <div className="panel-title"><h2>Bookings by day</h2></div>
              <ColumnChart
                data={data.series.byDay.map((d) => ({ label: formatKeyDayMonth(d.date), sub: formatKeyShort(d.date), values: d }))}
                series={[{ key: 'bookings', label: 'Bookings' }, { key: 'completed', label: 'Completed' }, { key: 'cancelled', label: 'Cancelled' }]}
                emptyText={data.series.byDay.length ? 'No bookings in this period yet.' : 'Choose a range of 3 months or less to see daily data.'}
              />
            </div>
            <div className="card">
              <div className="panel-title"><h2>Highlights</h2></div>
              <dl className="summary-list">
                <div><dt>Top doctor (completed)</dt><dd>{data.highlights.topDoctor ? `${data.highlights.topDoctor.doctorName} · ${data.highlights.topDoctor.value}` : '—'}</dd></div>
                <div><dt>Highest conversion</dt><dd>{data.highlights.highestConversionDoctor ? `${data.highlights.highestConversionDoctor.doctorName} · ${data.highlights.highestConversionDoctor.value}%` : '—'}</dd></div>
                <div><dt>Most utilized</dt><dd>{data.highlights.mostUtilizedDoctor ? `${data.highlights.mostUtilizedDoctor.doctorName} · ${data.highlights.mostUtilizedDoctor.value}%` : '—'}</dd></div>
                <div><dt>Repeat clients</dt><dd>{fmtPct(t.repeatClientPct)}</dd></div>
                <div><dt>No-show rate</dt><dd>{fmtPct(t.noShowPct)}</dd></div>
              </dl>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="panel-title">
              <h2>Doctor performance</h2>
              <Link href="/admin/performance" className="btn btn-ghost btn-sm">Full report</Link>
            </div>
            <div className="grid-dash">
              <div>
                <h3 className="small muted">Consultations completed</h3>
                <HBarList items={data.doctors.filter((d) => d.total).slice(0, 8).map((d) => ({ label: d.doctorName, value: d.completed }))} />
              </div>
              <div>
                <h3 className="small muted">On-time calling %</h3>
                <HBarList max={100} items={data.doctors.filter((d) => d.calls).slice(0, 8).map((d) => ({ label: d.doctorName, value: d.onTimePct, display: `${d.onTimePct}% of ${d.calls}` }))} emptyText="No calls recorded in this period." />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
