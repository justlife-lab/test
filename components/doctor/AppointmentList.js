'use client';
import { useData } from '@/components/admin/useData';
import { Loading } from '@/components/ui';
import { dateKey, relativeDayLabel, formatKeyLong } from '@/lib/time';
import AppointmentCard from './AppointmentCard';

/** Appointments for the signed-in doctor, grouped by day. */
export default function AppointmentList({ range, from, to, emptyText = 'No appointments.', grouped = true }) {
  const q = new URLSearchParams({ range, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const { data, error } = useData(`/api/doctor/appointments?${q}`);
  if (error) return <div className="notice error">{error}</div>;
  if (!data) return <Loading rows={3} />;
  if (!data.rows.length) return <div className="card empty"><h3>{emptyText}</h3></div>;
  if (!grouped) return <div className="appt-list">{data.rows.map((a) => <AppointmentCard key={a.id} a={a} />)}</div>;
  const days = {};
  for (const a of data.rows) (days[dateKey(a.startAt)] ||= []).push(a);
  return Object.entries(days).map(([k, list]) => (
    <section key={k}>
      <h2 className="day-head">{relativeDayLabel(k)} <span className="muted small">{formatKeyLong(k)} · {list.filter((x) => x.status !== 'CANCELLED').length} appointment(s)</span></h2>
      <div className="appt-list">{list.map((a) => <AppointmentCard key={a.id} a={a} />)}</div>
    </section>
  ));
}
