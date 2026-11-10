// PATCH / DELETE /api/appointments/:id/upsells/:upsellId
import { handler, readJson } from '@/lib/api';
import { loadAccessibleAppointment, updateUpsell, deleteUpsell } from '@/lib/consultation';

export const PATCH = handler(async ({ req, params, user }) => {
  const appt = await loadAccessibleAppointment(params.id, user);
  return updateUpsell(appt, user, params.upsellId, await readJson(req));
}, { roles: ['DOCTOR', 'ADMIN'] });

export const DELETE = handler(async ({ params, user }) => {
  const appt = await loadAccessibleAppointment(params.id, user);
  await deleteUpsell(appt, user, params.upsellId);
  return { ok: true };
}, { roles: ['DOCTOR', 'ADMIN'] });
