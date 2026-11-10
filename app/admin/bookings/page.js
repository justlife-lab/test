'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useData } from '@/components/admin/useData';
import { qs } from '@/lib/client-api';
import { Loading, Pager, StatusBadge, CONTACT_LABEL, STATUS_LABEL } from '@/components/ui';
import { formatDateShort, formatRange } from '@/lib/time';

const STATUSES = ['SCHEDULED', 'CALLING', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'];

export default function BookingsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [f, setF] = useState({ doctorId: '', status: '', contactMethod: '', upsellStatus: '', from: '', to: '', sort: 'desc' });
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const params = { q: debounced, ...f, page };
  const { data, error } = useData(`/api/admin/bookings${qs(params)}`);
  const { data: doctors } = useData('/api/admin/doctors');
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };

  return (
    <>
      <div className="page-head">
        <div><h1>Bookings</h1><p>Search by client, mobile, email, booking reference, doctor or appointment ID.</p></div>
        <div className="row">
          <a className="btn" href={`/api/admin/export${qs({ q: debounced, ...f })}`}>Export CSV</a>
          <Link className="btn btn-primary" href="/admin/bookings/new">New booking</Link>
        </div>
      </div>
      <div className="toolbar">
        <input className="input search" type="search" placeholder="Search bookings…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="select select-sm" value={f.doctorId} onChange={set('doctorId')} aria-label="Doctor">
          <option value="">All doctors</option>{(doctors || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="select select-sm" value={f.status} onChange={set('status')} aria-label="Status">
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className="select select-sm" value={f.contactMethod} onChange={set('contactMethod')} aria-label="Contact method">
          <option value="">Any contact</option><option value="PHONE">Phone Call</option><option value="WHATSAPP">WhatsApp</option>
        </select>
        <select className="select select-sm" value={f.upsellStatus} onChange={set('upsellStatus')} aria-label="Upsell status">
          <option value="">Any upsell</option><option value="ANY">Has upsell</option>
          {['RECOMMENDED', 'INTERESTED', 'BOOKED', 'COMPLETED', 'NOT_INTERESTED'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input className="input input-sm" type="date" value={f.from} onChange={set('from')} aria-label="From date" />
        <input className="input input-sm" type="date" value={f.to} onChange={set('to')} aria-label="To date" />
        <select className="select select-sm" value={f.sort} onChange={set('sort')} aria-label="Sort"><option value="desc">Latest first</option><option value="asc">Earliest first</option></select>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading /> : data.rows.length === 0 ? (
        <div className="card empty"><h3>No bookings found</h3><p>Try a different search or clear the filters.</p></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date &amp; time</th><th>Client</th><th>Doctor</th><th>Booking ID</th><th>Contact</th><th>Upsell</th><th>Status</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => router.push(`/admin/bookings/${r.id}`)}>
                    <td data-label="When"><strong>{formatDateShort(r.startAt)}</strong><div className="tiny muted">{formatRange(r.startAt, r.endAt)}</div></td>
                    <td data-label="Client"><Link href={`/admin/bookings/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.clientName}</Link><div className="tiny muted">{r.clientMobile}</div></td>
                    <td data-label="Doctor">{r.doctorName}</td>
                    <td data-label="Booking ID">{r.appointmentNo}<div className="tiny muted">{r.bookingReference}</div></td>
                    <td data-label="Contact">{CONTACT_LABEL[r.contactMethod]}</td>
                    <td data-label="Upsell">{r.upsellStatuses.length ? r.upsellStatuses.map((s, i) => <StatusBadge key={i} status={s} />) : <span className="muted">—</span>}</td>
                    <td data-label="Status"><StatusBadge status={r.status} /></td>
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
