'use client';
// Admin booking details: client, consultation, lab results, doctor notes,
// upsells, reschedule history, emails and audit trail + all admin actions.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useData } from '@/components/admin/useData';
import { api, copyText } from '@/lib/client-api';
import SlotPicker from '@/components/admin/SlotPicker';
import ConsultationNotesForm from '@/components/shared/ConsultationNotesForm';
import UpsellEditor from '@/components/shared/UpsellEditor';
import DocumentList from '@/components/shared/DocumentList';
import { Loading, Modal, StatusBadge, TimeWindow, useToast, CONTACT_LABEL, SOURCE_LABEL } from '@/components/ui';
import { formatDateWeekday, formatDateTime, formatRange, formatDateShort } from '@/lib/time';

const ACTION_LABEL = (a) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function BookingDetail() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const { data: b, error, reload, setData } = useData(`/api/admin/bookings/${id}`);
  const [modal, setModal] = useState(null); // 'reschedule' | 'cancel' | 'notes'
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = useRef(null);

  async function patch(body, msg) {
    setBusy(true);
    try { setData(await api(`/api/admin/bookings/${id}`, { method: 'PATCH', body })); if (msg) toast(msg); setModal(null); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function reschedule() {
    setBusy(true);
    try {
      const res = await api(`/api/admin/bookings/${id}/move`, { method: 'POST', body: { doctorId: slot.doctorId, startAt: slot.startAt, reason: reason || null } });
      toast(`Rescheduled as ${res.appointmentNo}. The client has been emailed.`);
      router.push(`/admin/bookings/${res.id}`);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function uploadFile(file) {
    if (!file) return;
    const form = new FormData(); form.set('file', file);
    try { await api(`/api/admin/bookings/${id}/documents`, { method: 'POST', form }); toast('Lab result uploaded.'); reload(); } catch (e) { toast(e.message, 'error'); }
    if (upload.current) upload.current.value = '';
  }
  async function deleteDoc(d) {
    if (!window.confirm(`Delete ${d.fileName}? This cannot be undone.`)) return;
    try { await api(`/api/admin/bookings/${id}/documents?documentId=${d.id}`, { method: 'DELETE' }); reload(); } catch (e) { toast(e.message, 'error'); }
  }
  async function saveNotes(notes) {
    setBusy(true);
    try { await api(`/api/appointments/${id}/notes`, { method: 'PUT', body: notes }); toast('Notes saved.'); setModal(null); reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function retry(emailId) {
    try { const r = await api(`/api/admin/emails/${emailId}/retry`, { method: 'POST' }); toast(r.status === 'SENT' ? 'Email sent.' : `Still failing: ${r.error}`, r.status === 'SENT' ? 'info' : 'error'); reload(); } catch (e) { toast(e.message, 'error'); }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!b) return <Loading rows={6} />;
  const active = ['SCHEDULED', 'CALLING'].includes(b.status);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/admin/bookings" className="small">Bookings</Link>
          <h1 className="row" style={{ gap: 12 }}>{b.appointmentNo} <StatusBadge status={b.status} /></h1>
          <p>{b.client.name} · {b.doctor.name} · {formatDateWeekday(b.startAt)}</p>
        </div>
        <div className="row">
          {b.rescheduleLink && <button className="btn" onClick={async () => { await copyText(b.rescheduleLink); toast('Reschedule link copied — share it by email, WhatsApp or SMS.'); }}>Copy Reschedule Link</button>}
          {b.status === 'SCHEDULED' && <button className="btn btn-primary" onClick={() => { setSlot(null); setReason(''); setModal('reschedule'); }}>Reschedule / change doctor</button>}
          {active && <button className="btn btn-danger" onClick={() => { setReason(''); setModal('cancel'); }}>Cancel</button>}
        </div>
      </div>

      {b.history.after.length > 0 && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          This version was rescheduled. Latest: <Link href={`/admin/bookings/${b.history.after.at(-1).id}`}>{b.history.after.at(-1).appointmentNo}</Link>
        </div>
      )}

      <div className="grid-side">
        <div className="stack">
          <div className="card">
            <div className="panel-title"><h2>Consultation</h2><span className="small muted">{SOURCE_LABEL[b.source]}</span></div>
            <TimeWindow startAt={b.startAt} endAt={b.endAt} />
            <dl className="dl" style={{ marginTop: 14 }}>
              <dt>Doctor</dt><dd>{b.doctor.name} <span className="muted small">{b.doctor.specialty}</span></dd>
              <dt>Date</dt><dd>{formatDateWeekday(b.startAt)}</dd>
              <dt>Time</dt><dd>{formatRange(b.startAt, b.endAt)}</dd>
              <dt>Contact method</dt><dd>{CONTACT_LABEL[b.contactMethod]}</dd>
              <dt>Status</dt><dd><StatusBadge status={b.status} /></dd>
              {b.callStartedAt && <><dt>Call started</dt><dd>{formatDateTime(b.callStartedAt)} ({b.callDelayMinutes ? `${b.callDelayMinutes} min late` : 'on time'})</dd></>}
              {b.callEndedAt && <><dt>Call completed</dt><dd>{formatDateTime(b.callEndedAt)}</dd></>}
              {b.outcome && <><dt>Outcome</dt><dd>{b.outcome}</dd></>}
              {b.cancelReason && <><dt>Cancel reason</dt><dd>{b.cancelReason}</dd></>}
              {b.rescheduleReason && <><dt>Reschedule reason</dt><dd>{b.rescheduleReason}</dd></>}
            </dl>
            {active && (
              <div className="row" style={{ marginTop: 14 }}>
                <span className="small muted">Set status:</span>
                <button className="btn btn-sm" onClick={() => patch({ action: 'status', status: 'NO_SHOW' }, 'Marked as no-show.')}>No Show</button>
                {b.status === 'CALLING' && <button className="btn btn-sm" onClick={() => patch({ action: 'status', status: 'SCHEDULED' }, 'Back to scheduled.')}>Back to Scheduled</button>}
              </div>
            )}
          </div>

          <div className="card">
            <div className="panel-title">
              <h2>Doctor notes</h2>
              {!['CANCELLED', 'RESCHEDULED'].includes(b.status) && <button className="btn btn-sm" onClick={() => setModal('notes')}>{b.note ? 'Edit notes' : 'Add notes'}</button>}
            </div>
            <ConsultationNotesForm readOnly note={b.note} />
          </div>

          <div className="card">
            <div className="panel-title"><h2>Upsell &amp; conversion</h2></div>
            <UpsellEditor appointmentId={b.id} upsells={b.upsells} onChange={reload} disabled={['CANCELLED', 'RESCHEDULED'].includes(b.status)} />
          </div>

          <div className="card">
            <div className="panel-title"><h2>Audit trail</h2></div>
            {b.audit.length === 0 ? <p className="small muted">No changes recorded.</p> : (
              <ul className="timeline">
                {b.audit.map((l) => (
                  <li key={l.id}>
                    <strong>{ACTION_LABEL(l.action)}</strong> <span className="muted">· {l.actorType === 'CLIENT' ? 'Client' : l.actorEmail || l.actorType} · {formatDateTime(l.createdAt)}</span>
                    {l.summary && <div>{l.summary}</div>}
                    {l.reason && <div className="muted">Reason: {l.reason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Client</h2>
            <dl className="dl">
              <dt>Name</dt><dd>{b.client.name}</dd>
              <dt>Email</dt><dd><a href={`mailto:${b.client.email}`}>{b.client.email}</a></dd>
              <dt>Mobile</dt><dd><a href={`tel:${b.client.mobile}`}>{b.client.mobile}</a></dd>
              <dt>Justlife ref</dt><dd>{b.bookingReference}</dd>
              <dt>Booking ID</dt><dd>{b.appointmentNo}</dd>
              {b.client.dateOfBirth && <><dt>Date of birth</dt><dd>{b.client.dateOfBirth}</dd></>}
              {b.client.gender && <><dt>Gender</dt><dd>{b.client.gender}</dd></>}
            </dl>
            {b.clientNotes && <div className="notice" style={{ marginTop: 12 }}><div><strong>Client note:</strong> {b.clientNotes}</div></div>}
            <div className="row" style={{ marginTop: 12 }}>
              <a className="btn btn-sm btn-whatsapp" href={`/api/appointments/${b.id}/whatsapp`} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>
            </div>
          </div>

          <div className="card">
            <div className="panel-title">
              <h2>Lab results</h2>
              <input ref={upload} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => uploadFile(e.target.files?.[0])} />
              <button className="btn btn-sm" onClick={() => upload.current?.click()}>Upload</button>
            </div>
            <DocumentList documents={b.documents} onDelete={deleteDoc} />
          </div>

          <div className="card">
            <h2>Internal note</h2>
            <form onSubmit={(e) => { e.preventDefault(); patch({ action: 'update', adminNotes: e.target.adminNotes.value }, 'Note saved.'); }} className="stack">
              <textarea name="adminNotes" className="textarea" defaultValue={b.adminNotes || ''} placeholder="Visible to admins only" />
              <button className="btn btn-sm" disabled={busy}>Save note</button>
            </form>
          </div>

          {(b.history.before.length > 0 || b.history.after.length > 0) && (
            <div className="card">
              <h2>Appointment history</h2>
              <ul className="timeline">
                {[...b.history.before, { ...b, doctorName: b.doctor.name, current: true }, ...b.history.after].map((h) => (
                  <li key={h.id}>
                    {h.current ? <strong>{h.appointmentNo} (this)</strong> : <Link href={`/admin/bookings/${h.id}`}>{h.appointmentNo}</Link>} <StatusBadge status={h.status} />
                    <div>{h.doctorName} · {formatDateShort(h.startAt)} · {formatRange(h.startAt, h.endAt)}</div>
                    {h.rescheduleReason && <div className="muted">Reason: {h.rescheduleReason}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h2>Emails</h2>
            {b.emails.length === 0 ? <p className="small muted">No emails sent.</p> : b.emails.map((m) => (
              <div key={m.id} className="row small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="grow">{ACTION_LABEL(m.type)}<br /><span className="tiny muted">{m.recipient} · {formatDateTime(m.sentAt || m.createdAt)}</span>{m.error && <><br /><span className="tiny" style={{ color: 'var(--red)' }}>{m.error}</span></>}</span>
                <StatusBadge status={m.status} />
                {m.status === 'FAILED' && <button className="btn btn-sm" onClick={() => retry(m.id)}>Retry</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal === 'reschedule' && (
        <Modal title="Reschedule booking" onClose={() => setModal(null)} wide>
          <p className="small muted">Pick the same or another doctor. The current slot is shown as available so you can shift within it. History is kept; the client is emailed.</p>
          <SlotPicker value={slot} onChange={setSlot} excludeAppointmentId={b.id} initialDoctorId={b.doctor.id} />
          <input className="input" style={{ marginTop: 12 }} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={!slot || busy} onClick={reschedule}>
            {busy ? 'Checking availability…' : slot ? `Move to ${slot.doctorName}, ${formatDateShort(slot.startAt)} ${formatRange(slot.startAt, slot.endAt)}` : 'Choose a new time'}
          </button>
        </Modal>
      )}
      {modal === 'cancel' && (
        <Modal title="Cancel this booking?" onClose={() => setModal(null)}>
          <p>The time slot will be released and the client will receive a cancellation email.</p>
          <input className="input" placeholder="Reason (saved to audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn grow" onClick={() => setModal(null)}>Keep booking</button>
            <button className="btn btn-ink grow" disabled={busy} onClick={() => patch({ action: 'cancel', reason }, 'Booking cancelled.')}>Cancel booking</button>
          </div>
        </Modal>
      )}
      {modal === 'notes' && (
        <Modal title="Consultation notes" onClose={() => setModal(null)} wide>
          <ConsultationNotesForm note={b.note} onSave={saveNotes} busy={busy} />
        </Modal>
      )}
    </>
  );
}
