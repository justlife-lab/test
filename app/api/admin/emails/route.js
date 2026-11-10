// GET /api/admin/emails?status=&type=&q=&page= — email delivery log ("EmailLog" tab)
import { handler, searchParams } from '@/lib/api';
import { db, ilike, sortBy, paginate } from '@/lib/db';

export const GET = handler(async ({ req }) => {
  const sp = searchParams(req);
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = 30;
  const { emailLogs, appointments } = await db.tables(['emailLogs', 'appointments']);
  const appts = new Map(appointments.map((a) => [a.id, a]));
  const status = ['PENDING', 'SENT', 'DELIVERED', 'FAILED'].includes(sp.get('status')) ? sp.get('status') : null;
  const type = sp.get('type');
  const q = (sp.get('q') || '').trim().slice(0, 100);
  const rows = emailLogs.filter((e) => {
    if (status && e.status !== status) return false;
    if (type && e.type !== type) return false;
    if (!q) return true;
    const a = appts.get(e.appointmentId);
    return ilike(e.recipient, q) || ilike(e.recipientName, q) || ilike(a?.appointmentNo, q) || ilike(a?.bookingReference, q);
  });
  const out = paginate(sortBy(rows, ['createdAt', 'desc']), page, pageSize).map((e) => ({
    id: e.id, recipient: e.recipient, recipientName: e.recipientName, type: e.type, subject: e.subject, status: e.status,
    provider: e.provider, error: e.error, attempts: e.attempts, sentAt: e.sentAt, deliveredAt: e.deliveredAt, createdAt: e.createdAt,
    appointmentId: e.appointmentId, appointmentNo: appts.get(e.appointmentId)?.appointmentNo ?? null,
    bookingReference: appts.get(e.appointmentId)?.bookingReference ?? null,
  }));
  return { rows: out, total: rows.length, page, pageSize };
}, { roles: ['ADMIN'] });
