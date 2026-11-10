// =============================================================================
// Table store on top of a sheet transport.
//
//   await db.tables(['appointments', 'clients'])   → { appointments: [...], clients: [...] }
//   await db.insert('upsells', { ... })             → row (id/createdAt filled in)
//   await db.update('appointments', id, { status }) → row | null   (only changed cells are written)
//   await db.remove('upsells', id)                  → removed row | null (tombstoned)
//
// Reads come from a short per-instance cache (CONFIG.SHEET_CACHE_SECONDS) so a
// page that needs 6 tabs costs one Google request, not six. Pass
// { fresh: true } where up-to-the-second data matters (booking checks).
//
// Writes never rewrite whole rows: an update first re-reads the id column to
// find the row's CURRENT position (rows may have been added by someone else),
// then writes just the changed cells. So two people editing different fields
// of the same booking never overwrite each other.
// =============================================================================
import { randomUUID } from 'node:crypto';
import { TABLES, TOMBSTONE, FILE_DATA_TAB, FILE_DATA_HEADERS, headersOf, idColumn, tableNames } from './schema.js';

const MAX_CELL = 49_000; // Google's hard limit is 50,000 characters per cell

// ---------------------------------------------------------------------------
// Cell <-> value conversion
// ---------------------------------------------------------------------------
const TRUE = new Set(['true', '1', 'yes', 'y']);

export function parseCell(type, raw) {
  const s = raw == null ? '' : String(raw);
  if (s === '') return type.endsWith('[]') ? [] : null;
  switch (type) {
    case 'int': { const n = Number.parseInt(s.replace(/,/g, ''), 10); return Number.isFinite(n) ? n : null; }
    case 'num': { const n = Number.parseFloat(s.replace(/,/g, '')); return Number.isFinite(n) ? n : null; }
    case 'bool': return TRUE.has(s.trim().toLowerCase());
    case 'ts': { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
    case 'date': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    }
    case 'json': try { return JSON.parse(s); } catch { return s; }
    case 'int[]': return s.split(',').map((x) => Number.parseInt(x.trim(), 10)).filter(Number.isFinite);
    case 'text[]': return s.split(',').map((x) => x.trim()).filter(Boolean);
    default: return s;
  }
}

export function formatCell(type, v) {
  if (v === null || v === undefined) return '';
  let out;
  switch (type) {
    case 'ts': { const d = v instanceof Date ? v : new Date(v); out = Number.isNaN(d.getTime()) ? '' : d.toISOString(); break; }
    case 'bool': out = v ? 'TRUE' : 'FALSE'; break;
    case 'json': out = JSON.stringify(v); break;
    case 'int[]': out = (Array.isArray(v) ? v : [v]).join(','); break;
    case 'text[]': out = (Array.isArray(v) ? v : [v]).join(', '); break;
    default: out = String(v);
  }
  if (out.length > MAX_CELL) out = `${out.slice(0, MAX_CELL - 20)}…[truncated]`;
  return out;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export function createStore({ transport, cacheMs = 5000 }) {
  const cache = new Map(); // table -> { at, rows }
  const inflight = new Map(); // table -> Promise<rows>
  let schemaReady = null;
  const headerOf = new Map(); // tab title -> current header array in the sheet

  const def = (table) => {
    const d = TABLES[table];
    if (!d) throw new Error(`Unknown table "${table}"`);
    return d;
  };

  /** Creates missing tabs / columns once per server instance. */
  function ensureSchema() {
    if (!schemaReady) {
      schemaReady = (async () => {
        const { tabs } = await transport.meta();
        const missing = [];
        const want = [...tableNames.map((n) => [TABLES[n].tab, headersOf(n)]), [FILE_DATA_TAB, FILE_DATA_HEADERS]];
        for (const [title, headers] of want) {
          const have = tabs[title]?.headers?.filter(Boolean);
          if (!tabs[title]) { missing.push({ title, headers }); headerOf.set(title, headers); continue; }
          const add = headers.filter((h) => !have.includes(h));
          const full = add.length ? [...tabs[title].headers, ...add] : tabs[title].headers;
          if (add.length) await transport.setHeaders(title, full);
          headerOf.set(title, full.slice());
        }
        if (missing.length) await transport.addTabs(missing);
      })().catch((err) => { schemaReady = null; throw err; });
    }
    return schemaReady;
  }

  function rowsFromValues(table, values) {
    const d = def(table);
    const header = values[0] || [];
    headerOf.set(d.tab, header.slice());
    const idIdx = header.indexOf(idColumn(table));
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      const idv = r[idIdx] ?? '';
      if (!idv || idv === TOMBSTONE) continue;
      const obj = {};
      for (const [col, type] of Object.entries(d.columns)) {
        const idx = header.indexOf(col);
        obj[col] = parseCell(type, idx >= 0 ? r[idx] : '');
      }
      Object.defineProperty(obj, '_row', { value: i + 1, enumerable: false, writable: true });
      out.push(obj);
    }
    return out;
  }

  /** Loads tables. Returns { [table]: row[] } — rows in sheet order. */
  async function tables(names, { fresh = false } = {}) {
    await ensureSchema();
    const now = Date.now();
    const need = new Set(names.filter((n) => fresh || !cache.has(n) || now - cache.get(n).at > cacheMs));
    const toFetch = [...need].filter((n) => fresh || !inflight.has(n));
    const mine = new Map();
    if (toFetch.length) {
      const p = transport.readTabs(toFetch.map((n) => def(n).tab)).then((vals) => {
        const at = Date.now();
        const res = {};
        for (const n of toFetch) { res[n] = rowsFromValues(n, vals[def(n).tab] || []); cache.set(n, { at, rows: res[n] }); }
        return res;
      });
      for (const n of toFetch) {
        const one = p.then((r) => r[n]);
        one.catch(() => {}); // handled by whoever awaits it
        mine.set(n, one);
        if (!fresh) inflight.set(n, one);
        one.finally(() => { if (inflight.get(n) === one) inflight.delete(n); }).catch(() => {});
      }
    }
    // Capture every promise BEFORE awaiting any: a shared in-flight read may
    // settle (and be cleared from `inflight`) while we wait on another one.
    const pending = names.map((n) => [n, need.has(n) ? (mine.get(n) || inflight.get(n)) : null, need.has(n) ? null : cache.get(n).rows]);
    const out = {};
    for (const [n, p, rows] of pending) out[n] = p ? await p : rows;
    return out;
  }

  const all = async (table, opts) => (await tables([table], opts))[table];
  const get = async (table, id, opts) => {
    if (!id) return null;
    const key = idColumn(table);
    return (await all(table, opts)).find((r) => r[key] === id) || null;
  };

  function fillNew(table, values, now) {
    const d = def(table);
    const row = {};
    for (const col of Object.keys(d.columns)) row[col] = values[col] !== undefined ? values[col] : (d.defaults?.[col] ?? null);
    if (d.columns.id && !row.id && idColumn(table) === 'id') row.id = randomUUID();
    if (d.columns.createdAt && d.createdAt !== false && d.timestamps !== false && !row.createdAt) row.createdAt = now;
    if (d.columns.updatedAt && d.updatedAt !== false && d.timestamps !== false) row.updatedAt = now;
    // Normalise types so callers get the same shape as a read
    for (const [col, type] of Object.entries(d.columns)) row[col] = parseCell(type, formatCell(type, row[col]));
    return row;
  }

  /** Append one or many rows. Returns the inserted row(s). */
  async function insert(table, values) {
    await ensureSchema();
    const d = def(table);
    const list = Array.isArray(values) ? values : [values];
    if (!list.length) return [];
    const now = new Date();
    const rows = list.map((v) => fillNew(table, v, now));
    const header = headerOf.get(d.tab) || headersOf(table);
    await transport.append(d.tab, rows.map((r) => header.map((h) => (h in d.columns ? formatCell(d.columns[h], r[h]) : ''))));
    const c = cache.get(table);
    if (c) c.rows.push(...rows);
    return Array.isArray(values) ? rows : rows[0];
  }

  /** Current sheet row numbers for the given ids (fresh read of the id column). */
  async function locate(table, ids) {
    const d = def(table);
    const header = headerOf.get(d.tab) || headersOf(table);
    const col = header.indexOf(idColumn(table));
    const column = await transport.readColumn(d.tab, col);
    const want = new Set(ids);
    const found = new Map();
    column.forEach((v, i) => { if (i > 0 && want.has(v) && !found.has(v)) found.set(v, i + 1); });
    return found;
  }

  /**
   * Update rows by id. `patch` may be an object or (row) => object.
   * Returns updated rows (missing ids are skipped).
   */
  async function updateMany(table, ids, patch) {
    await ensureSchema();
    const d = def(table);
    ids = [...new Set(ids.filter(Boolean))];
    if (!ids.length) return [];
    const key = idColumn(table);
    const current = new Map((await all(table)).map((r) => [r[key], r]));
    const pos = await locate(table, ids);
    const header = headerOf.get(d.tab) || headersOf(table);
    const cells = [];
    const updated = [];
    const now = new Date();
    for (const id of ids) {
      const row = pos.get(id);
      if (!row) continue;
      const before = current.get(id) || null;
      const p = typeof patch === 'function' ? patch(before) : patch;
      if (!p) continue;
      const next = { ...(before || {}) };
      const changed = {};
      for (const [k, v] of Object.entries(p)) {
        // Every patched key is written, even if the (possibly stale) cache
        // already shows that value — the sheet is the source of truth.
        if (!(k in d.columns) || k === key) continue;
        changed[k] = v;
      }
      if (d.columns.updatedAt && d.updatedAt !== false && d.timestamps !== false && Object.keys(changed).length) changed.updatedAt = now;
      for (const [k, v] of Object.entries(changed)) {
        const col = header.indexOf(k);
        if (col < 0) continue;
        cells.push({ title: d.tab, row, col, value: formatCell(d.columns[k], v) });
        next[k] = parseCell(d.columns[k], formatCell(d.columns[k], v));
      }
      Object.defineProperty(next, '_row', { value: row, enumerable: false, writable: true });
      updated.push({ before, next });
    }
    await transport.writeCells(cells);
    const c = cache.get(table);
    for (const { before, next } of updated) {
      if (c) {
        const i = c.rows.findIndex((r) => r[key] === next[key]);
        if (i >= 0) c.rows[i] = next; else c.rows.push(next);
      } else if (before) Object.assign(before, next);
    }
    return updated.map((u) => u.next);
  }

  const update = async (table, id, patch) => (await updateMany(table, [id], patch))[0] || null;

  /** Tombstone rows by id (column A → #deleted, other cells cleared). */
  async function removeMany(table, ids) {
    await ensureSchema();
    const d = def(table);
    ids = [...new Set(ids.filter(Boolean))];
    if (!ids.length) return [];
    const key = idColumn(table);
    const existing = new Map((await all(table)).map((r) => [r[key], r]));
    const pos = await locate(table, ids);
    const header = headerOf.get(d.tab) || headersOf(table);
    const cells = [];
    const removed = [];
    for (const id of ids) {
      const row = pos.get(id);
      if (!row) continue;
      header.forEach((h, col) => {
        if (h in d.columns || col === 0) cells.push({ title: d.tab, row, col, value: col === 0 ? TOMBSTONE : '' });
      });
      removed.push(existing.get(id) || { [key]: id });
    }
    await transport.writeCells(cells);
    const c = cache.get(table);
    if (c) c.rows = c.rows.filter((r) => !pos.has(r[key]));
    return removed;
  }
  const remove = async (table, id) => (await removeMany(table, [id]))[0] || null;

  /** Upsert by a natural key: find(row) decides the match. */
  async function upsert(table, find, values, patch = values) {
    const hit = (await all(table)).find(find);
    if (hit) return update(table, hit[idColumn(table)], typeof patch === 'function' ? patch(hit) : patch);
    return insert(table, values);
  }

  const invalidate = (names = [...cache.keys()]) => { for (const n of names) cache.delete(n); };

  return {
    transport, ensureSchema, tables, all, get, insert, update, updateMany, remove, removeMany, upsert, invalidate,
    headerOf: (tab) => headerOf.get(tab),
  };
}
