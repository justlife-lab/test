// POST /api/admin/bookings/:id/move { doctorId, startAt, contactMethod?, reason?, viaDrag? }
// Admin reschedule / drag-and-drop. Validates working hours, off days, leave,
// blocked time and clashes; on failure returns 409 with
// "This doctor is not available during the selected time."
// History is kept: the old version becomes RESCHEDULED, a new one is SCHEDULED.
import { z } from 'zod';
import { handler, readJson } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { rescheduleAppointment } from '@/lib/booking';
import { actorFromSession } from '@/lib/audit';
import { isoDateTime } from '@/lib/validation';

const body = z.object({
  doctorId: z.string().min(1).max(64),
  startAt: isoDateTime,
  contactMethod: z.enum(['PHONE', 'WHATSAPP']).optional(),
  reason: z.string().trim().max(500).optional().nullable(),
  viaDrag: z.boolean().optional(),
});

export const POST = handler(async ({ req, params, user }) => {
  const input = body.parse(await readJson(req));
  const next = await rescheduleAppointment({
    appointmentId: params.id, mode: 'admin', settings: await getSettings(), actor: actorFromSession({ user }),
    newDoctorId: input.doctorId, newStartAt: input.startAt, contactMethod: input.contactMethod,
    reason: input.reason, viaDrag: input.viaDrag,
  });
  return { id: next.id, appointmentNo: next.appointmentNo };
}, { roles: ['ADMIN'] });
