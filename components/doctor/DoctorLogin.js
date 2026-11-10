'use client';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BrandMark, Field, Spinner } from '@/components/ui';
import CONFIG from '@/config/config';

export default function DoctorLogin() {
  const sp = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const callbackUrl = sp.get('callbackUrl')?.startsWith('/doctor') ? sp.get('callbackUrl') : '/doctor';

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await signIn('doctor', { email, password, redirect: false });
    if (res?.ok && !res.error) { router.replace(callbackUrl); router.refresh(); return; }
    setBusy(false);
    setError('Incorrect email or password, or your account is inactive.');
  }

  return (
    <div className="login-wrap">
      <form className="login-card stack" onSubmit={submit}>
        <span className="brand"><BrandMark />{CONFIG.BRAND_NAME}</span>
        <div>
          <h1>Doctor portal</h1>
          <p className="muted">Sign in with the credentials provided by Justlife Healthcare.</p>
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <Field label="Email" id="email"><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" id="pw"><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? <><Spinner /> Signing in…</> : 'Sign in'}</button>
        <p className="small muted">Forgot your password? Ask a Justlife admin to reset it.</p>
      </form>
    </div>
  );
}
