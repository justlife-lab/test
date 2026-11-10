'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useData } from '@/components/admin/useData';
import { api } from '@/lib/client-api';
import DoctorForm from '@/components/admin/DoctorForm';
import { Avatar, Loading, Modal, StatusBadge, useToast } from '@/components/ui';
import { DAY_SHORT } from '@/lib/time';

export default function DoctorsPage() {
  const { data, error } = useData('/api/admin/doctors');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function create(body) {
    setBusy(true);
    try {
      const d = await api('/api/admin/doctors', { method: 'POST', body });
      toast('Doctor created. Default hours: Mon–Thu 09:00–17:00, Fri 09:00–14:00.');
      router.push(`/admin/doctors/${d.id}`);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Doctors</h1><p>Profiles, working hours, leave and portal access.</p></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>Add doctor</button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!data ? <Loading /> : data.length === 0 ? (
        <div className="card empty"><h3>No doctors yet</h3><p>Add your first doctor to start taking bookings.</p><button className="btn btn-primary" onClick={() => setCreating(true)}>Add doctor</button></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Doctor</th><th>Specialty</th><th>Languages</th><th>Working days</th><th>Portal login</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => router.push(`/admin/doctors/${d.id}`)}>
                  <td data-label="">
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <Avatar src={d.photoUrl} name={d.name} size="sm" />
                      <div style={{ textAlign: 'left' }}><Link href={`/admin/doctors/${d.id}`} onClick={(e) => e.stopPropagation()}><strong>{d.name}</strong></Link><div className="tiny muted">{d.email}</div></div>
                    </div>
                  </td>
                  <td data-label="Specialty">{d.specialty} · {d.experienceYears}y</td>
                  <td data-label="Languages">{d.languages.join(', ')}</td>
                  <td data-label="Working days">{d.workingDays.length ? d.workingDays.map((x) => DAY_SHORT[x]).join(' ') : <span className="muted">No hours set</span>}</td>
                  <td data-label="Portal login">{d.login ? (d.login.status === 'ACTIVE' ? 'Enabled' : 'Disabled') : <span className="muted">Not set</span>}</td>
                  <td data-label="Status"><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <Modal title="Add doctor" onClose={() => setCreating(false)} wide>
          <DoctorForm onSubmit={create} submitLabel="Create doctor" withPassword busy={busy} />
        </Modal>
      )}
    </>
  );
}
