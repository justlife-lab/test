// GET  /api/admin/doctors — all doctors (any status)
// POST /api/admin/doctors — create doctor (+ optional schedule & portal password)
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { handler, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { doctorsWithSchedules } from '@/lib/availability';
import { doctorSchema } from '@/lib/validation';
import { adminDoctor } from '@/lib/serializers';
import { scheduleSchema, DEFAULT_WEEK } from '@/lib/doctors';
import { audit, actorFromSession } from '@/lib/audit';
import { AppError } from '@/lib/errors';

export const GET = handler(async () => {
  const t = await db.tables(['doctors', 'doctorSchedules', 'users']);
  const rows = doctorsWithSchedules(t, { onlyActive: false });
  const byDoctor = new Map(t.users.filter((u) => u.role === 'DOCTOR')
    .map((u) => [u.doctorId, { doctorId: u.doctorId, status: u.status, lastLogin: u.lastLogin }]));
  return rows.map((d) => ({
    ...adminDoctor(d),
    workingDays: [...new Set(d.schedules.map((s) => s.dayOfWeek))].filter((x) => !d.weeklyOffDays.includes(x)).sort(),
    login: byDoctor.get(d.id) || null,
  }));
}, { roles: ['ADMIN'] });

const createSchema = doctorSchema.extend({
  password: z.string().min(10, 'Password must be at least 10 characters').max(200).optional().nullable().or(z.literal('')),
  schedule: scheduleSchema.optional(),
});

export const POST = handler(async ({ req, user }) => {
  const input = createSchema.parse(await readJson(req));
  const { password, schedule, ...doctor } = input;
  const sched = schedule ?? { weeklyOffDays: [0, 6], periods: DEFAULT_WEEK };
  if (await emailTaken(doctor.email)) throw new AppError('DUPLICATE', 'A doctor or user with this email already exists.', 409);
  const sortOrder = doctor.sortOrder ?? (await db.all('doctors')).length;
  const d = await db.insert('doctors', { ...doctor, sortOrder, weeklyOffDays: sched.weeklyOffDays });
  if (sched.periods.length) await db.insert('doctorSchedules', sched.periods.map((p) => ({ ...p, doctorId: d.id })));
  if (password) {
    await db.insert('users', {
      email: d.email, name: d.name, role: 'DOCTOR', status: 'ACTIVE', doctorId: d.id, passwordHash: await bcrypt.hash(password, 12),
    });
  }
  await audit(actorFromSession({ user }), 'DOCTOR_CREATED', { entityType: 'doctor', entityId: d.id, summary: d.name, newValue: doctor });
  return adminDoctor(d);
}, { roles: ['ADMIN'] });

/** Emails are unique across Users and Doctors (the sheet can't enforce it). */
async function emailTaken(email, { exceptDoctorId } = {}) {
  const e = String(email).toLowerCase();
  const { doctors, users } = await db.tables(['doctors', 'users'], { fresh: true });
  return doctors.some((d) => d.email?.toLowerCase() === e && d.id !== exceptDoctorId)
    || users.some((u) => u.email?.toLowerCase() === e && (!exceptDoctorId || u.doctorId !== exceptDoctorId));
}

