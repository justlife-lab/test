'use client';
// =============================================================================
// Client booking journey
//   1 Your details → 2 Contact & lab results → 3 Doctor → 4 Date & time → 5 Review
//   → Confirmation
// Form progress is kept in sessionStorage so a refresh doesn't lose it.
// The server re-validates everything; a slot taken in the meantime returns 409
// and the client is sent back to pick another time with fresh availability.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateWeekday, formatRange, relativeDayLabel, dateKey } from '@/lib/time';
import { isValidEmail, isValidMobile, normalizeMobile, BOOKING_REF_RE } from '@/lib/validation';
import { Field, Loading, Spinner, Avatar, CONTACT_LABEL } from '@/components/ui';
import DoctorCard from './DoctorCard';
import DoctorProfile from './DoctorProfile';
import Calendar from './Calendar';
import TimeSlots from './TimeSlot';
import FileUploader from './FileUploader';
import BookingConfirmation from './BookingConfirmation';

const STEPS = ['Your details', 'Contact & lab results', 'Choose a doctor', 'Date & time', 'Review & confirm'];
const EMPTY = { name: '', email: '', mobile: '', bookingReference: '', dateOfBirth: '', gender: '', notes: '' };

function randomSession() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function useStored(key, initial) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    try { const s = sessionStorage.getItem(key); if (s) setV(JSON.parse(s)); } catch { /* private mode */ }
  }, [key]);
  const set = useCallback((next) => {
    setV((prev) => {
      const val = typeof next === 'function' ? next(prev) : next;
      try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
      return val;
    });
  }, [key]);
  return [v, set];
}

export function validateDetails(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your full name.';
  if (!isValidEmail(f.email)) e.email = 'Please enter a valid email address.';
  if (!isValidMobile(f.mobile)) e.mobile = 'Please enter a valid mobile number, e.g. +971 50 123 4567.';
  if (!BOOKING_REF_RE.test(f.bookingReference.trim())) e.bookingReference = 'Please enter your Justlife booking reference.';
  return e;
}

export default function BookingFlow({ token }) {
  const k = `jl-book-${token}`;
  const [link, setLink] = useState(null);
  const [step, setStep] = useStored(`${k}-step`, 0);
  const [form, setForm] = useStored(`${k}-form`, EMPTY);
  const [contact, setContact] = useStored(`${k}-contact`, '');
  const [files, setFiles] = useStored(`${k}-files`, []);
  const [session, setSession] = useStored(`${k}-session`, '');
  const [doctorId, setDoctorId] = useStored(`${k}-doctor`, '');
  const [day, setDay] = useStored(`${k}-day`, '');
  const [slot, setSlot] = useStored(`${k}-slot`, null);
  const [errors, setErrors] = useState({});
  const [doctors, setDoctors] = useState(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [profile, setProfile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => { if (!session) setSession(randomSession()); }, [session, setSession]);

  useEffect(() => {
    api(`/api/public/links/${encodeURIComponent(token)}`).then((l) => {
      setLink(l);
      if (l.valid && l.justlifeReference) setForm((f) => (f.bookingReference ? f : { ...f, bookingReference: l.justlifeReference }));
    }).catch(() => setLink({ valid: false, message: 'This booking link is not valid. Please contact Justlife Healthcare for a new link.' }));
  }, [token, setForm]);

  const loadDoctors = useCallback(async () => {
    const res = await api(`/api/public/availability?kind=link&t=${encodeURIComponent(token)}`);
    setDoctors(res.doctors);
    setLoadedAt(Date.now());
    return res.doctors;
  }, [token]);

  // Fetch availability once the client reaches doctor selection; refresh if stale.
  useEffect(() => {
    if (step >= 2 && link?.valid && (!doctors || Date.now() - loadedAt > 60_000)) loadDoctors().catch((e) => setNotice(e.message));
  }, [step, link, doctors, loadedAt, loadDoctors]);

  const doctor = useMemo(() => doctors?.find((d) => d.id === doctorId) || null, [doctors, doctorId]);
  const dates = useMemo(() => (doctor ? Object.keys(doctor.days).sort() : []), [doctor]);
  const slots = doctor && day ? doctor.days[day] || [] : [];

  // If the remembered doctor/day/slot is no longer available, clear it.
  useEffect(() => {
    if (!doctors) return;
    if (doctorId && !doctor) { setDoctorId(''); setDay(''); setSlot(null); if (step > 2) setStep(2); return; }
    if (doctor && day && !doctor.days[day]) { setDay(dates[0] || ''); setSlot(null); }
    if (doctor && slot && !(doctor.days[dayOf(slot)] || []).some((s) => s.startAt === slot.startAt)) setSlot(null);
  }, [doctors]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n) => { setStep(n); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  function next() {
    if (step === 0) {
      const e = validateDetails(form);
      setErrors(e);
      if (Object.keys(e).length) return;
      setForm((f) => ({ ...f, mobile: normalizeMobile(f.mobile), email: f.email.trim().toLowerCase(), bookingReference: f.bookingReference.trim() }));
    }
    if (step === 1 && !contact) { setErrors({ contact: 'Please choose how the doctor should contact you.' }); return; }
    if (step === 2 && !doctor) { setNotice('Please choose a doctor to continue.'); return; }
    if (step === 3 && !slot) { setNotice('Please choose an available time.'); return; }
    setErrors({});
    go(step + 1);
  }

  function chooseDoctor(d) {
    if (d.id !== doctorId) { setDay(Object.keys(d.days).sort()[0] || ''); setSlot(null); }
    setDoctorId(d.id);
    setProfile(null);
    go(3);
  }

  async function submit() {
    setSubmitting(true);
    setNotice('');
    try {
      const res = await api('/api/public/bookings', {
        method: 'POST',
        body: {
          token, ...form, contactMethod: contact, doctorId, startAt: slot.startAt,
          uploadSession: session, documentIds: files.map((f) => f.id),
        },
      });
      setConfirmed(res);
      try { Object.keys(sessionStorage).filter((x) => x.startsWith(k)).forEach((x) => sessionStorage.removeItem(x)); } catch { /* ignore */ }
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e.status === 409 || e.code === 'SLOT_TAKEN' || e.code === 'NOT_AVAILABLE' || e.code === 'DOCTOR_UNAVAILABLE') {
        setSlot(null);
        await loadDoctors().catch(() => {});
        setStep(e.code === 'DOCTOR_UNAVAILABLE' ? 2 : 3);
      }
      setNotice(e.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------- render
  if (!link) return <Loading rows={4} />;
  if (!link.valid) {
    return (
      <div className="empty">
        <h1>Booking link unavailable</h1>
        <p>{link.message}</p>
        {link.settings && <p className="small">{link.settings.supportEmail} · {link.settings.supportPhone}</p>}
      </div>
    );
  }
  if (confirmed) {
    return (
      <BookingConfirmation booking={confirmed} intro={`A confirmation email has been sent to ${confirmed.email}.`}>
        {confirmed.documentsAttached > 0 && <p className="small muted" style={{ marginTop: 12 }}>{confirmed.documentsAttached} lab result file(s) shared securely with your doctor.</p>}
        <p className="small" style={{ marginTop: 14 }}>Need to change it? <a href={confirmed.rescheduleUrl}>Reschedule your appointment</a> — the same link is in your email.</p>
      </BookingConfirmation>
    );
  }

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  return (
    <>
      <section className="intro">
        <h1>Book Your Teleconsultation</h1>
        <p>Choose your preferred doctor and available time. Your doctor will contact you during the selected 1-hour time window.</p>
      </section>

      <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'done' : ''} />)}</div>
      <div className="step-label">Step {step + 1} of {STEPS.length} · <strong>{STEPS[step]}</strong></div>

      {notice && <div className="notice error" role="alert" style={{ marginBottom: 16 }}>{notice}</div>}

      {step === 0 && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
          <Field label="Full name" id="name" error={errors.name}>
            <input id="name" className="input" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Email address" id="email" error={errors.email} hint="We'll send your confirmation here.">
            <input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Mobile number" id="mobile" error={errors.mobile} hint="The doctor will contact you on this number.">
            <input id="mobile" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+971 50 123 4567" value={form.mobile} onChange={set('mobile')} aria-invalid={!!errors.mobile} />
          </Field>
          <Field label="Justlife booking reference" id="ref" error={errors.bookingReference} hint="You'll find it in your Justlife booking confirmation.">
            <input id="ref" className="input" autoCapitalize="characters" value={form.bookingReference} onChange={set('bookingReference')} aria-invalid={!!errors.bookingReference} />
          </Field>
          <details>
            <summary className="small" style={{ cursor: 'pointer', color: 'var(--sky-ink)', fontWeight: 600 }}>Add optional details (date of birth, gender, notes)</summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="grid-2">
                <Field label="Date of birth" id="dob"><input id="dob" className="input" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} /></Field>
                <Field label="Gender" id="gender">
                  <select id="gender" className="select" value={form.gender} onChange={set('gender')}>
                    <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
                  </select>
                </Field>
              </div>
              <Field label="Anything the doctor should know?" id="notes"><textarea id="notes" className="textarea" maxLength={1000} value={form.notes} onChange={set('notes')} /></Field>
            </div>
          </details>
          <button type="submit" hidden />
        </form>
      )}

      {step === 1 && (
        <div className="stack">
          <h2>How will the doctor contact you?</h2>
          <div className="choices" role="radiogroup" aria-label="Contact method">
            {[['PHONE', 'Phone Call', 'Doctor will call your mobile number.'], ['WHATSAPP', 'WhatsApp', 'Doctor will contact you on WhatsApp.']].map(([v, t, d]) => (
              <button key={v} type="button" role="radio" className="choice" aria-checked={contact === v} onClick={() => { setContact(v); setErrors({}); }}>
                <strong>{t}</strong><span>{d}</span>
              </button>
            ))}
          </div>
          {errors.contact && <p className="err small" role="alert" style={{ color: 'var(--red)' }}>{errors.contact}</p>}
          <div className="notice">Your doctor will contact you during the selected 1-hour time window. Please keep your phone available during this period.</div>
          <h2 style={{ marginTop: 22 }}>Lab results <span className="muted small">(optional)</span></h2>
          <FileUploader token={token} session={session} files={files} onChange={setFiles}
            maxMb={link.settings.maxUploadMb} maxFiles={link.settings.maxUploadFiles} />
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          {!doctors ? <Loading rows={3} /> : doctors.length === 0 ? (
            <div className="empty card"><h3>No doctors are available right now</h3><p>Please check back later or contact Justlife Healthcare at {link.settings.supportPhone}.</p></div>
          ) : doctors.map((d) => (
            <DoctorCard key={d.id} doctor={d} selected={d.id === doctorId} onSelect={chooseDoctor} onViewProfile={setProfile} />
          ))}
        </div>
      )}

      {step === 3 && doctor && (
        <div className="stack">
          <div className="row">
            <Avatar src={doctor.photoUrl} name={doctor.name} size="sm" />
            <div className="grow"><strong>{doctor.name}</strong> <span className="small muted">{doctor.specialty}</span></div>
            <button className="btn btn-ghost btn-sm" onClick={() => go(2)}>Change</button>
          </div>
          <h2 style={{ marginTop: 10 }}>Choose a date</h2>
          <Calendar dates={dates} counts={Object.fromEntries(dates.map((x) => [x, doctor.days[x].length]))} value={day} onChange={(x) => { setDay(x); setSlot(null); }} />
          {day && <>
            <h2 style={{ marginTop: 8 }}>{relativeDayLabel(day)} — available 1-hour windows</h2>
            <TimeSlots slots={slots} value={slot?.startAt} onChange={setSlot} />
          </>}
        </div>
      )}

      {step === 4 && doctor && slot && (
        <div className="stack">
          <div className="card">
            <div className="row" style={{ marginBottom: 14 }}>
              <Avatar src={doctor.photoUrl} name={doctor.name} />
              <div><strong>{doctor.name}</strong><div className="small muted">{doctor.specialty}</div></div>
            </div>
            <dl className="summary-list">
              <div><dt>Date</dt><dd>{formatDateWeekday(slot.startAt)}</dd></div>
              <div><dt>Time window</dt><dd>{formatRange(slot.startAt, slot.endAt)}</dd></div>
              <div><dt>Contact method</dt><dd>{CONTACT_LABEL[contact]}</dd></div>
              <div><dt>Name</dt><dd>{form.name}</dd></div>
              <div><dt>Mobile</dt><dd>{form.mobile}</dd></div>
              <div><dt>Email</dt><dd>{form.email}</dd></div>
              <div><dt>Justlife reference</dt><dd>{form.bookingReference}</dd></div>
              <div><dt>Lab results</dt><dd>{files.length ? `${files.length} file(s)` : 'None'}</dd></div>
            </dl>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => go(0)}>Edit details</button>
              <button className="btn btn-ghost btn-sm" onClick={() => go(3)}>Change time</button>
            </div>
          </div>
          <div className="notice">Your doctor will contact you during the selected 1-hour time window. Please keep your phone available during this period.</div>
        </div>
      )}

      <div className="sticky-cta">
        <div className="inner">
          {step > 0 && <button className="btn btn-lg" onClick={() => go(step - 1)} disabled={submitting}>Back</button>}
          {step < 4 && step !== 2 && <button className="btn btn-primary btn-lg" onClick={next}>Continue</button>}
          {step === 2 && <button className="btn btn-primary btn-lg" onClick={next} disabled={!doctor}>{doctor ? `Continue with ${doctor.name}` : 'Choose a doctor'}</button>}
          {step === 4 && (
            <button className="btn btn-primary btn-lg" onClick={submit} disabled={submitting}>
              {submitting ? <><Spinner /> Booking…</> : 'Book Teleconsultation'}
            </button>
          )}
        </div>
      </div>

      {profile && <DoctorProfile doctor={profile} onClose={() => setProfile(null)} onBook={chooseDoctor} />}
    </>
  );
}

const dayOf = (slot) => dateKey(slot.startAt);
