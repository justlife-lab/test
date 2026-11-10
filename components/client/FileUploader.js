'use client';
// Lab-result uploader. Each file uploads immediately (≤ max MB) and is held
// privately against this browser session until the booking is confirmed.
import { useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { Spinner, fmtBytes } from '@/components/ui';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const UPLOAD_ERROR = "We couldn't upload your file. Please check the file type and size and try again.";

export default function FileUploader({ token, session, files, onChange, maxMb = 4, maxFiles = 5 }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');

  async function upload(list) {
    setError('');
    const chosen = Array.from(list).slice(0, Math.max(0, maxFiles - files.length));
    if (list.length > chosen.length) setError(`You can upload up to ${maxFiles} files.`);
    let next = [...files];
    for (const f of chosen) {
      if (!/\.(pdf|jpe?g|png)$/i.test(f.name) || f.size > maxMb * 1024 * 1024) {
        setError(`${UPLOAD_ERROR} (PDF, JPG or PNG, up to ${maxMb} MB each.)`);
        continue;
      }
      setBusy((n) => n + 1);
      try {
        const form = new FormData();
        form.set('kind', 'link'); form.set('t', token); form.set('session', session); form.set('file', f);
        const doc = await api('/api/public/uploads', { method: 'POST', form });
        next = [...next, doc];
        onChange(next);
      } catch (e) {
        setError(e.message || UPLOAD_ERROR);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (input.current) input.current.value = '';
  }

  async function remove(doc) {
    try { await api(`/api/public/uploads/${doc.id}?session=${encodeURIComponent(session)}`, { method: 'DELETE' }); } catch { /* already gone */ }
    onChange(files.filter((f) => f.id !== doc.id));
  }

  return (
    <div className="uploader">
      <p className="small" style={{ marginBottom: 12 }}>You can upload your recent lab results so the doctor can review them during your consultation.</p>
      <div className="stack">
        {files.map((f) => (
          <div className="file-row" key={f.id}>
            <span className="file-icon">{f.fileType === 'application/pdf' ? 'PDF' : 'IMG'}</span>
            <span className="name">{f.fileName}</span>
            <span className="tiny muted">{fmtBytes(f.size)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(f)} aria-label={`Remove ${f.fileName}`}>Remove</button>
          </div>
        ))}
      </div>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
      <div className="row" style={{ marginTop: files.length ? 12 : 0 }}>
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy > 0 || files.length >= maxFiles}>
          {busy > 0 ? <><Spinner /> Uploading…</> : 'Upload Lab Results'}
        </button>
        <span className="tiny muted">PDF, JPG or PNG · up to {maxMb} MB each · optional</span>
      </div>
      {error && <p className="err small" role="alert" style={{ color: 'var(--red)', margin: '10px 0 0' }}>{error}</p>}
    </div>
  );
}
