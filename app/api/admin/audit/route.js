// GET /api/admin/audit?q=&action=&actorType=&page= — audit trail ("AuditLog" tab)
import { handler, searchParams } from '@/lib/api';
import { db, ilike, sortBy, paginate } from '@/lib/db';

export const GET = handler(async ({ req }) => {
  const sp = searchParams(req);
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = 50;
  const { auditLogs, appointments } = await db.tables(['auditLogs', 'appointments']);
  const appts = new Map(appointments.map((a) => [a.id, a]));
  const action = sp.get('action');
  const actorType = ['ADMIN', 'DOCTOR', 'CLIENT', 'SYSTEM', 'INTEGRATION'].includes(sp.get('actorType')) ? sp.get('actorType') : null;
  const q = (sp.get('q') || '').trim().slice(0, 100);
  const rows = auditLogs.filter((l) => {
    if (action && l.action !== action) return false;
    if (actorType && l.actorType !== actorType) return false;
    if (!q) return true;
    const a = appts.get(l.appointmentId);
    return ilike(l.actorEmail, q) || ilike(l.summary, q) || ilike(a?.appointmentNo, q) || ilike(a?.bookingReference, q);
  });
  const pageRows = paginate(sortBy(rows, ['createdAt', 'desc']), page, pageSize).map((l) => ({
    id: l.id, actorType: l.actorType, actorEmail: l.actorEmail, action: l.action, summary: l.summary, reason: l.reason,
    oldValue: l.oldValue, newValue: l.newValue, createdAt: l.createdAt, appointmentId: l.appointmentId,
    appointmentNo: appts.get(l.appointmentId)?.appointmentNo ?? null,
  }));
  return { rows: pageRows, total: rows.length, page, pageSize };
}, { roles: ['ADMIN'] });
