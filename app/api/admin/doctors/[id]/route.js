// GET   /api/admin/doctors/:id — full profile, schedule, leaves, blocks, login
// PATCH /api/admin/doctors/:id — update profile / status
import { handler, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { doctorSchema } from '@/lib/validation';
import { loadDoctorAdmin } from '@/lib/doctors';
import { audit, actorFromSession } from '@/lib/audit';
import { AppError, notFound } from '@/lib/errors';

export const GET = handler(async ({ params }) => {
  const d = await loadDoctorAdmin(params.id);
  if (!d) throw notFound('Doctor not found.');
  return d;
}, { roles: ['ADMIN'] });

export const PATCH = handler(async ({ req, params, user }) => {
  const old = await db.get('doctors', params.id, { fresh: true });
  if (!old) throw notFound('Doctor not found.');
  const input = doctorSchema.partial().parse(await readJson(req));
  if (input.email && input.email.toLowerCase() !== old.email?.toLowerCase()) {
    const e = input.email.toLowerCase();
    const { doctors, users } = await db.tables(['doctors', 'users'], { fresh: true });
    if (doctors.some((d) => d.id !== params.id && d.email?.toLowerCase() === e) || users.some((u) => u.doctorId !== params.id && u.email?.toLowerCase() === e)) {
      throw new AppError('DUPLICATE', 'Another account already uses this email.', 409);
    }
  }
  await db.update('doctors', params.id, input);
  // Keep the portal login email in sync with the doctor's email.
  if (input.email && input.email !== old.email) {
    const logins = (await db.all('users')).filter((u) => u.doctorId === params.id).map((u) => u.id);
    if (logins.length) await db.updateMany('users', logins, { email: input.email });
  }
  await audit(actorFromSession({ user }), input.status && input.status !== old.status ? 'DOCTOR_STATUS_CHANGED' : 'DOCTOR_UPDATED', {
    entityType: 'doctor', entityId: params.id, summary: old.name,
    oldValue: Object.fromEntries(Object.keys(input).map((k) => [k, old[k]])), newValue: input,
  });
  return loadDoctorAdmin(params.id);
}, { roles: ['ADMIN'] });
