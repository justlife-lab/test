'use client';
// Small reusable UI primitives.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { formatTime } from '@/lib/time';

export const STATUS_LABEL = {
  SCHEDULED: 'Scheduled', CALLING: 'Calling', COMPLETED: 'Completed', CANCELLED: 'Cancelled', RESCHEDULED: 'Rescheduled', NO_SHOW: 'No Show',
  ACTIVE: 'Active', INACTIVE: 'Inactive', ON_LEAVE: 'On Leave', EXPIRED: 'Expired', USED: 'Used',
  PENDING: 'Pending', SENT: 'Sent', DELIVERED: 'Delivered', FAILED: 'Failed',
  RECOMMENDED: 'Recommended', INTERESTED: 'Interested', BOOKED: 'Booked', NOT_INTERESTED: 'Not Interested',
};
export const CONTACT_LABEL = { PHONE: 'Phone Call', WHATSAPP: 'WhatsApp' };
export const SOURCE_LABEL = { CLIENT_LINK: 'Client link', ADMIN: 'Admin / CX', CLIENT_RESCHEDULE: 'Client reschedule', ADMIN_RESCHEDULE: 'Admin reschedule', API: 'API' };

export function StatusBadge({ status }) {
  return <span className={`badge s-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Loading({ rows = 3 }) {
  return <div className="stack" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}</div>;
}

/** The signature element: a 1-hour window set in large display type. */
export function TimeWindow({ startAt, endAt, size = 'lg' }) {
  const [a, ap] = formatTime(startAt).split(' ');
  const [b, bp] = formatTime(endAt).split(' ');
  return (
    <div className={`window ${size}`}>
      {a}{ap !== bp ? <small style={{ fontSize: '.5em' }}> {ap}</small> : null}
      <span className="dash">–</span>{b}<small style={{ fontSize: '.5em' }}> {bp}</small>
    </div>
  );
}

export function Avatar({ src, name = '', size = '' }) {
  const initials = name.replace(/^Dr\.?\s+/i, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={`avatar ${size}`} src={src} alt="" loading="lazy" decoding="async" /> : <span className={`avatar ${size}`} aria-hidden="true">{initials}</span>;
}

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={wide ? { maxWidth: 860 } : undefined}>
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, kind = 'info') => {
    setToast({ message, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role="status" aria-live="polite">{toast.message}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Field({ label, hint, error, children, id }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>{total.toLocaleString()} result{total === 1 ? '' : 's'}</span>
      <div className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 18 18" fill="none"><path d="M9 3v12M3 9h12" stroke="#0b2a38" strokeWidth="2.6" strokeLinecap="round" /></svg>
    </span>
  );
}

export const fmtMoney = (n) => (n == null ? '—' : `AED ${Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`);
export const fmtPct = (n) => (n == null ? '—' : `${n}%`);
export const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
