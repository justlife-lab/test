// Best-effort per-instance rate limiter for public endpoints (uploads,
// bookings). Serverless instances don't share memory, so for strict global
// limits put Vercel Firewall / WAF rate-limiting rules in front as well.
import 'server-only';
import { AppError } from '@/lib/errors';

const buckets = new Map();

export function rateLimit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
  } else if (++b.count > limit) {
    throw new AppError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', 429);
  }
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}
