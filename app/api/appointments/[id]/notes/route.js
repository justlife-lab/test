// PUT /api/appointments/:id/notes — save consultation notes (draft or edit).
import { handler, readJson } from '@/lib/api';
import { loadAccessibleAppointment, saveNotes, appointmentDetail } from '@/lib/consultation';

export const PUT = handler(async ({ req, params, user }) => {
  const appt = await loadAccessibleAppointment(params.id, user);
  const out = await saveNotes(appt, user, await readJson(req));
  return appointmentDetail(out, { includeAdmin: user.role === 'ADMIN' });
}, { roles: ['DOCTOR', 'ADMIN'] });
