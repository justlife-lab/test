// Server-side database handle. The "database" is the Google Sheet configured
// in config/config.js — see lib/sheets/ for how it works.
import 'server-only';

export { db, getStore, TABLES } from '@/lib/sheets/index.js';

/** Active statuses occupy a doctor's time. CANCELLED / RESCHEDULED free it. */
export const ACTIVE_STATUSES = ['SCHEDULED', 'CALLING', 'COMPLETED', 'NO_SHOW'];

/** Map rows by a key (default id). */
export const indexBy = (rows, key = 'id') => new Map(rows.map((r) => [r[key], r]));

/** Group rows by a key into Map<key, row[]>. */
export function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/** Case-insensitive "contains". */
export const ilike = (value, q) => String(value ?? '').toLowerCase().includes(String(q).toLowerCase());

const t = (d) => (d ? new Date(d).getTime() : 0);
/** Sort helper: by(r => r.startAt), by('name'), with 'desc' option. */
export function sortBy(rows, ...keys) {
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const [get, dir] = Array.isArray(k) ? k : [k, 'asc'];
      const av = typeof get === 'function' ? get(a) : a[get];
      const bv = typeof get === 'function' ? get(b) : b[get];
      const x = av instanceof Date || bv instanceof Date ? t(av) - t(bv)
        : typeof av === 'number' || typeof bv === 'number' ? (av ?? -Infinity) - (bv ?? -Infinity)
          : String(av ?? '').localeCompare(String(bv ?? ''));
      if (x) return dir === 'desc' ? -x : x;
    }
    return 0;
  });
}

export const paginate = (rows, page, pageSize) => rows.slice((page - 1) * pageSize, page * pageSize);
