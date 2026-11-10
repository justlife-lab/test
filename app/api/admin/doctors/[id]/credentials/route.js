// POST /api/admin/doctors/:id/credentials { password, status? } — create or
// reset the doctor's portal login. Login email = doctor's email.
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { handler, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, actorFromSession } from '@/lib/audit';
import { AppError, notFound } from '@/lib/errors';

const body = z.object({
  password: z.string().min(10, 'Password must be at least 10 characters').max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const POST = handler(async ({ req, params, user }) => {
  const input = body.parse(await readJson(req));
  const { doctors, users } = await db.tables(['doctors', 'users'], { fresh: true });
  const doc = doctors.find((d) => d.id === params.id);
  if (!doc) throw notFound('Doctor not found.');
  const existing = users.find((u) => u.doctorId === params.id);
  const set = {};
  if (input.password) set.passwordHash = await bcrypt.hash(input.password, 12);
  if (input.status) set.status = input.status;

  if (existing) {
    if (existing.role !== 'DOCTOR') throw new AppError('FORBIDDEN', 'This login is not a doctor account.', 403);
    await db.update('users', existing.id, set);
  } else {
    if (!input.password) throw new AppError('BAD_REQUEST', 'Set a password to create the login.', 400);
    const clash = users.find((u) => u.email?.toLowerCase() === doc.email.toLowerCase());
    if (clash) throw new AppError('DUPLICATE', 'This email is already used by an admin account. Use a different email for the doctor.', 409);
    await db.insert('users', { email: doc.email, name: doc.name, role: 'DOCTOR', status: 'ACTIVE', doctorId: doc.id, ...set });
  }
  await audit(actorFromSession({ user }), input.password ? 'DOCTOR_PASSWORD_SET' : 'DOCTOR_LOGIN_STATUS', {
    entityType: 'doctor', entityId: doc.id, summary: doc.name, newValue: { status: input.status ?? 'ACTIVE' },
  });
  return { ok: true, loginEmail: doc.email };
}, { roles: ['ADMIN'] });
