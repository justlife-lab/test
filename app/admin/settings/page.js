'use client';
import { useEffect, useState } from 'react';
import { useData } from '@/components/admin/useData';
import { api } from '@/lib/client-api';
import { Field, Loading, StatusBadge, useToast } from '@/components/ui';
import { formatDateTime } from '@/lib/time';

function Num({ label, hint, value, onChange, step = 1, min = 0, max }) {
  const id = `s-${label.replace(/\W/g, '')}`;
  return (
    <Field label={label} hint={hint} id={id}>
      <input id={id} className="input" type="number" step={step} min={min} max={max} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    </Field>
  );
}

function RulesTab() {
  const toast = useToast();
  const { data } = useData('/api/admin/settings');
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (!s) return <Loading />;
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    try { const r = await api('/api/admin/settings', { method: 'PUT', body: s }); setS(r.settings); toast('Settings saved.'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Calling KPI</h2>
        <div className="grid-2">
          <Num label="On-time tolerance (minutes)" hint="A call counts as on time if it starts within this many minutes of the window start." value={s.onTimeToleranceMinutes} onChange={set('onTimeToleranceMinutes')} max={60} />
        </div>
      </div>
      <div className="card stack">
        <h2>Client booking</h2>
        <div className="grid-2">
          <Num label="Booking horizon (days)" hint="How far ahead clients can book." value={s.bookingHorizonDays} onChange={set('bookingHorizonDays')} min={1} max={90} />
          <Num label="Minimum notice (minutes)" hint="Earliest slot a client can book from now." value={s.minBookingNoticeMinutes} onChange={set('minBookingNoticeMinutes')} max={1440} />
          <Num label="Max upload size per file (MB)" hint="Up to 4.4 MB on Vercel." value={s.maxUploadMb} onChange={set('maxUploadMb')} step={0.1} min={0.1} max={4.4} />
          <Num label="Max lab-result files" value={s.maxUploadFiles} onChange={set('maxUploadFiles')} max={10} />
        </div>
      </div>
      <div className="card stack">
        <h2>Client rescheduling</h2>
        <div className="grid-2">
          <Num label="Rescheduling closes (hours before)" hint="e.g. 2 = closes 2 hours before the appointment." value={s.rescheduleCutoffHours} onChange={set('rescheduleCutoffHours')} step={0.5} max={168} />
          <Num label="Maximum reschedules per booking" value={s.maxReschedules} onChange={set('maxReschedules')} max={20} />
          <Num label="Reschedule link expiry (days after booking)" hint="0 = valid until the cut-off." value={s.rescheduleLinkExpiryDays} onChange={set('rescheduleLinkExpiryDays')} max={365} />
        </div>
        <label className="check"><input type="checkbox" checked={s.allowClientCancel} onChange={(e) => set('allowClientCancel')(e.target.checked)} /> Clients can cancel online</label>
        <label className="check"><input type="checkbox" checked={s.requireRescheduleReason} onChange={(e) => set('requireRescheduleReason')(e.target.checked)} /> Require a reason when rescheduling</label>
      </div>
      <div className="card stack">
        <h2>Reminders &amp; notifications</h2>
        {s.reminders.map((r, i) => (
          <div className="row" key={i}>
            <label className="check"><input type="checkbox" checked={r.enabled} onChange={(e) => set('reminders')(s.reminders.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} /> Send reminder</label>
            <input className="input input-sm" type="number" min="1" max="168" style={{ width: 90 }} value={r.hours} onChange={(e) => set('reminders')(s.reminders.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)))} aria-label="Hours before" />
            <span className="small">hours before</span>
            <button className="btn btn-ghost btn-sm" onClick={() => set('reminders')(s.reminders.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        {s.reminders.length < 6 && <div><button className="btn btn-sm" onClick={() => set('reminders')([...s.reminders, { hours: 1, enabled: true }])}>Add reminder</button></div>}
        <label className="check"><input type="checkbox" checked={s.notifyDoctorOnAssignment} onChange={(e) => set('notifyDoctorOnAssignment')(e.target.checked)} /> Email doctors when a booking is assigned to them</label>
        <div className="grid-2">
          <Field label="Support email" id="s-se"><input id="s-se" className="input" value={s.supportEmail} onChange={(e) => set('supportEmail')(e.target.value)} /></Field>
          <Field label="Support phone" id="s-sp"><input id="s-sp" className="input" value={s.supportPhone} onChange={(e) => set('supportPhone')(e.target.value)} /></Field>
        </div>
      </div>
      <div><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </div>
  );
}

function TemplatesTab() {
  const toast = useToast();
  const { data, reload } = useData('/api/admin/templates');
  const [type, setType] = useState('BOOKING_CONFIRMED');
  const [t, setT] = useState(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => { if (data) { setT(data.templates.find((x) => x.type === type)); setPreview(null); } }, [data, type]);
  if (!data || !t) return <Loading />;

  const body = () => ({ type, subject: t.subject, body: t.body, enabled: t.enabled });
  async function save() { try { await api('/api/admin/templates', { method: 'PUT', body: body() }); toast('Template saved.'); reload(); } catch (e) { toast(e.message, 'error'); } }
  async function reset() { if (!window.confirm('Reset this template to the default text?')) return; await api(`/api/admin/templates?type=${type}`, { method: 'DELETE' }); toast('Template reset.'); reload(); }
  async function doPreview() { try { setPreview(await api('/api/admin/templates', { method: 'POST', body: { ...body(), preview: true } })); } catch (e) { toast(e.message, 'error'); } }

  return (
    <div className="grid-dash">
      <div className="card stack">
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Template">
          {data.templates.map((x) => <option key={x.type} value={x.type}>{x.label}{x.customized ? ' (customised)' : ''}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={t.enabled} onChange={(e) => setT({ ...t, enabled: e.target.checked })} /> Send this email</label>
        <Field label="Subject" id="t-sub"><input id="t-sub" className="input" value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} /></Field>
        <Field label="Body (HTML)" id="t-body" hint="Use {{#if variable}}…{{/if}} for optional sections.">
          <textarea id="t-body" className="textarea" rows={16} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.82rem' }} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
        </Field>
        <div className="small">
          <div className="label">Variables</div>
          <div className="row" style={{ gap: 6 }}>{data.variables.map((v) => <code key={v} className="fact" style={{ cursor: 'pointer' }} onClick={() => setT({ ...t, body: `${t.body}{{${v}}}` })}>{`{{${v}}}`}</code>)}</div>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={save}>Save template</button>
          <button className="btn" onClick={doPreview}>Preview</button>
          {t.customized && <button className="btn btn-ghost" onClick={reset}>Reset to default</button>}
        </div>
      </div>
      <div className="card">
        <h2>Preview</h2>
        {preview ? (
          <>
            <p className="small"><strong>Subject:</strong> {preview.subject}</p>
            <iframe title="Email preview" sandbox="" srcDoc={preview.html} style={{ width: '100%', height: 640, border: '1px solid var(--line)', borderRadius: 12 }} />
          </>
        ) : <p className="small muted">Click Preview to render the email with sample data.</p>}
      </div>
    </div>
  );
}

function AdminsTab() {
  const toast = useToast();
  const { data, reload } = useData('/api/admin/users');
  async function toggle(u) {
    try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }); reload(); } catch (e) { toast(e.message, 'error'); }
  }
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <div className="notice">Any verified @justlife.com Google account can sign in and is added here automatically. Deactivate an account to block it immediately. To restrict sign-in to named people, set ADMIN_EMAILS in Vercel.</div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Admin</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <td data-label="Admin"><strong>{u.name || '—'}</strong><div className="tiny muted">{u.email}</div></td>
                <td data-label="Last sign-in">{formatDateTime(u.lastLogin)}</td>
                <td data-label="Status"><StatusBadge status={u.status} /></td>
                <td data-label=""><button className="btn btn-sm" onClick={() => toggle(u)}>{u.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('rules');
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><p>Business rules, emails and admin access.</p></div></div>
      <div className="toolbar">
        <div className="seg" role="group">
          {[['rules', 'Booking rules'], ['templates', 'Email templates'], ['admins', 'Admin users']].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      {tab === 'rules' && <RulesTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'admins' && <AdminsTab />}
    </>
  );
}
