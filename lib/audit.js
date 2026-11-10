// Audit trail ("AuditLog" tab). Every write path calls audit(). Logging never
// breaks the user's action: a failed write is reported to the server log only.
import 'server-only';
import { db } from '@/lib/db';

/**
 * @param {object} actor  { type: 'ADMIN'|'DOCTOR'|'CLIENT'|'SYSTEM'|'INTEGRATION', id?, email? }
 * @param {string} action e.g. 'BOOKING_CREATED'
 * @param {object} data   { appointmentId?, entityType?, entityId?, summary?, oldValue?, newValue?, reason?, ip? }
 */
export async function audit(actor, action, data = {}) {
  try {
    await db.insert('auditLogs', {
      actorType: actor?.type ?? 'SYSTEM',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action,
      appointmentId: data.appointmentId ?? null,
      entityType: data.entityType ?? (data.appointmentId ? 'appointment' : null),
      entityId: data.entityId ?? data.appointmentId ?? null,
      summary: data.summary ?? null,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      reason: data.reason ?? null,
      ip: data.ip ?? null,
    });
  } catch (err) {
    console.error('[audit] failed to write', action, err);
  }
}

export const actorFromSession = (session) => (session?.user
  ? { type: session.user.role === 'DOCTOR' ? 'DOCTOR' : 'ADMIN', id: session.user.id, email: session.user.email }
  : { type: 'SYSTEM' });

export const CLIENT_ACTOR = { type: 'CLIENT' };
