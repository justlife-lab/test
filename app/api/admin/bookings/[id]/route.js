// GET   /api/admin/bookings/:id — full detail incl. history, audit, emails, reschedule link
// PATCH /api/admin/bookings/:id — { action: 'cancel', reason }
//                                 { action: 'status', status: 'COMPLETED'|'NO_SHOW'|'SCHEDULED' }
//                                 { action: 'update', adminNotes?, contactMethod?, bookingReference? }
import { z } from 'zod';
import { handler, readJson } from '@/lib/api';
import { db, sortBy } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { cancelAppointment, getRescheduleChain } from '@/lib/booking';
import { loadAccessibleAppointment, appointmentDetail } from '@/lib/consultation';
import { audit, actorFromSession } from '@/lib/audit';
import { rescheduleLinkUrl } from '@/lib/url';
import { AppError } from '@/lib/errors';
import { bookingRefSchema } from '@/lib/validation';

async function detail(id, user) {
  const appt = await loadAccessibleAppointment(id, user);
  const [chain, t] = await Promise.all([getRescheduleChain(appt), db.tables(['auditLogs', 'emailLogs'])]);
  const logs = sortBy(t.auditLogs.filter((l) => l.appointmentId === id), ['createdAt', 'desc']).slice(0, 100);
  const emails = sortBy(t.emailLogs.filter((e) => e.appointmentId === id), ['createdAt', 'desc'])
    .map(({ id: eid, type, status, recipient, sentAt, createdAt, error }) => ({ id: eid, type, status, recipient, sentAt, createdAt, error }));
  const hist = (x) => ({ id: x.id, appointmentNo: x.appointmentNo, status: x.status, startAt: x.startAt, endAt: x.endAt, doctorName: x.doctor?.name, source: x.source, rescheduleReason: x.rescheduleReason });
  return {
    ...appointmentDetail(appt, { includeAdmin: true }),
    rescheduleLink: appt.rescheduleToken ? rescheduleLinkUrl(appt.rescheduleToken) : null,
    history: { before: chain.before.map(hist), after: chain.after.map(hist) },
    audit: logs,
    emails,
  };
}

export const GET = handler(async ({ params, user }) => detail(params.id, user), { roles: ['ADMIN'] });

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cancel'), reason: z.string().trim().max(500).optional().nullable() }),
  z.object({ action: z.literal('status'), status: z.enum(['COMPLETED', 'NO_SHOW', 'SCHEDULED']) }),
  z.object({
    action: z.literal('update'),
    adminNotes: z.string().trim().max(2000).optional().nullable(),
    contactMethod: z.enum(['PHONE', 'WHATSAPP']).optional(),
    bookingReference: bookingRefSchema.optional(),
  }),
]);

const TRANSITIONS = {
  SCHEDULED: ['COMPLETED', 'NO_SHOW'],
  CALLING: ['COMPLETED', 'NO_SHOW', 'SCHEDULED'],
  NO_SHOW: ['SCHEDULED', 'COMPLETED'],
  COMPLETED: ['NO_SHOW'],
};

export const PATCH = handler(async ({ req, params, user }) => {
  const input = body.parse(await readJson(req));
  const actor = actorFromSession({ user });
  const appt = await loadAccessibleAppointment(params.id, user);

  if (input.action === 'cancel') {
    await cancelAppointment({ appointmentId: appt.id, reason: input.reason, actor, mode: 'admin', settings: await getSettings() });
  } else if (input.action === 'status') {
    if (!(TRANSITIONS[appt.status] || []).includes(input.status)) {
      throw new AppError('INVALID_STATE', `Cannot change status from ${appt.status} to ${input.status}.`, 409);
    }
    await db.update('appointments', appt.id, { status: input.status });
    await audit(actor, input.status === 'COMPLETED' ? 'CONSULTATION_COMPLETED' : 'BOOKING_STATUS_CHANGED', {
      appointmentId: appt.id, oldValue: { status: appt.status }, newValue: { status: input.status },
    });
  } else {
    const set = {};
    for (const k of ['adminNotes', 'contactMethod', 'bookingReference']) if (input[k] !== undefined) set[k] = input[k];
    await db.update('appointments', appt.id, set);
    await audit(actor, 'BOOKING_UPDATED', {
      appointmentId: appt.id, oldValue: Object.fromEntries(Object.keys(set).map((k) => [k, appt[k] ?? null])), newValue: set,
    });
  }
  return detail(params.id, user);
}, { roles: ['ADMIN'] });
