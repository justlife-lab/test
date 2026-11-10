'use client';
// Doctor editor: profile & photo, portal login, weekly schedule (multiple
// periods per day), weekly off days, leave dates and blocked time.
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/components/admin/useData';
import { api } from '@/lib/client-api';
import DoctorForm from '@/components/admin/DoctorForm';
import { Avatar, Field, Loading, StatusBadge, useToast } from '@/components/ui';
import { DAY_NAMES, formatKeyShort, formatDateTime, dateKey, toUtc } from '@/lib/time';

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

function ScheduleEditor({ doctor, onSaved }) {
  const toast = useToast();
  const [off, setOff] = useState(doctor.weeklyOffDays);
  const [periods, setPeriods] = useState(doctor.schedules);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOff(doctor.weeklyOffDays); setPeriods(doctor.schedules); }, [doctor]);

  const forDay = (d) => periods.map((p, i) => ({ ...p, i })).filter((p) => p.dayOfWeek === d);
  const update = (i, k, v) => setPeriods((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const add = (d) => {
    const last = forDay(d).at(-1);
    setPeriods((ps) => [...ps, last ? { dayOfWeek: d, startTime: last.endTime, endTime: last.endTime < '20:00' ? '20:00' : '23:00' } : { dayOfWeek: d, startTime: '09:00', endTime: '17:00' }]);
  };
  const toggleOff = (d) => setOff((o) => (o.includes(d) ? o.filter((x) => x !== d) : [...o, d]));
  const copyMonday = () => setPeriods((ps) => {
    const mon = ps.filter((p) => p.dayOfWeek === 1);
    return [...mon, ...[2, 3, 4, 5].flatMap((d) => mon.map((p) => ({ ...p, dayOfWeek: d }))), ...ps.filter((p) => [0, 6].includes(p.dayOfWeek))];
  });

  async function save() {
    setBusy(true);
    try {
      const res = await api(`/api/admin/doctors/${doctor.id}/schedule`, { method: 'PUT', body: { weeklyOffDays: off, periods } });
      toast(res.conflicts.length ? `Saved. ${res.conflicts.length} upcoming booking(s) now fall outside working hours — please reschedule them.` : 'Working hours saved.', res.conflicts.length ? 'error' : 'info');
      onSaved(res.doctor);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="panel-title">
        <h2>Working hours</h2>
        <button className="btn btn-ghost btn-sm" onClick={copyMonday}>Copy Monday to Tue–Fri</button>
      </div>
      <p className="small muted">All times are Dubai time. Add a second period for split shifts (e.g. 09:00–13:00 and 16:00–20:00).</p>
      <div className="stack">
        {ORDER.map((d) => {
          const isOff = off.includes(d);
          const ps = forDay(d);
          return (
            <div key={d} className="row" style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
              <div style={{ width: 110 }}><strong>{DAY_NAMES[d]}</strong></div>
              <label className="check" style={{ width: 110 }}><input type="checkbox" checked={isOff} onChange={() => toggleOff(d)} /> Weekly off</label>
              <div className="grow stack" style={{ opacity: isOff ? 0.4 : 1 }}>
                {ps.length === 0 && <span className="small muted">OFF — no working periods</span>}
                {ps.map((p) => (
                  <div className="row" key={p.i}>
                    <input className="input input-sm" type="time" step="900" style={{ width: 120 }} value={p.startTime} onChange={(e) => update(p.i, 'startTime', e.target.value)} aria-label={`${DAY_NAMES[d]} start`} />
                    <span>–</span>
                    <input className="input input-sm" type="time" step="900" style={{ width: 120 }} value={p.endTime} onChange={(e) => update(p.i, 'endTime', e.target.value)} aria-label={`${DAY_NAMES[d]} end`} />
                    <button className="btn btn-ghost btn-sm" onClick={() => setPeriods((x) => x.filter((_, j) => j !== p.i))}>Remove</button>
                  </div>
                ))}
                <div><button className="btn btn-sm" onClick={() => add(d)} disabled={isOff}>Add period</button></div>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save working hours'}</button>
    </div>
  );
}

function LeaveEditor({ doctor, reload }) {
  const toast = useToast();
  const [from, setFrom] = useState(dateKey());
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [bDate, setBDate] = useState(dateKey());
  const [bFrom, setBFrom] = useState('13:00');
  const [bTo, setBTo] = useState('14:00');
  const [bReason, setBReason] = useState('');

  async function addLeave(e) {
    e.preventDefault();
    try {
      const res = await api(`/api/admin/doctors/${doctor.id}/leaves`, { method: 'POST', body: { from, to: to || undefined, reason } });
      toast(res.conflicts.length ? `Leave added. ${res.conflicts.length} existing booking(s) on these dates need rescheduling.` : `Leave added (${res.added} day${res.added === 1 ? '' : 's'}).`, res.conflicts.length ? 'error' : 'info');
      setReason(''); setTo(''); reload();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function removeLeave(id) {
    await api(`/api/admin/doctors/${doctor.id}/leaves?leaveId=${id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    reload();
  }
  async function addBlock(e) {
    e.preventDefault();
    try {
      await api(`/api/admin/doctors/${doctor.id}/blocks`, { method: 'POST', body: { startAt: toUtc(bDate, bFrom).toISOString(), endAt: toUtc(bDate, bTo).toISOString(), reason: bReason } });
      toast('Time blocked.'); setBReason(''); reload();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function removeBlock(id) {
    await api(`/api/admin/doctors/${doctor.id}/blocks?blockId=${id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    reload();
  }
  const upcomingLeaves = doctor.leaves.filter((l) => l.date >= dateKey());

  return (
    <div className="card stack">
      <h2>Leave &amp; holidays</h2>
      <form className="row" onSubmit={addLeave}>
        <input className="input input-sm" type="date" required value={from} min={dateKey()} onChange={(e) => setFrom(e.target.value)} aria-label="Leave from" style={{ width: 160 }} />
        <span className="small muted">to</span>
        <input className="input input-sm" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Leave to (optional)" style={{ width: 160 }} />
        <input className="input input-sm grow" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minWidth: 140 }} />
        <button className="btn btn-sm btn-primary">Add leave</button>
      </form>
      {upcomingLeaves.length === 0 ? <p className="small muted">No upcoming leave.</p> : (
        <div className="row">
          {upcomingLeaves.map((l) => (
            <span key={l.id} className="badge s-ON_LEAVE" style={{ gap: 8 }}>
              {formatKeyShort(l.date)}{l.reason ? ` · ${l.reason}` : ''}
              <button className="btn-ghost" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => removeLeave(l.id)} aria-label={`Remove leave ${l.date}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <hr className="hr" />
      <h3>Block part of a day</h3>
      <form className="row" onSubmit={addBlock}>
        <input className="input input-sm" type="date" required value={bDate} min={dateKey()} onChange={(e) => setBDate(e.target.value)} style={{ width: 160 }} aria-label="Date" />
        <input className="input input-sm" type="time" value={bFrom} onChange={(e) => setBFrom(e.target.value)} style={{ width: 110 }} aria-label="From" />
        <input className="input input-sm" type="time" value={bTo} onChange={(e) => setBTo(e.target.value)} style={{ width: 110 }} aria-label="To" />
        <input className="input input-sm grow" placeholder="Reason" value={bReason} onChange={(e) => setBReason(e.target.value)} style={{ minWidth: 120 }} />
        <button className="btn btn-sm">Block time</button>
      </form>
      {doctor.blockedSlots.map((b) => (
        <div key={b.id} className="row small">
          <span className="grow">{formatDateTime(b.startAt)} – {formatDateTime(b.endAt).split(', ')[1]} {b.reason && <span className="muted">· {b.reason}</span>}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => removeBlock(b.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}

function AccessCard({ doctor, reload }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const photo = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function setPassword(e) {
    e.preventDefault();
    try { await api(`/api/admin/doctors/${doctor.id}/credentials`, { method: 'POST', body: { password: pw } }); setPw(''); toast(`Login ready: ${doctor.email}`); reload(); } catch (err) { toast(err.message, 'error'); }
  }
  async function toggle() {
    const status = doctor.login.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try { await api(`/api/admin/doctors/${doctor.id}/credentials`, { method: 'POST', body: { status } }); reload(); } catch (err) { toast(err.message, 'error'); }
  }
  async function upload(file) {
    if (!file) return;
    setUploading(true);
    const form = new FormData(); form.set('file', file);
    try {
      const r = await api(`/api/admin/doctors/${doctor.id}/photo`, { method: 'POST', form });
      toast(`Photo optimised: ${Math.round(r.originalBytes / 1024)} KB → ${Math.round(r.optimizedBytes / 1024)} KB`);
      reload();
    } catch (err) { toast(err.message, 'error'); } finally { setUploading(false); if (photo.current) photo.current.value = ''; }
  }

  return (
    <div className="card stack">
      <div className="row">
        <Avatar src={doctor.photoUrl} name={doctor.name} size="lg" />
        <div className="grow">
          <h2 style={{ marginBottom: 4 }}>{doctor.name}</h2>
          <StatusBadge status={doctor.status} />
        </div>
      </div>
      <input ref={photo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <button className="btn btn-sm" onClick={() => photo.current?.click()} disabled={uploading}>{uploading ? 'Optimising…' : doctor.photoUrl ? 'Replace photo' : 'Upload photo'}</button>
      <hr className="hr" />
      <h3>Doctor portal login</h3>
      <p className="small muted" style={{ margin: 0 }}>
        {doctor.login ? <>Login: <strong>{doctor.email}</strong> · {doctor.login.status === 'ACTIVE' ? 'enabled' : 'disabled'} · last sign-in {formatDateTime(doctor.login.lastLogin)}</> : 'No login yet. Set a password to create one.'}
      </p>
      <form className="row" onSubmit={setPassword}>
        <input className="input input-sm grow" type="text" autoComplete="new-password" minLength={10} required placeholder={doctor.login ? 'New password (10+ chars)' : 'Password (10+ chars)'} value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn btn-sm btn-primary">{doctor.login ? 'Reset password' : 'Create login'}</button>
      </form>
      {doctor.login && <button className="btn btn-sm" onClick={toggle}>{doctor.login.status === 'ACTIVE' ? 'Disable login' : 'Enable login'}</button>}
    </div>
  );
}

export default function DoctorEditor() {
  const { id } = useParams();
  const { data: doctor, error, reload, setData } = useData(`/api/admin/doctors/${id}`);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function saveProfile(body) {
    setBusy(true);
    try { setData(await api(`/api/admin/doctors/${id}`, { method: 'PATCH', body })); toast('Profile saved.'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!doctor) return <Loading rows={5} />;
  return (
    <>
      <div className="page-head">
        <div><Link href="/admin/doctors" className="small">Doctors</Link><h1>{doctor.name}</h1></div>
        <Link className="btn" href={`/admin/calendar?doctorId=${doctor.id}&view=week`}>View calendar</Link>
      </div>
      <div className="grid-side">
        <div className="stack">
          <ScheduleEditor doctor={doctor} onSaved={setData} />
          <LeaveEditor doctor={doctor} reload={reload} />
          <div className="card"><h2>Profile</h2><DoctorForm key={doctor.id + doctor.email} initial={doctor} onSubmit={saveProfile} busy={busy} submitLabel="Save profile" /></div>
        </div>
        <AccessCard doctor={doctor} reload={reload} />
      </div>
    </>
  );
}
