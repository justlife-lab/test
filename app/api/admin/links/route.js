// GET  /api/admin/links — booking links with live status
// POST /api/admin/links { label?, justlifeReference?, expiry: 'never'|'date'|'once', expiresAt? }
import { z } from 'zod';
import { handler, readJson, searchParams } from '@/lib/api';
import { db, sortBy } from '@/lib/db';
import { secureToken } from '@/lib/tokens';
import { linkOut } from '@/lib/booking';
import { audit, actorFromSession } from '@/lib/audit';
import { badRequest } from '@/lib/errors';
import { dateKeySchema } from '@/lib/validation';
import { toUtc } from '@/lib/time';

export const GET = handler(async ({ req }) => {
  const limit = Math.min(200, Number(searchParams(req).get('limit')) || 100);
  return sortBy(await db.all('bookingLinks'), ['createdAt', 'desc']).slice(0, limit).map(linkOut);
}, { roles: ['ADMIN'] });

const body = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  justlifeReference: z.string().trim().max(40).optional().nullable(),
  expiry: z.enum(['never', 'date', 'once']).default('once'),
  expiresOn: dateKeySchema.optional().nullable(),
});

export const POST = handler(async ({ req, user }) => {
  const input = body.parse(await readJson(req));
  if (input.expiry === 'date' && !input.expiresOn) throw badRequest('Choose the expiry date.');
  const row = await db.insert('bookingLinks', {
    token: secureToken(),
    label: input.label || null,
    justlifeReference: input.justlifeReference || null,
    singleUse: input.expiry === 'once',
    expiresAt: input.expiry === 'date' ? toUtc(input.expiresOn, '23:59') : null,
    createdById: user.id,
    createdByEmail: user.email,
  });
  await audit(actorFromSession({ user }), 'BOOKING_LINK_CREATED', { entityType: 'bookingLink', entityId: row.id, newValue: { expiry: input.expiry, label: input.label } });
  return linkOut(row);
}, { roles: ['ADMIN'] });
