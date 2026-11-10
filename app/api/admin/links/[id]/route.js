// PATCH /api/admin/links/:id { status: 'CANCELLED'|'ACTIVE', expiresOn?: 'YYYY-MM-DD'|null }
import { z } from 'zod';
import { handler, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { linkOut } from '@/lib/booking';
import { audit, actorFromSession } from '@/lib/audit';
import { notFound } from '@/lib/errors';
import { dateKeySchema } from '@/lib/validation';
import { toUtc } from '@/lib/time';

const body = z.object({ status: z.enum(['CANCELLED', 'ACTIVE']).optional(), expiresOn: dateKeySchema.nullable().optional() });

export const PATCH = handler(async ({ req, params, user }) => {
  const input = body.parse(await readJson(req));
  const set = {};
  if (input.status) set.status = input.status;
  if (input.expiresOn !== undefined) set.expiresAt = input.expiresOn ? toUtc(input.expiresOn, '23:59') : null;
  const row = await db.update('bookingLinks', params.id, set);
  if (!row) throw notFound();
  await audit(actorFromSession({ user }), 'BOOKING_LINK_UPDATED', { entityType: 'bookingLink', entityId: row.id, newValue: input });
  return linkOut(row);
}, { roles: ['ADMIN'] });
