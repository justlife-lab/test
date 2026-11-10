'use client';
// Manual booking by admin/CX. Availability is still enforced server-side.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import SlotPicker from '@/components/admin/SlotPicker';
import { Field, useToast, CONTACT_LABEL } from '@/components/ui';
import { formatDateWeekday, formatRange } from '@/lib/time';

export default function NewBooking() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState('new');
  const [client, setClient] = useState({ name: '', email: '', mobile: '' });
  const [search, setSearch] = useState('');
  const [found, setFound] = useState([]);
  const [clientId, setClientId] = useState('');
  const [ref, setRef] = useState('');
  const [contact, setContact] = useState('WHATSAPP');
  const [slot, setSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'existing' || search.length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => api(`/api/admin/clients?q=${encodeURIComponent(search)}&pageSize=8`).then((r) => setFound(r.rows)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [search, mode]);

  async function submit(e) {
    e.preventDefault();
    if (!slot) { toast('Choose a doctor and an available time.', 'error'); return; }
    setBusy(true);
    try {
      const res = await api('/api/admin/bookings', {
        method: 'POST',
        body: {
          ...(mode === 'existing' ? { clientId } : { client }), bookingReference: ref, doctorId: slot.doctorId,
          startAt: slot.startAt, contactMethod: contact, adminNotes: notes || null,
        },
      });
      toast(`Booked ${res.appointmentNo}. Confirmation email sent to the client.`);
      router.push(`/admin/bookings/${res.id}`);
    } catch (err) { toast(err.message, 'error'); setBusy(false); }
  }

  return (
    <>
      <div className="page-head"><div><h1>New booking</h1><p>Book a teleconsultation on behalf of a client.</p></div></div>
      <form className="grid-side" onSubmit={submit}>
        <div className="card stack">
          <h2>Doctor &amp; time</h2>
          <SlotPicker value={slot} onChange={setSlot} />
        </div>
        <div className="card stack">
          <h2>Client</h2>
          <div className="seg" role="group">
            <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')}>New client</button>
            <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>Existing client</button>
          </div>
          {mode === 'new' ? (
            <>
              <Field label="Full name" id="c-name"><input id="c-name" className="input" required value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></Field>
              <Field label="Email" id="c-email"><input id="c-email" className="input" type="email" required value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></Field>
              <Field label="Mobile" id="c-mob"><input id="c-mob" className="input" type="tel" required placeholder="+971…" value={client.mobile} onChange={(e) => setClient({ ...client, mobile: e.target.value })} /></Field>
            </>
          ) : (
            <>
              <input className="input" placeholder="Search name, email or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {found.map((c) => (
                <label key={c.id} className="check"><input type="radio" name="client" checked={clientId === c.id} onChange={() => { setClientId(c.id); if (!ref && c.bookingReference) setRef(c.bookingReference); }} /> {c.name} <span className="muted small">{c.mobile} · {c.email}</span></label>
              ))}
            </>
          )}
          <Field label="Justlife booking reference" id="c-ref"><input id="c-ref" className="input" required value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <div className="label">Contact method</div>
          <div className="choices">
            {['PHONE', 'WHATSAPP'].map((v) => <button type="button" key={v} className="choice" aria-pressed={contact === v} onClick={() => setContact(v)}><strong>{CONTACT_LABEL[v]}</strong></button>)}
          </div>
          <Field label="Internal note (optional)" id="c-note"><textarea id="c-note" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {slot && <div className="notice">{slot.doctorName} · {formatDateWeekday(slot.startAt)} · {formatRange(slot.startAt, slot.endAt)}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy || (mode === 'existing' && !clientId)}>{busy ? 'Booking…' : 'Book Teleconsultation'}</button>
        </div>
      </form>
    </>
  );
}
