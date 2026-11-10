// GET  /api/admin/bookings?q=&doctorId=&status=&contactMethod=&upsellStatus=&from=&to=&page=&pageSize=&sort=
// POST /api/admin/bookings — manual booking by admin/CX (availability still enforced)
import { z } from 'zod';
import { handler, readJson, searchParams } from '@/lib/api';
import { sortBy, paginate } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { createBooking } from '@/lib/booking';
import { actorFromSession } from '@/lib/audit';
import {
  nameSchema, emailSchema, mobileSchema, bookingRefSchema, contactSchema, isoDateTime,
} from '@/lib/validation';
import { filteredBookings } from '@/lib/booking-query';

export const GET = handler(async ({ req }) => {
  const sp = searchParams(req);
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(sp.get('pageSize')) || 25));
  const all = await filteredBookings(sp);
  const rows = paginate(sortBy(all, ['startAt', sp.get('sort') === 'asc' ? 'asc' : 'desc']), page, pageSize).map((a) => ({
    id: a.id, appointmentNo: a.appointmentNo, bookingReference: a.bookingReference, status: a.status, source: a.source,
    startAt: a.startAt, endAt: a.endAt, contactMethod: a.contactMethod, callDelayMinutes: a.callDelayMinutes, createdAt: a.createdAt,
    clientId: a.client.id, clientName: a.client.name, clientEmail: a.client.email, clientMobile: a.client.mobile,
    doctorId: a.doctor.id, doctorName: a.doctor.name,
    upsellStatuses: a.upsells.map((u) => u.status),
  }));
  return { rows, total: all.length, page, pageSize };
}, { roles: ['ADMIN'] });

const createSchema = z.object({
  clientId: z.string().max(64).optional(),
  client: z.object({ name: nameSchema, email: emailSchema, mobile: mobileSchema }).optional(),
  bookingReference: bookingRefSchema,
  doctorId: z.string().min(1).max(64),
  startAt: isoDateTime,
  contactMethod: contactSchema,
  adminNotes: z.string().trim().max(2000).optional().nullable(),
  clientNotes: z.string().trim().max(1000).optional().nullable(),
}).refine((v) => v.clientId || v.client, 'Choose an existing client or enter client details');

export const POST = handler(async ({ req, user }) => {
  const input = createSchema.parse(await readJson(req));
  const settings = await getSettings();
  const appt = await createBooking({
    mode: 'admin', settings, actor: actorFromSession({ user }), source: 'ADMIN',
    clientId: input.clientId, client: input.client, doctorId: input.doctorId, startAt: input.startAt,
    contactMethod: input.contactMethod, bookingReference: input.bookingReference,
    adminNotes: input.adminNotes, clientNotes: input.clientNotes,
  });
  return { id: appt.id, appointmentNo: appt.appointmentNo };
}, { roles: ['ADMIN'] });
