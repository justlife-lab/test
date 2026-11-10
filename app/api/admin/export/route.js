// GET /api/admin/export?<same filters as /api/admin/bookings> — bookings CSV
// (operational data only; clinical notes are never exported).
import { handler, searchParams } from '@/lib/api';
import { sortBy } from '@/lib/db';
import { filteredBookings } from '@/lib/booking-query';
import { toCsv } from '@/lib/csv';
import { dateKey, clockTime } from '@/lib/time';
import { audit, actorFromSession } from '@/lib/audit';

export const GET = handler(async ({ req, user }) => {
  const sp = searchParams(req);
  const rows = sortBy(await filteredBookings(sp), 'startAt').slice(0, 20000).map((a) => ({
    ...a, clientName: a.client.name, clientEmail: a.client.email, clientMobile: a.client.mobile, doctorName: a.doctor.name,
  }));
  const upBy = Object.fromEntries(rows.map((r) => [r.id, r.upsells]));
  const booked = (r) => (upBy[r.id] || []).filter((u) => ['BOOKED', 'COMPLETED'].includes(u.status));
  const csv = toCsv(rows, [
    { label: 'Appointment ID', value: (r) => r.appointmentNo },
    { label: 'Justlife Ref', value: (r) => r.bookingReference },
    { label: 'Date (Dubai)', value: (r) => dateKey(r.startAt) },
    { label: 'Start', value: (r) => clockTime(r.startAt) },
    { label: 'End', value: (r) => clockTime(r.endAt) },
    { label: 'Doctor', value: (r) => r.doctorName },
    { label: 'Client', value: (r) => r.clientName },
    { label: 'Email', value: (r) => r.clientEmail },
    { label: 'Mobile', value: (r) => r.clientMobile },
    { label: 'Contact', value: (r) => r.contactMethod },
    { label: 'Status', value: (r) => r.status },
    { label: 'Source', value: (r) => r.source },
    { label: 'Call delay (min)', value: (r) => r.callDelayMinutes },
    { label: 'Outcome', value: (r) => r.outcome },
    { label: 'Upsells', value: (r) => (upBy[r.id] || []).map((u) => `${u.service}:${u.status}`).join('; ') },
    { label: 'Upsell GMV', value: (r) => booked(r).reduce((s, u) => s + Number(u.bookedAmount ?? u.recommendedAmount ?? 0), 0) },
    { label: 'Created', value: (r) => r.createdAt },
  ]);
  await audit(actorFromSession({ user }), 'DATA_EXPORTED', { entityType: 'export', summary: `${rows.length} bookings` });
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="justlife-teleconsultations-${dateKey()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}, { roles: ['ADMIN'] });
