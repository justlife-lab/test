'use client';
// Recommended services & conversion tracking for one consultation.
import { useState } from 'react';
import { api } from '@/lib/client-api';
import { StatusBadge, useToast, fmtMoney } from '@/components/ui';
import CONFIG from '@/config/config';

const STATUSES = [['RECOMMENDED', 'Recommended'], ['INTERESTED', 'Interested'], ['BOOKED', 'Booked'], ['COMPLETED', 'Completed'], ['NOT_INTERESTED', 'Not Interested']];

export default function UpsellEditor({ appointmentId, upsells, onChange, disabled }) {
  const toast = useToast();
  const [svc, setSvc] = useState(CONFIG.UPSELL_SERVICES[0].name);
  const [amount, setAmount] = useState(CONFIG.UPSELL_SERVICES[0].defaultAmount);
  const [custom, setCustom] = useState('');

  async function add(e) {
    e.preventDefault();
    try {
      await api(`/api/appointments/${appointmentId}/upsells`, { method: 'POST', body: { service: svc === '__other' ? custom : svc, recommendedAmount: Number(amount) || 0, status: 'RECOMMENDED' } });
      onChange();
      setCustom('');
    } catch (err) { toast(err.message, 'error'); }
  }
  async function patch(u, body) {
    try { await api(`/api/appointments/${appointmentId}/upsells/${u.id}`, { method: 'PATCH', body }); onChange(); } catch (err) { toast(err.message, 'error'); }
  }
  async function remove(u) {
    try { await api(`/api/appointments/${appointmentId}/upsells/${u.id}`, { method: 'DELETE' }); onChange(); } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <div className="stack">
      {upsells.length === 0 && <p className="small muted">No services recommended yet.</p>}
      {upsells.map((u) => (
        <div key={u.id} className="card card-tight stack" style={{ borderRadius: 12 }}>
          <div className="row between">
            <strong>{u.service}</strong>
            <StatusBadge status={u.status} />
          </div>
          <div className="row small">
            <label className="row" style={{ gap: 6 }}>Recommended <input className="input input-sm" type="number" min="0" style={{ width: 100 }} defaultValue={u.recommendedAmount} disabled={disabled} onBlur={(e) => Number(e.target.value) !== u.recommendedAmount && patch(u, { recommendedAmount: Number(e.target.value) || 0 })} /></label>
            <label className="row" style={{ gap: 6 }}>Booked <input className="input input-sm" type="number" min="0" style={{ width: 100 }} defaultValue={u.bookedAmount ?? ''} placeholder="AED" disabled={disabled} onBlur={(e) => patch(u, { bookedAmount: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            <label className="row" style={{ gap: 6 }}>Booking ref <input className="input input-sm" style={{ width: 130 }} defaultValue={u.bookingReference || ''} disabled={disabled} onBlur={(e) => e.target.value !== (u.bookingReference || '') && patch(u, { bookingReference: e.target.value || null })} /></label>
          </div>
          <div className="row">
            <select className="select select-sm" style={{ width: 'auto' }} value={u.status} disabled={disabled} onChange={(e) => patch(u, { status: e.target.value })} aria-label="Upsell status">
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="small muted grow">{['BOOKED', 'COMPLETED'].includes(u.status) ? `GMV ${fmtMoney(u.bookedAmount ?? u.recommendedAmount)}` : ''}</span>
            {!disabled && <button className="btn btn-ghost btn-sm" onClick={() => remove(u)}>Remove</button>}
          </div>
        </div>
      ))}
      {!disabled && (
        <form className="row" onSubmit={add}>
          <select className="select select-sm" style={{ width: 'auto' }} value={svc} onChange={(e) => { setSvc(e.target.value); const d = CONFIG.UPSELL_SERVICES.find((s) => s.name === e.target.value); if (d) setAmount(d.defaultAmount); }} aria-label="Service">
            {CONFIG.UPSELL_SERVICES.map((s) => <option key={s.name}>{s.name}</option>)}
            <option value="__other">Other service…</option>
          </select>
          {svc === '__other' && <input className="input input-sm" required placeholder="Service name" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ width: 160 }} />}
          <input className="input input-sm" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} aria-label="Amount (AED)" />
          <button className="btn btn-sm btn-primary">Recommend service</button>
        </form>
      )}
    </div>
  );
}
