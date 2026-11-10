// GET /api/admin/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&doctorId=&showInactive=1
// Appointments + each doctor's working windows for the master calendar.
import { handler, searchParams } from '@/lib/api';
import { db, sortBy } from '@/lib/db';
import { getWorkingWindows, AVAILABILITY_TABLES } from '@/lib/availability';
import { doctorPhotoUrl } from '@/lib/url';
import { dateKey, addDays, toUtc, isDateKey, diffDays } from '@/lib/time';
import { badRequest } from '@/lib/errors';

export const GET = handler(async ({ req }) => {
  const sp = searchParams(req);
  const from = isDateKey(sp.get('from')) ? sp.get('from') : dateKey();
  const to = isDateKey(sp.get('to')) ? sp.get('to') : from;
  if (to < from || diffDays(from, to) > 42) throw badRequest('Choose a range of up to 6 weeks.');
  const doctorId = sp.get('doctorId') || null;

  const data = await db.tables([...AVAILABILITY_TABLES, 'clients']);
  const doctors = sortBy(data.doctors.filter((d) => (doctorId ? d.id === doctorId : (sp.get('showInactive') || d.status === 'ACTIVE'))), 'sortOrder', 'name');

  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const t0 = toUtc(from); const t1 = toUtc(addDays(to, 1));
  const appts = sortBy(data.appointments.filter((a) => a.startAt >= t0 && a.startAt < t1 && (!doctorId || a.doctorId === doctorId) && clients.has(a.clientId)), 'startAt')
    .map((a) => ({
      id: a.id, appointmentNo: a.appointmentNo, bookingReference: a.bookingReference, doctorId: a.doctorId, status: a.status,
      startAt: a.startAt, endAt: a.endAt, contactMethod: a.contactMethod, clientName: clients.get(a.clientId).name,
    }));

  return {
    from, to,
    doctors: doctors.map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, status: d.status, photoUrl: doctorPhotoUrl(d), consultationMinutes: d.consultationMinutes })),
    windows: doctors.length ? await getWorkingWindows({ doctorIds: doctors.map((d) => d.id), fromKey: from, toKey: to, data }) : {},
    appointments: appts,
  };
}, { roles: ['ADMIN'] });
