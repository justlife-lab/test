// POST   /api/admin/doctors/:id/leaves  { from: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', reason? }
// DELETE /api/admin/doctors/:id/leaves?leaveId=…
// Leave dates immediately disappear from client availability. Existing
// bookings on those dates are returned as conflicts for the admin to handle.
import { z } from 'zod';
import { handler, readJson, searchParams } from '@/lib/api';
import { db } from '@/lib/db';
import { dateKeySchema } from '@/lib/validation';
import { eachDay, diffDays, toUtc, addDays } from '@/lib/time';
import { ACTIVE_STATUSES } from '@/lib/availability';
import { audit, actorFromSession } from '@/lib/audit';
import { badRequest, notFound } from '@/lib/errors';

const body = z.object({ from: dateKeySchema, to: dateKeySchema.optional(), reason: z.string().trim().max(200).optional().nullable() });

export const POST = handler(async ({ req, params, user }) => {
  const input = body.parse(await readJson(req));
  const to = input.to && input.to >= input.from ? input.to : input.from;
  if (diffDays(input.from, to) > 120) throw badRequest('Leave ranges are limited to 120 days at a time.');
  const dates = eachDay(input.from, to);
  const t = await db.tables(['doctors', 'doctorLeaves', 'appointments'], { fresh: true });
  if (!t.doctors.some((d) => d.id === params.id)) throw notFound('Doctor not found.');
  const have = new Set(t.doctorLeaves.filter((l) => l.doctorId === params.id).map((l) => l.date));
  const add = dates.filter((date) => !have.has(date));
  if (add.length) await db.insert('doctorLeaves', add.map((date) => ({ doctorId: params.id, date, reason: input.reason || null })));
  await audit(actorFromSession({ user }), 'DOCTOR_LEAVE_ADDED', { entityType: 'doctor', entityId: params.id, newValue: { from: input.from, to, reason: input.reason } });
  const t0 = toUtc(input.from); const t1 = toUtc(addDays(to, 1));
  const conflicts = t.appointments
    .filter((a) => a.doctorId === params.id && ACTIVE_STATUSES.includes(a.status) && a.startAt >= t0 && a.startAt < t1)
    .map(({ id, appointmentNo, startAt }) => ({ id, appointmentNo, startAt }));
  return { added: dates.length, conflicts };
}, { roles: ['ADMIN'] });

export const DELETE = handler(async ({ req, params, user }) => {
  const leaveId = searchParams(req).get('leaveId');
  const found = await db.get('doctorLeaves', leaveId, { fresh: true });
  if (!found || found.doctorId !== params.id) throw notFound();
  const row = await db.remove('doctorLeaves', found.id);
  await audit(actorFromSession({ user }), 'DOCTOR_LEAVE_REMOVED', { entityType: 'doctor', entityId: params.id, oldValue: row });
  return { ok: true };
}, { roles: ['ADMIN'] });
