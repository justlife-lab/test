// POST   /api/admin/doctors/:id/blocks  { startAt, endAt, reason? } — block part of a day
// DELETE /api/admin/doctors/:id/blocks?blockId=…
import { z } from 'zod';
import { handler, readJson, searchParams } from '@/lib/api';
import { db } from '@/lib/db';
import { isoDateTime } from '@/lib/validation';
import { audit, actorFromSession } from '@/lib/audit';
import { badRequest, notFound } from '@/lib/errors';

const body = z.object({ startAt: isoDateTime, endAt: isoDateTime, reason: z.string().trim().max(200).optional().nullable() });

export const POST = handler(async ({ req, params, user }) => {
  const input = body.parse(await readJson(req));
  if (input.endAt <= input.startAt) throw badRequest('End must be after start.');
  if (!(await db.get('doctors', params.id))) throw notFound('Doctor not found.');
  const row = await db.insert('blockedSlots', { doctorId: params.id, ...input, createdBy: user.email });
  await audit(actorFromSession({ user }), 'DOCTOR_TIME_BLOCKED', { entityType: 'doctor', entityId: params.id, newValue: input });
  return row;
}, { roles: ['ADMIN'] });

export const DELETE = handler(async ({ req, params, user }) => {
  const blockId = searchParams(req).get('blockId');
  const found = await db.get('blockedSlots', blockId, { fresh: true });
  if (!found || found.doctorId !== params.id) throw notFound();
  const row = await db.remove('blockedSlots', found.id);
  await audit(actorFromSession({ user }), 'DOCTOR_TIME_UNBLOCKED', { entityType: 'doctor', entityId: params.id, oldValue: row });
  return { ok: true };
}, { roles: ['ADMIN'] });
