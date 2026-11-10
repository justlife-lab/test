// =============================================================================
// Authentication (NextAuth v4, JWT sessions)
//
//  • Admins:  Google OAuth. Only verified @justlife.com accounts are allowed
//             (CONFIG.ALLOWED_ADMIN_DOMAIN). Optionally narrow further with
//             CONFIG.ADMIN_EMAILS or env ADMIN_EMAILS="a@justlife.com,b@justlife.com".
//             CONFIG.AUTH_MODE = 'test' swaps Google for a shared test password
//             (env TEST_LOGIN_PASSWORD) — still @justlife.com addresses only.
//  • Doctors: email + password created by an admin (bcrypt-hashed).
//
// Config: GOOGLE_CLIENT_ID (config/config.js; env GOOGLE_CLIENT_ID overrides)
// Env:    NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_SECRET
// Google redirect URI: <NEXTAUTH_URL>/api/auth/callback/google
// =============================================================================
import 'server-only';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import CONFIG from '@/config/config';

const DOMAIN = CONFIG.ALLOWED_ADMIN_DOMAIN.toLowerCase();

export function isAllowedAdminEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e.endsWith(DOMAIN) || e.length <= DOMAIN.length) return false;
  const allow = [...(CONFIG.ADMIN_EMAILS || []), ...(process.env.ADMIN_EMAILS || '').split(',')]
    .map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  return allow.length === 0 || allow.includes(e);
}

export const AUTH_MODE = (process.env.AUTH_MODE || CONFIG.AUTH_MODE || 'google').toLowerCase() === 'test' ? 'test' : 'google';

const findUserByEmail = async (email) => (await db.all('users', { fresh: true })).find((u) => u.email?.toLowerCase() === email);

/** Creates/updates the admin user row. Returns the row, or an error code. */
async function admitAdmin(email, name) {
  const existing = await findUserByEmail(email);
  // A doctor account must never gain admin rights through the admin login.
  if (existing && (existing.role !== 'ADMIN' || existing.status !== 'ACTIVE')) {
    await audit({ type: 'ADMIN', email }, 'ADMIN_LOGIN_DENIED', { summary: existing.role !== 'ADMIN' ? 'Doctor account tried admin login' : 'Admin account deactivated' });
    return null;
  }
  const row = existing
    ? await db.update('users', existing.id, { lastLogin: new Date(), name: name ?? existing.name })
    : await db.insert('users', { email, name, role: 'ADMIN', status: 'ACTIVE', lastLogin: new Date() });
  await audit({ type: 'ADMIN', id: row.id, email }, 'ADMIN_LOGIN', { entityType: 'user', entityId: row.id });
  return row;
}

function safeEq(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const providers = [];
if (AUTH_MODE === 'google') {
  providers.push(GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authorization: { params: { hd: CONFIG.GOOGLE_AUTH.hostedDomain, prompt: 'select_account' } },
  }));
} else {
  providers.push(CredentialsProvider({
    id: 'test-admin',
    name: 'Test admin',
    credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
    async authorize(credentials) {
      const email = String(credentials?.email || '').toLowerCase().trim();
      const expected = process.env.TEST_LOGIN_PASSWORD || '';
      if (expected.length < 8 || !isAllowedAdminEmail(email) || !safeEq(String(credentials?.password || ''), expected)) {
        await audit({ type: 'ADMIN', email }, 'ADMIN_LOGIN_DENIED', { summary: 'Test-mode login rejected' });
        return null;
      }
      const row = await admitAdmin(email, email.split('@')[0]);
      return row ? { id: row.id, email: row.email, name: row.name, role: 'ADMIN' } : null;
    },
  }));
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 }, // 12-hour shifts
  pages: { signIn: '/login', error: '/login' },
  providers: [
    ...providers,
    CredentialsProvider({
      id: 'doctor',
      name: 'Doctor',
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials) {
        const email = String(credentials?.email || '').toLowerCase().trim();
        const password = String(credentials?.password || '');
        if (!email || !password || password.length > 200) return null;
        const user = await findUserByEmail(email);
        const doctor = user?.doctorId ? await db.get('doctors', user.doctorId) : null;
        // Constant-ish time: always run a bcrypt compare.
        const hash = user?.passwordHash || '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
        const ok = await bcrypt.compare(password, hash);
        if (!user || !ok || user.role !== 'DOCTOR' || user.status !== 'ACTIVE' || !user.doctorId) {
          await audit({ type: 'DOCTOR', email }, 'DOCTOR_LOGIN_FAILED', { summary: 'Invalid doctor credentials' });
          return null;
        }
        if (doctor?.status === 'INACTIVE') return null;
        await db.update('users', user.id, { lastLogin: new Date() });
        await audit({ type: 'DOCTOR', id: user.id, email }, 'DOCTOR_LOGIN', { entityType: 'user', entityId: user.id });
        return { id: user.id, email: user.email, name: doctor?.name || user.name, role: 'DOCTOR', doctorId: user.doctorId };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') return true; // credentials providers handled in authorize()
      const email = String(profile?.email || user?.email || '').toLowerCase();
      // Google must confirm the address, and the domain must be Justlife.
      if (!profile?.email_verified || !isAllowedAdminEmail(email)) {
        await audit({ type: 'ADMIN', email }, 'ADMIN_LOGIN_DENIED', { summary: 'Non-Justlife or unverified Google account' });
        return '/login?error=AccessDenied';
      }
      const row = await admitAdmin(email, profile?.name || user?.name || null);
      if (!row) return '/login?error=AccessDenied';
      user.id = row.id;
      user.role = 'ADMIN';
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.doctorId = user.doctorId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid, email: token.email, name: token.name, role: token.role, doctorId: token.doctorId ?? null,
      };
      return session;
    },
  },
};
