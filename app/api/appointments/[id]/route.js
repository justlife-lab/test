// GET /api/appointments/:id — doctor (own only) or admin.
import { handler } from '@/lib/api';
import { loadAccessibleAppointment, appointmentDetail } from '@/lib/consultation';

export const GET = handler(async ({ params, user }) => {
  const appt = await loadAccessibleAppointment(params.id, user);
  return appointmentDetail(appt, { includeAdmin: user.role === 'ADMIN' });
}, { roles: ['DOCTOR', 'ADMIN'] });
