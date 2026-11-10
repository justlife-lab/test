// Machine-to-machine auth for cron jobs and integrations (Apps Script, CRM).
import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { unauthorized } from '@/lib/errors';

const safeEq = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". */
export function requireCron(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || !safeEq(auth, `Bearer ${secret}`)) throw unauthorized();
}

/** Integrations send "X-API-Key: $INTEGRATION_API_KEY". */
export function requireIntegrationKey(req) {
  const key = process.env.INTEGRATION_API_KEY;
  const given = req.headers.get('x-api-key') || '';
  if (!key || key.length < 24 || !safeEq(given, key)) throw unauthorized();
}
