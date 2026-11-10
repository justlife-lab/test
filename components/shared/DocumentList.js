'use client';
import { fmtBytes } from '@/components/ui';
import { formatDateTime } from '@/lib/time';

/** Lab results — opened through the authenticated /api/files route only. */
export default function DocumentList({ documents, onDelete }) {
  if (!documents.length) return <p className="small muted">No lab results uploaded.</p>;
  return (
    <div className="stack">
      {documents.map((d) => (
        <div className="file-row" key={d.id}>
          <span className="file-icon">{d.fileType === 'application/pdf' ? 'PDF' : 'IMG'}</span>
          <span className="name" title={d.fileName}>{d.fileName}<br /><span className="tiny muted">{fmtBytes(d.size)} · {d.uploadedBy === 'client' ? 'Client' : d.uploadedBy} · {formatDateTime(d.createdAt)}</span></span>
          <a className="btn btn-sm btn-primary" href={`/api/files/${d.id}`} target="_blank" rel="noopener noreferrer">Open Lab Result</a>
          <a className="btn btn-sm btn-ghost" href={`/api/files/${d.id}?download=1`}>Download</a>
          {onDelete && <button className="btn btn-sm btn-ghost" onClick={() => onDelete(d)}>Delete</button>}
        </div>
      ))}
    </div>
  );
}
