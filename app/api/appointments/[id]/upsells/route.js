// POST /api/appointments/:id/upsells — record a recommended service.
import { handler, readJson } from '@/lib/api';
import { loadAccessibleAppointment, addUpsell } from '@/lib/consultation';

export const POST = handler(async ({ req, params, user }) => {
  const appt = await loadAccessibleAppointment(params.id, user);
  return addUpsell(appt, user, await readJson(req));
}, { roles: ['DOCTOR', 'ADMIN'] });
