'use client';
import Link from 'next/link';
import { StatusBadge, CONTACT_LABEL } from '@/components/ui';
import { formatTime } from '@/lib/time';

/** One-tap appointment row: time window, client, booking ref, contact, status. */
export default function AppointmentCard({ a }) {
  const now = Date.now();
  const isNow = new Date(a.startAt) <= now && new Date(a.endAt) > now && ['SCHEDULED', 'CALLING'].includes(a.status);
  const [t, p] = formatTime(a.startAt).split(' ');
  return (
    <Link href={`/doctor/appointments/${a.id}`} className={`appt-card${isNow ? ' is-now' : ''}`}>
      <div className="when">
        <div className="window">{t}<small style={{ fontSize: '.55em' }}> {p}</small></div>
        <div className="tiny muted">to {formatTime(a.endAt)}</div>
      </div>
      <div className="who">
        <strong>{a.clientName}</strong>
        <span className="small muted">{a.bookingReference} · {CONTACT_LABEL[a.contactMethod]}</span>
      </div>
      <StatusBadge status={a.status} />
    </Link>
  );
}
