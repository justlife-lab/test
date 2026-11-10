// POST /api/admin/emails/:id/retry — resend a failed (or any) logged email
import { handler } from '@/lib/api';
import { retryEmail } from '@/lib/notifications/email';
import { audit, actorFromSession } from '@/lib/audit';
import { notFound } from '@/lib/errors';

export const POST = handler(async ({ params, user }) => {
  const row = await retryEmail(params.id);
  if (!row) throw notFound();
  await audit(actorFromSession({ user }), 'EMAIL_RETRIED', { appointmentId: row.appointmentId, entityType: 'email', entityId: row.id, newValue: { status: row.status } });
  return { id: row.id, status: row.status, error: row.error };
}, { roles: ['ADMIN'] });
