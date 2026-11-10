// Route-handler wrapper: auth/role checks, CSRF origin check, error mapping.
import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ZodError } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, forbidden, unauthorized } from '@/lib/errors';

export const json = (data, init) => NextResponse.json(data, init);

export function clientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

/** Re-validates the session against the Users tab so deactivated users lose access quickly. */
export async function requireUser(roles) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw unauthorized();
  if (roles && !roles.includes(session.user.role)) throw forbidden();
  const u = await db.get('users', session.user.id);
  if (!u || u.status !== 'ACTIVE' || u.role !== session.user.role) throw unauthorized();
  return { ...session.user, doctorId: u.doctorId };
}

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients; cookies are SameSite=Lax anyway
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host'));
  } catch { return false; }
}

/**
 * @param fn async ({ req, params, user, ip }) => data | Response
 * @param opts.roles ['ADMIN'] | ['DOCTOR'] | ['ADMIN','DOCTOR'] — omit for public routes
 */
export function handler(fn, { roles } = {}) {
  return async (req, ctx) => {
    try {
      const params = ctx?.params ? await ctx.params : {};
      let user = null;
      if (roles) {
        if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) throw forbidden();
        user = await requireUser(roles);
      }
      const out = await fn({ req, params, user, ip: clientIp(req) });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof AppError) return json({ error: err.message, code: err.code, details: err.details }, { status: err.status });
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        return json({ error: issue?.message || 'Invalid request', code: 'VALIDATION', field: issue?.path?.join('.') }, { status: 400 });
      }
      console.error('[api]', req.method, req.url, err);
      return json({ error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' }, { status: 500 });
    }
  };
}

export async function readJson(req) {
  try { return await req.json(); } catch { throw new AppError('BAD_REQUEST', 'Invalid JSON body', 400); }
}

export function searchParams(req) {
  return new URL(req.url).searchParams;
}
