'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useData } from '@/components/admin/useData';
import { api, qs } from '@/lib/client-api';
import { Loading, Pager, StatusBadge, useToast } from '@/components/ui';
import { formatDateTime } from '@/lib/time';

const TYPES = { BOOKING_CONFIRMED: 'Booking confirmed', BOOKING_RESCHEDULED: 'Rescheduled', BOOKING_CANCELLED: 'Cancelled', APPOINTMENT_REMINDER: 'Reminder', DOCTOR_ASSIGNED: 'Doctor assigned' };

export default function EmailLog() {
  const toast = useToast();
  const [f, setF] = useState({ status: '', type: '', q: '' });
  const [page, setPage] = useState(1);
  const { data, error, reload } = useData(`/api/admin/emails${qs({ ...f, page })}`);
  async function retry(id) {
    try { const r = await api(`/api/admin/emails/${id}/retry`, { method: 'POST' }); toast(r.status === 'SENT' ? 'Email sent.' : `Failed again: ${r.error}`, r.status === 'SENT' ? 'info' : 'error'); reload(); } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <>
      <div className="page-head"><div><h1>Email log</h1><p>Every confirmation, reschedule, cancellation and reminder email.</p></div></div>
      <div className="toolbar">
        <input className="input search" placeholder="Search recipient or booking…" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} />
        <select className="select select-sm" value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option>{['SENT', 'DELIVERED', 'FAILED', 'PENDING'].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
        </select>
        <select className="select select-sm" value={f.type} onChange={(e) => { setF({ ...f, type: e.target.value }); setPage(1); }} aria-label="Type">
          <option value="">All types</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading /> : data.rows.length === 0 ? <div className="card empty"><h3>No emails yet</h3></div> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Client</th><th>Booking</th><th>Email type</th><th>Sent time</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.rows.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Client">{m.recipientName || '—'}<div className="tiny muted">{m.recipient}</div></td>
                    <td data-label="Booking">{m.appointmentId ? <Link href={`/admin/bookings/${m.appointmentId}`}>{m.appointmentNo}</Link> : '—'}</td>
                    <td data-label="Email type">{TYPES[m.type] || m.type}</td>
                    <td data-label="Sent time">{formatDateTime(m.sentAt || m.createdAt)}{m.attempts > 1 && <div className="tiny muted">{m.attempts} attempts</div>}</td>
                    <td data-label="Status"><StatusBadge status={m.status} />{m.error && <div className="tiny" style={{ color: 'var(--red)', maxWidth: 260 }}>{m.error}</div>}</td>
                    <td data-label="">{m.status === 'FAILED' && <button className="btn btn-sm" onClick={() => retry(m.id)}>Retry</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
