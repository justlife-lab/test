'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useData } from '@/components/admin/useData';
import { qs } from '@/lib/client-api';
import { Loading, Pager } from '@/components/ui';
import { formatDateTime } from '@/lib/time';

const label = (a) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function AuditLog() {
  const [f, setF] = useState({ q: '', actorType: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, error } = useData(`/api/admin/audit${qs({ ...f, page })}`);
  return (
    <>
      <div className="page-head"><div><h1>Audit log</h1><p>Who created, changed, moved, cancelled or completed what — and every sign-in.</p></div></div>
      <div className="toolbar">
        <input className="input search" placeholder="Search user, booking or summary…" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} />
        <select className="select select-sm" value={f.actorType} onChange={(e) => { setF({ ...f, actorType: e.target.value }); setPage(1); }} aria-label="Actor">
          <option value="">Everyone</option><option value="ADMIN">Admins</option><option value="DOCTOR">Doctors</option><option value="CLIENT">Clients</option><option value="SYSTEM">System</option><option value="INTEGRATION">Integrations</option>
        </select>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Booking</th><th>Details</th></tr></thead>
              <tbody>
                {data.rows.map((l) => (
                  <tr key={l.id}>
                    <td data-label="When" className="nowrap">{formatDateTime(l.createdAt)}</td>
                    <td data-label="Who">{l.actorType === 'CLIENT' ? `Client${l.actorEmail ? ` (${l.actorEmail})` : ''}` : `${l.actorType[0]}${l.actorType.slice(1).toLowerCase()}: ${l.actorEmail || '—'}`}</td>
                    <td data-label="Action"><strong>{label(l.action)}</strong></td>
                    <td data-label="Booking">{l.appointmentId ? <Link href={`/admin/bookings/${l.appointmentId}`}>{l.appointmentNo}</Link> : '—'}</td>
                    <td data-label="Details">
                      {l.summary}{l.reason && <div className="tiny muted">Reason: {l.reason}</div>}
                      {(l.oldValue || l.newValue) && <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Hide' : 'Changes'}</button>}
                      {open === l.id && <pre className="tiny" style={{ whiteSpace: 'pre-wrap', textAlign: 'left', background: 'var(--mist)', padding: 8, borderRadius: 8 }}>{JSON.stringify({ from: l.oldValue, to: l.newValue }, null, 2)}</pre>}
                    </td>
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
