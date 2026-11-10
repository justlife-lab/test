'use client';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BrandMark } from '@/components/ui';
import CONFIG from '@/config/config';

const ERRORS = {
  AccessDenied: 'Access restricted to authorized Justlife accounts.',
  OAuthSignin: 'Google sign-in could not start. Please try again.',
  OAuthCallback: 'Google sign-in failed. Please try again.',
  Configuration: 'Google sign-in is not configured yet. Check GOOGLE_CLIENT_ID in config/config.js and GOOGLE_CLIENT_SECRET in Vercel.',
  CredentialsSignin: 'Wrong email or test password. Only @justlife.com addresses are allowed.',
  Default: 'Sign-in failed. Please try again.',
};

export default function AdminLogin({ mode = 'google' }) {
  const sp = useSearchParams();
  const [err, setErr] = useState(sp.get('error'));
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const callbackUrl = sp.get('callbackUrl')?.startsWith('/admin') ? sp.get('callbackUrl') : '/admin';
  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="brand"><BrandMark />{CONFIG.BRAND_NAME}</span>
        <h1>Admin sign in</h1>
        <p className="muted">Use your {CONFIG.ALLOWED_ADMIN_DOMAIN} {mode === 'test' ? 'email' : 'Google account'}.</p>
        {err && <div className="notice error" role="alert" style={{ margin: '16px 0' }}>{ERRORS[err] || ERRORS.Default}</div>}
        {mode === 'test' ? (
          <form style={{ marginTop: 18, display: 'grid', gap: 10, textAlign: 'left' }}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true); setErr(null);
              const res = await signIn('test-admin', { email, password, redirect: false, callbackUrl });
              if (res?.ok) window.location.href = callbackUrl;
              else { setErr('CredentialsSignin'); setBusy(false); }
            }}>
            <div className="notice" role="note">Test mode — Google sign-in is switched off (config ▸ AUTH_MODE).</div>
            <label className="field"><span className="label">Work email</span>
              <input className="input" type="email" required autoComplete="email" placeholder={`name${CONFIG.ALLOWED_ADMIN_DOMAIN}`} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field"><span className="label">Test password</span>
              <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        ) : (
          <button className="btn btn-lg btn-block google-btn" disabled={busy} style={{ marginTop: 18 }}
            onClick={() => { setBusy(true); signIn('google', { callbackUrl }); }}>
            <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" /></svg>
            {busy ? 'Redirecting…' : 'Continue with Google'}
          </button>
        )}
        <p className="small muted" style={{ marginTop: 22 }}>Doctor? <a href="/doctor/login">Sign in to the doctor portal</a>.</p>
      </div>
    </div>
  );
}
