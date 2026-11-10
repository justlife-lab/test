'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useData } from '@/components/admin/useData';
import { qs } from '@/lib/client-api';
import { Loading, Pager } from '@/components/ui';
import { formatDateShort } from '@/lib/time';

export default function ClientsPage() {
  const [q, setQ] = useState('');
  const [d, setD] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setD(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, error } = useData(`/api/admin/clients${qs({ q: d, page })}`);
  return (
    <>
      <div className="page-head"><div><h1>Clients</h1><p>Everyone who has booked a teleconsultation.</p></div></div>
      <div className="toolbar"><input className="input search" type="search" placeholder="Search name, email, mobile or Justlife reference…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" /></div>
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading /> : data.rows.length === 0 ? <div className="card empty"><h3>No clients found</h3></div> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Client</th><th>Mobile</th><th>Latest Justlife ref</th><th>Bookings</th><th>Completed</th><th>Last appointment</th></tr></thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Client"><Link href={`/admin/bookings?q=${encodeURIComponent(c.email)}`}><strong>{c.name}</strong></Link><div className="tiny muted">{c.email}</div></td>
                    <td data-label="Mobile">{c.mobile}</td>
                    <td data-label="Justlife ref">{c.bookingReference || '—'}</td>
                    <td data-label="Bookings">{c.appointments}</td>
                    <td data-label="Completed">{c.completed}</td>
                    <td data-label="Last appointment">{c.lastAppointment ? formatDateShort(c.lastAppointment) : '—'}</td>
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
