// GET /api/admin/clients?q=&page=&pageSize= — clients with booking stats
import { handler, searchParams } from '@/lib/api';
import { db, groupBy, ilike, sortBy, paginate } from '@/lib/db';

export const GET = handler(async ({ req }) => {
  const sp = searchParams(req);
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(sp.get('pageSize')) || 25));
  const q = (sp.get('q') || '').trim().slice(0, 100);
  const digits = q.replace(/\D/g, '').replace(/^00/, '').replace(/^971/, '').replace(/^0+/, '');
  const { clients, appointments } = await db.tables(['clients', 'appointments']);
  const byClient = groupBy(appointments, 'clientId');
  const matched = clients.filter((c) => !q || ilike(c.name, q) || ilike(c.email, q) || ilike(c.mobile, q) || ilike(c.bookingReference, q)
    || (digits.length >= 4 && String(c.mobile).replace(/\D/g, '').includes(digits)));
  const rows = matched.map((c) => {
    const as = byClient.get(c.id) || [];
    const last = as.reduce((m, a) => (!m || a.startAt > m ? a.startAt : m), null);
    return {
      id: c.id, name: c.name, email: c.email, mobile: c.mobile, bookingReference: c.bookingReference, createdAt: c.createdAt,
      appointments: as.filter((a) => a.status !== 'RESCHEDULED').length,
      completed: as.filter((a) => a.status === 'COMPLETED').length,
      lastAppointment: last,
    };
  });
  return { rows: paginate(sortBy(rows, ['lastAppointment', 'desc']), page, pageSize), total: rows.length, page, pageSize };
}, { roles: ['ADMIN'] });
