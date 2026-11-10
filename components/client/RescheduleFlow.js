'use client';
// =============================================================================
// Client reschedule / cancel via secure token — no account needed.
// Current appointment → choose new date → doctors available that day →
// pick a 1-hour window → optional reason → confirm. Server re-checks everything.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateLong, formatRange, relativeDayLabel } from '@/lib/time';
import { Avatar, Loading, Modal, Spinner, CONTACT_LABEL } from '@/components/ui';
import Calendar from './Calendar';
import TimeSlots from './TimeSlot';
import DoctorProfile from './DoctorProfile';
import BookingConfirmation from './BookingConfirmation';

const REASONS = ['Not available at selected time', 'Need a different doctor', 'Need a different date', 'Other'];

export default function RescheduleFlow({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [doctors, setDoctors] = useState(null);
  const [day, setDay] = useState('');
  const [pick, setPick] = useState(null); // { doctorId, startAt, endAt }
  const [contact, setContact] = useState('');
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  const loadAvailability = useCallback(async () => {
    const res = await api(`/api/public/availability?kind=reschedule&t=${encodeURIComponent(token)}`);
    setDoctors(res.doctors);
    return res.doctors;
  }, [token]);

  useEffect(() => {
    api(`/api/public/reschedule/${encodeURIComponent(token)}`).then((r) => {
      setInfo(r);
      setContact(r.appointment.contactMethod);
      if (r.canReschedule) loadAvailability().catch((e) => setNotice(e.message));
    }).catch((e) => setError(e.message));
  }, [token, loadAvailability]);

  const current = info?.appointment;
  // Hide the client's own current slot (they can't "move" to where they already are).
  const visible = useMemo(() => (doctors || []).map((d) => ({
    ...d,
    days: Object.fromEntries(Object.entries(d.days).map(([k, slots]) => [k, slots.filter((s) => !(d.id === current?.doctor.id && s.startAt === new Date(current.startAt).toISOString()))]).filter(([, s]) => s.length)),
  })), [doctors, current]);
  const dateCounts = useMemo(() => {
    const c = {};
    for (const d of visible) for (const [k, s] of Object.entries(d.days)) c[k] = (c[k] || 0) + s.length;
    return c;
  }, [visible]);
  const dates = Object.keys(dateCounts).sort();
  useEffect(() => { if (!day && dates.length) setDay(dates[0]); }, [dates, day]);
  const doctorsOnDay = visible.filter((d) => d.days[day]?.length)
    .sort((a, b) => (b.id === current?.doctor.id) - (a.id === current?.doctor.id));

  async function confirm() {
    if (!pick) return;
    const finalReason = reason === 'Other' ? (other.trim() ? `Other: ${other.trim()}` : 'Other') : reason;
    if (info.settings.requireRescheduleReason && !finalReason) { setNotice('Please tell us why you would like to reschedule.'); return; }
    setBusy(true); setNotice('');
    try {
      const res = await api(`/api/public/reschedule/${encodeURIComponent(token)}`, {
        method: 'POST', body: { action: 'reschedule', doctorId: pick.doctorId, startAt: pick.startAt, contactMethod: contact, reason: finalReason || null },
      });
      setDone(res.appointment);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setNotice(e.message);
      setPick(null);
      await loadAvailability().catch(() => {});
    } finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true);
    try {
      const finalReason = reason === 'Other' ? other.trim() || 'Other' : reason;
      await api(`/api/public/reschedule/${encodeURIComponent(token)}`, { method: 'POST', body: { action: 'cancel', reason: finalReason || null } });
      setCancelOpen(false);
      setInfo((i) => ({ ...i, appointment: { ...i.appointment, status: 'CANCELLED' }, canReschedule: false, canCancel: false }));
    } catch (e) { setNotice(e.message); setCancelOpen(false); } finally { setBusy(false); }
  }

  if (error) return <div className="empty"><h1>Link unavailable</h1><p>{error}</p></div>;
  if (!info) return <Loading rows={4} />;
  if (done) {
    return (
      <BookingConfirmation title="Your appointment has been rescheduled successfully." intro="We've emailed you the new details. Your previous appointment has been released." booking={done}>
        <p className="small" style={{ marginTop: 14 }}>You can use this same link again if you need to make another change.</p>
      </BookingConfirmation>
    );
  }

  const cancelled = current.status === 'CANCELLED';
  return (
    <>
      <section className="intro">
        <h1>{cancelled ? 'Appointment cancelled' : `Hello ${current.clientFirstName}, need to change your appointment?`}</h1>
      </section>

      <div className="card" style={{ margin: '18px 0' }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Current appointment</h3>
          <span className="small muted">{current.appointmentNo}</span>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <Avatar src={current.doctor.photoUrl} name={current.doctor.name} />
          <div><strong>{current.doctor.name}</strong><div className="small muted">{current.doctor.specialty}</div></div>
        </div>
        <dl className="summary-list">
          <div><dt>Date</dt><dd style={cancelled ? { textDecoration: 'line-through' } : undefined}>{formatDateLong(current.startAt)}</dd></div>
          <div><dt>Time</dt><dd>{formatRange(current.startAt, current.endAt)}</dd></div>
          <div><dt>Contact</dt><dd>{CONTACT_LABEL[current.contactMethod]}</dd></div>
        </dl>
      </div>

      {notice && <div className="notice error" role="alert" style={{ marginBottom: 16 }}>{notice}</div>}

      {!info.canReschedule && !cancelled && (
        <div className="notice warn">{info.closedReason || 'This appointment can no longer be rescheduled online. Please contact Justlife Healthcare for assistance.'}
          <br /><span className="small">{info.settings.supportEmail} · {info.settings.supportPhone}</span></div>
      )}
      {cancelled && <div className="notice">This appointment has been cancelled. To book again, please contact Justlife Healthcare at {info.settings.supportPhone}.</div>}

      {info.canReschedule && (
        <div className="stack">
          <h2>Choose a new appointment</h2>
          {!doctors ? <Loading rows={2} /> : (
            <>
              <Calendar dates={dates} counts={dateCounts} value={day} onChange={(k) => { setDay(k); setPick(null); }} />
              {day && <h3 style={{ marginTop: 6 }}>Doctors available {['Today', 'Tomorrow'].includes(relativeDayLabel(day)) ? relativeDayLabel(day).toLowerCase() : `on ${relativeDayLabel(day)}`}</h3>}
              {doctorsOnDay.map((d) => (
                <div key={d.id} className="doctor-card" aria-selected={pick?.doctorId === d.id}>
                  <div className="top">
                    <Avatar src={d.photoUrl} name={d.name} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <h3>{d.name}{d.id === current.doctor.id && <span className="badge s-SCHEDULED" style={{ marginLeft: 8 }}>Your doctor</span>}</h3>
                      <div className="spec">{d.specialty} · {d.languages?.join(' | ')}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setProfile(d)}>Profile</button>
                  </div>
                  <TimeSlots slots={d.days[day]} value={pick?.doctorId === d.id ? pick.startAt : null}
                    onChange={(s) => setPick({ doctorId: d.id, ...s, doctor: d })} />
                </div>
              ))}
            </>
          )}

          {pick && (
            <div className="card stack">
              <h3>Confirm the change</h3>
              <p className="small muted" style={{ margin: 0 }}>
                New: <strong style={{ color: 'var(--ink)' }}>{pick.doctor.name}</strong>, {formatDateLong(pick.startAt)}, {formatRange(pick.startAt, pick.endAt)}
              </p>
              <div className="label">How will the doctor contact you?</div>
              <div className="choices">
                {['PHONE', 'WHATSAPP'].map((v) => (
                  <button key={v} type="button" className="choice" aria-pressed={contact === v} onClick={() => setContact(v)}><strong>{CONTACT_LABEL[v]}</strong></button>
                ))}
              </div>
              <label className="label" htmlFor="reason">Why would you like to reschedule? {!info.settings.requireRescheduleReason && <span className="muted">(optional)</span>}</label>
              <select id="reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Select a reason</option>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              {reason === 'Other' && <input className="input" placeholder="Other reason" maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} />}
            </div>
          )}
        </div>
      )}

      {(info.canReschedule || info.canCancel) && (
        <div className="sticky-cta">
          <div className="inner">
            {info.canCancel && <button className="btn btn-lg btn-danger" onClick={() => setCancelOpen(true)} disabled={busy}>Cancel appointment</button>}
            {info.canReschedule && (
              <button className="btn btn-primary btn-lg" onClick={confirm} disabled={!pick || busy}>
                {busy ? <><Spinner /> Saving…</> : 'Confirm Reschedule'}
              </button>
            )}
          </div>
        </div>
      )}

      {cancelOpen && (
        <Modal title="Cancel this appointment?" onClose={() => setCancelOpen(false)}>
          <p>Your teleconsultation on {formatDateLong(current.startAt)} ({formatRange(current.startAt, current.endAt)}) will be cancelled and the time released.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setCancelOpen(false)}>Keep appointment</button>
            <button className="btn btn-ink grow" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel appointment'}</button>
          </div>
        </Modal>
      )}
      {profile && <DoctorProfile doctor={profile} onClose={() => setProfile(null)} />}
    </>
  );
}
