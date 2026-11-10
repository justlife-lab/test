'use client';
import { useState } from 'react';
import { Field } from '@/components/ui';

export const EMPTY_DOCTOR = {
  name: '', email: '', mobile: '', phoneNumber: '', whatsappNumber: '', specialty: 'General Practitioner',
  languages: ['English', 'Arabic'], experienceYears: 5, bio: '', consultationType: 'Teleconsultation',
  consultationMinutes: 60, status: 'ACTIVE', sortOrder: 0,
};

/** Doctor profile form used for create & edit. */
export default function DoctorForm({ initial = EMPTY_DOCTOR, onSubmit, submitLabel = 'Save', withPassword = false, busy = false }) {
  const [f, setF] = useState({ ...EMPTY_DOCTOR, ...initial, languagesText: (initial.languages || []).join(', ') });
  const [password, setPassword] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e) {
    e.preventDefault();
    const { languagesText, photoUrl, id, createdAt, weeklyOffDays, schedules, leaves, blockedSlots, login, workingDays, ...rest } = f;
    onSubmit({
      ...rest,
      languages: languagesText.split(/[,|]/).map((s) => s.trim()).filter(Boolean),
      experienceYears: Number(f.experienceYears) || 0,
      consultationMinutes: Number(f.consultationMinutes),
      sortOrder: Number(f.sortOrder) || 0,
      ...(withPassword && password ? { password } : {}),
    });
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid-2">
        <Field label="Full name" id="d-name"><input id="d-name" className="input" required value={f.name} onChange={set('name')} placeholder="Dr. Sarah Ahmed" /></Field>
        <Field label="Email (also the portal login)" id="d-email"><input id="d-email" className="input" type="email" required value={f.email} onChange={set('email')} /></Field>
        <Field label="Specialty" id="d-spec"><input id="d-spec" className="input" required value={f.specialty} onChange={set('specialty')} /></Field>
        <Field label="Experience (years)" id="d-exp"><input id="d-exp" className="input" type="number" min="0" max="70" value={f.experienceYears} onChange={set('experienceYears')} /></Field>
        <Field label="Languages" id="d-lang" hint="Separate with commas"><input id="d-lang" className="input" value={f.languagesText} onChange={set('languagesText')} /></Field>
        <Field label="Status" id="d-status" hint="Inactive / on-leave doctors are hidden from clients.">
          <select id="d-status" className="select" value={f.status} onChange={set('status')}>
            <option value="ACTIVE">Active</option><option value="ON_LEAVE">On Leave</option><option value="INACTIVE">Inactive</option>
          </select>
        </Field>
        <Field label="Mobile" id="d-mob"><input id="d-mob" className="input" type="tel" value={f.mobile || ''} onChange={set('mobile')} placeholder="+971…" /></Field>
        <Field label="Phone number" id="d-phone"><input id="d-phone" className="input" type="tel" value={f.phoneNumber || ''} onChange={set('phoneNumber')} /></Field>
        <Field label="WhatsApp number" id="d-wa"><input id="d-wa" className="input" type="tel" value={f.whatsappNumber || ''} onChange={set('whatsappNumber')} /></Field>
        <Field label="Consultation duration" id="d-dur">
          <select id="d-dur" className="select" value={f.consultationMinutes} onChange={set('consultationMinutes')}>
            {[15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m === 60 ? '1 hour (standard)' : `${m} minutes`}</option>)}
          </select>
        </Field>
        <Field label="Consultation type" id="d-type"><input id="d-type" className="input" value={f.consultationType} onChange={set('consultationType')} /></Field>
        <Field label="Display order" id="d-sort" hint="Lower numbers appear first to clients."><input id="d-sort" className="input" type="number" min="0" value={f.sortOrder} onChange={set('sortOrder')} /></Field>
      </div>
      <Field label="Short biography" id="d-bio"><textarea id="d-bio" className="textarea" maxLength={2000} value={f.bio || ''} onChange={set('bio')} /></Field>
      {withPassword && (
        <Field label="Doctor portal password (optional)" id="d-pw" hint="At least 10 characters. You can also set it later.">
          <input id="d-pw" className="input" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      )}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
