// POST /api/appointments/:id/call
//   { action: 'start', method? }                         Scheduled → Calling
//   { action: 'complete', notes, outcome?, callMethod? } Calling → Completed
//   { action: 'no_show', outcome? }                      → No Show
import { z } from 'zod';
import { handler, readJson } from '@/lib/api';
import {
  loadAccessibleAppointment, startCall, completeConsultation, markNoShow, appointmentDetail,
} from '@/lib/consultation';

const body = z.object({
  action: z.enum(['start', 'complete', 'no_show']),
  method: z.enum(['PHONE', 'WHATSAPP']).optional(),
  callMethod: z.enum(['PHONE', 'WHATSAPP']).optional(),
  outcome: z.string().trim().max(200).optional().nullable(),
  notes: z.record(z.any()).optional(),
});

export const POST = handler(async ({ req, params, user }) => {
  const input = body.parse(await readJson(req));
  const appt = await loadAccessibleAppointment(params.id, user);
  let out;
  if (input.action === 'start') out = await startCall(appt, user, { method: input.method });
  else if (input.action === 'complete') out = await completeConsultation(appt, user, input);
  else out = await markNoShow(appt, user, input);
  return appointmentDetail(out, { includeAdmin: user.role === 'ADMIN' });
}, { roles: ['DOCTOR', 'ADMIN'] });
