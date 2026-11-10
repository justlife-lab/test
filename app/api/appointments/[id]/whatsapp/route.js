// GET /api/appointments/:id/whatsapp — redirects the signed-in doctor/admin to
// wa.me/<client number>. The number never appears in a public page or URL.
import { NextResponse } from 'next/server';
import { handler } from '@/lib/api';
import { loadAccessibleAppointment } from '@/lib/consultation';
import { audit } from '@/lib/audit';

export const GET = handler(async ({ params, user }) => {
  const appt = await loadAccessibleAppointment(params.id, user);
  const digits = appt.client.mobile.replace(/\D/g, '');
  const text = encodeURIComponent(`Hello ${appt.client.name.split(' ')[0]}, this is ${appt.doctor.name} from Justlife Healthcare regarding your teleconsultation (${appt.appointmentNo}).`);
  await audit({ type: user.role, id: user.id, email: user.email }, 'WHATSAPP_OPENED', { appointmentId: appt.id });
  return NextResponse.redirect(`https://wa.me/${digits}?text=${text}`, 302);
}, { roles: ['DOCTOR', 'ADMIN'] });
