// Shared filter for admin booking search, CSV export and reports.
// Returns rows joined with client & doctor:  { ...appointment, client, doctor, upsells }
import 'server-only';
import { db, groupBy } from '@/lib/db';
import { toUtc, addDays, isDateKey } from '@/lib/time';

const STATUSES = ['SCHEDULED', 'CALLING', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'];
const UPSELL_STATUSES = ['RECOMMENDED', 'INTERESTED', 'BOOKED', 'COMPLETED', 'NOT_INTERESTED'];
const has = (v, q) => String(v ?? '').toLowerCase().includes(q);

export async function filteredBookings(sp) {
  const t = await db.tables(['appointments', 'clients', 'doctors', 'upsells']);
  const clients = new Map(t.clients.map((c) => [c.id, c]));
  const doctors = new Map(t.doctors.map((d) => [d.id, d]));
  const ups = groupBy(t.upsells, 'appointmentId');

  const q = (sp.get('q') || '').trim().slice(0, 100).toLowerCase();
  // Match mobiles however they're typed: "050 123 4567", "+971 50…", "971…".
  const digits = q.replace(/\D/g, '').replace(/^00/, '').replace(/^971/, '').replace(/^0+/, '');
  const doctorId = sp.get('doctorId');
  const statuses = (sp.get('status') || '').split(',').filter((s) => STATUSES.includes(s));
  const contact = ['PHONE', 'WHATSAPP'].includes(sp.get('contactMethod')) ? sp.get('contactMethod') : null;
  const from = isDateKey(sp.get('from')) ? toUtc(sp.get('from')) : null;
  const to = isDateKey(sp.get('to')) ? toUtc(addDays(sp.get('to'), 1)) : null;
  const us = sp.get('upsellStatus');

  const out = [];
  for (const a of t.appointments) {
    const c = clients.get(a.clientId);
    const d = doctors.get(a.doctorId);
    if (!c || !d) continue;
    if (doctorId && a.doctorId !== doctorId) continue;
    if (statuses.length && !statuses.includes(a.status)) continue;
    if (contact && a.contactMethod !== contact) continue;
    if (from && !(a.startAt >= from)) continue;
    if (to && !(a.startAt < to)) continue;
    const u = ups.get(a.id) || [];
    if (us === 'ANY' && !u.length) continue;
    if (UPSELL_STATUSES.includes(us) && !u.some((x) => x.status === us)) continue;
    if (q && !(has(c.name, q) || has(c.email, q) || has(a.bookingReference, q) || has(a.appointmentNo, q) || has(d.name, q)
      || a.id === q || (digits.length >= 4 && String(c.mobile).replace(/\D/g, '').includes(digits)))) continue;
    out.push({ ...a, client: c, doctor: d, upsells: u });
  }
  return out;
}
