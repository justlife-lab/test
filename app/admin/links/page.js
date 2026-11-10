'use client';
// Booking links: Create Booking Link → secure token URL → Copy Link.
import { useState } from 'react';
import { useData } from '@/components/admin/useData';
import { api, copyText } from '@/lib/client-api';
import { Field, Loading, StatusBadge, useToast } from '@/components/ui';
import { formatDateTime, formatDateShort, dateKey, addDays } from '@/lib/time';

export default function LinksPage() {
  const toast = useToast();
  const { data, error, reload } = useData('/api/admin/links');
  const [f, setF] = useState({ label: '', justlifeReference: '', expiry: 'once', expiresOn: addDays(dateKey(), 7) });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const link = await api('/api/admin/links', { method: 'POST', body: f });
      setCreated(link);
      await copyText(link.url);
      toast('Booking link created and copied.');
      setF((x) => ({ ...x, label: '', justlifeReference: '' }));
      reload();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }
  async function setStatus(l, status) {
    try { await api(`/api/admin/links/${l.id}`, { method: 'PATCH', body: { status } }); reload(); } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Booking links</h1><p>Send a client a secure link to choose their doctor and time.</p></div></div>
      <div className="grid-side">
        <div>
          {error && <div className="notice error">{error}</div>}
          {!data ? <Loading /> : data.length === 0 ? <div className="card empty"><h3>No links yet</h3><p>Create your first booking link.</p></div> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Link</th><th>Expiry</th><th>Uses</th><th>Created</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.map((l) => (
                    <tr key={l.id}>
                      <td data-label="Link"><code className="small">/book/{l.token}</code>{(l.label || l.justlifeReference) && <div className="tiny muted">{[l.label, l.justlifeReference].filter(Boolean).join(' · ')}</div>}</td>
                      <td data-label="Expiry">{l.singleUse ? 'Single use' : l.expiresAt ? `Until ${formatDateShort(l.expiresAt)}` : 'Never'}</td>
                      <td data-label="Uses">{l.usesCount}</td>
                      <td data-label="Created">{formatDateTime(l.createdAt)}<div className="tiny muted">{l.createdByEmail}</div></td>
                      <td data-label="Status"><StatusBadge status={l.status} /></td>
                      <td data-label="">
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm" onClick={async () => { await copyText(l.url); toast('Link copied.'); }}>Copy Link</button>
                          {l.status === 'ACTIVE' && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(l, 'CANCELLED')}>Cancel</button>}
                          {l.status === 'CANCELLED' && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(l, 'ACTIVE')}>Reactivate</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <form className="card stack" onSubmit={create}>
          <h2>Create Booking Link</h2>
          <Field label="Justlife booking reference (optional)" id="l-ref" hint="Pre-fills the client's form.">
            <input id="l-ref" className="input" value={f.justlifeReference} onChange={(e) => setF({ ...f, justlifeReference: e.target.value })} />
          </Field>
          <Field label="Internal label (optional)" id="l-label" hint="Only visible to admins.">
            <input id="l-label" className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Ticket 48213" />
          </Field>
          <div className="label">Link validity</div>
          <div className="stack">
            <label className="check"><input type="radio" name="exp" checked={f.expiry === 'once'} onChange={() => setF({ ...f, expiry: 'once' })} /> Can only be used once</label>
            <label className="check"><input type="radio" name="exp" checked={f.expiry === 'date'} onChange={() => setF({ ...f, expiry: 'date' })} /> Expires after a date</label>
            {f.expiry === 'date' && <input className="input" type="date" min={dateKey()} value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} />}
            <label className="check"><input type="radio" name="exp" checked={f.expiry === 'never'} onChange={() => setF({ ...f, expiry: 'never' })} /> Never expires</label>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create Booking Link'}</button>
          {created && (
            <div className="notice ok" style={{ display: 'grid', gap: 8 }}>
              <strong>Link ready — copied to clipboard</strong>
              <code style={{ overflowWrap: 'anywhere' }}>{created.url}</code>
              <button type="button" className="btn btn-sm" onClick={async () => { await copyText(created.url); toast('Link copied.'); }}>Copy Link</button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
