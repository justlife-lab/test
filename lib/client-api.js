'use client';
// Browser fetch helper: JSON in/out, throws Error(message) with .code/.status.
export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const res = await fetch(path, {
    method,
    signal,
    headers: form ? undefined : body ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body ? JSON.stringify(body) : undefined),
    credentials: 'same-origin',
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const err = new Error(data?.error || (res.status === 401 ? 'Your session has expired. Please sign in again.' : 'Something went wrong. Please try again.'));
    err.code = data?.code;
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
