'use client';
import { useState } from 'react';
import { Field } from '@/components/ui';

export const NOTE_FIELDS = [
  ['mainIssue', 'Main issue', "What is the client's concern?", true],
  ['assessment', 'Doctor assessment', 'Clinical assessment', true],
  ['recommendation', 'Recommendation', 'What do you recommend?', true],
  ['furtherTests', 'Further investigation', 'Lab test, follow-up consultation, medical test…'],
  ['prescriptionNotes', 'Prescription', 'Prescription-related notes, per the Justlife workflow'],
  ['ivRecommendation', 'IV recommendation', 'If clinically appropriate and available via Justlife'],
  ['followUp', 'Follow-up', 'Recommended follow-up'],
  ['additionalNotes', 'Additional notes', 'Free text'],
];

/** Consultation notes. `onComplete` shows the "Complete Consultation" action. */
export default function ConsultationNotesForm({ note, onSave, onComplete, readOnly, busy }) {
  const [f, setF] = useState(() => Object.fromEntries(NOTE_FIELDS.map(([k]) => [k, note?.[k] || ''])));
  const [followUpAt, setFollowUpAt] = useState(note?.followUpAt ? new Date(note.followUpAt).toISOString().slice(0, 10) : '');
  const [missing, setMissing] = useState([]);
  const payload = () => ({ ...f, followUpAt: followUpAt ? new Date(`${followUpAt}T08:00:00+04:00`).toISOString() : null });

  if (readOnly) {
    const filled = NOTE_FIELDS.filter(([k]) => note?.[k]);
    if (!filled.length) return <p className="muted small">No consultation notes yet.</p>;
    return (
      <dl className="dl">
        {filled.map(([k, label]) => <div key={k} style={{ display: 'contents' }}><dt>{label}</dt><dd style={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{note[k]}</dd></div>)}
        {note.followUpAt && <><dt>Follow-up date</dt><dd>{new Date(note.followUpAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'long', year: 'numeric' })}</dd></>}
      </dl>
    );
  }

  function complete() {
    const miss = NOTE_FIELDS.filter(([k, , , req]) => req && !f[k].trim()).map(([k]) => k);
    setMissing(miss);
    if (miss.length) return;
    onComplete(payload());
  }

  return (
    <div className="stack">
      {NOTE_FIELDS.map(([k, label, hint, req]) => (
        <Field key={k} label={`${label}${req ? ' *' : ''}`} id={`n-${k}`} hint={hint} error={missing.includes(k) ? 'Required to complete the consultation.' : ''}>
          <textarea id={`n-${k}`} className="textarea" rows={k === 'followUp' ? 2 : 3} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
        </Field>
      ))}
      <Field label="Follow-up date (optional)" id="n-fudate">
        <input id="n-fudate" className="input" type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} style={{ maxWidth: 220 }} />
      </Field>
      <div className="row">
        <button className="btn" onClick={() => onSave(payload())} disabled={busy}>Save notes</button>
        {onComplete && <button className="btn btn-primary grow" onClick={complete} disabled={busy}>Complete Consultation</button>}
      </div>
    </div>
  );
}
