// PATCH /api/admin/users/:id { status } — deactivate/reactivate an admin.
// Deactivation takes effect on the user's next request (sessions are re-checked).
import { z } from 'zod';
import { handler, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, actorFromSession } from '@/lib/audit';
import { badRequest, notFound } from '@/lib/errors';

export const PATCH = handler(async ({ req, params, user }) => {
  const { status } = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).parse(await readJson(req));
  if (params.id === user.id) throw badRequest('You cannot change your own access.');
  const target = await db.get('users', params.id, { fresh: true });
  if (!target || target.role !== 'ADMIN') throw notFound();
  const row = await db.update('users', target.id, { status });
  await audit(actorFromSession({ user }), 'ADMIN_ACCESS_CHANGED', { entityType: 'user', entityId: row.id, summary: row.email, newValue: { status } });
  return { ok: true };
}, { roles: ['ADMIN'] });
