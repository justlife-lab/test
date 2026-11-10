// =============================================================================
// Sheet transports — the only code that talks to Google.
//
//   service-account  Google Sheets REST API with a service-account key
//                    (env GOOGLE_SERVICE_ACCOUNT_JSON). Fastest. Share the
//                    spreadsheet with the service account's email as Editor.
//   apps-script      Calls the spreadsheet's own Apps Script web app
//                    (app-script/Code.gs → doPost). Use this if your Google
//                    Workspace blocks sharing with service accounts.
//   memory           In-memory (optionally saved to a JSON file). Local dev
//                    and automated tests only. Env SHEETS_DRIVER=memory.
//
// All transports expose the same small interface; values are always strings
// ('' = empty cell). Rows/columns: row numbers are 1-based (row 1 = header),
// column indexes are 0-based.
// =============================================================================
import { createSign } from 'node:crypto';
import fs from 'node:fs';

export class SheetsError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function colLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
const q = (title) => `'${String(title).replace(/'/g, "''")}'`;

/** Extracts the spreadsheet id from a full Google Sheets link (or returns an id as-is). */
export function spreadsheetIdFrom(urlOrId) {
  const s = String(urlOrId || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

const toStr = (v) => (v === null || v === undefined ? '' : String(v));
const normRows = (rows) => (rows || []).map((r) => (r || []).map(toStr));

// ---------------------------------------------------------------------------
// Service account (Google Sheets REST API v4)
// ---------------------------------------------------------------------------
function serviceAccountCreds() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json.trim().startsWith('{') ? json : Buffer.from(json, 'base64').toString('utf8'));
      email = parsed.client_email; key = parsed.private_key;
    } catch {
      throw new SheetsError('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file content.', 500);
    }
  }
  if (!email || !key) {
    throw new SheetsError('Google Sheets is not connected: set GOOGLE_SERVICE_ACCOUNT_JSON in Vercel → Settings → Environment Variables (see README §3).', 500);
  }
  return { email, key: key.replace(/\\n/g, '\n') };
}

function b64url(x) { return Buffer.from(x).toString('base64url'); }

export function serviceAccountTransport(spreadsheetId) {
  let token = null;
  let tokenExp = 0;
  // (API_BASE / TOKEN_URL overrides exist only for the offline test harness.)
  const base = `${process.env.GOOGLE_SHEETS_API_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${spreadsheetId}`;
  const tokenUrl = process.env.GOOGLE_OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token';

  async function accessToken() {
    if (token && Date.now() < tokenExp - 60_000) return token;
    const { email, key } = serviceAccountCreds();
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
      iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const jwt = `${header}.${claims}.${signer.sign(key).toString('base64url')}`;
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new SheetsError(`Google rejected the service-account key: ${body.error_description || body.error || res.status}`, 500);
    token = body.access_token;
    tokenExp = Date.now() + (body.expires_in || 3600) * 1000;
    return token;
  }

  async function call(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return res.json();
      // 429 = quota (60 requests/min per user), 5xx = transient. Back off and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(600 * 2 ** attempt + Math.random() * 300); continue; }
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || res.statusText;
      if (res.status === 403 || res.status === 404) {
        throw new SheetsError(`Cannot open the Google Sheet (${res.status}: ${msg}). Check GOOGLE_SHEET_URL in config/config.js and share the sheet with the service-account email as Editor.`, 500);
      }
      throw new SheetsError(`Google Sheets error ${res.status}: ${msg}`, 502);
    }
  }

  const batchUpdate = (requests) => call(':batchUpdate', { method: 'POST', body: { requests } });
  const getValues = async (ranges) => {
    const qs = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING', majorDimension: 'ROWS' });
    for (const r of ranges) qs.append('ranges', r);
    const out = await call(`/values:batchGet?${qs}`);
    return (out.valueRanges || []).map((vr) => normRows(vr.values));
  };

  let metaCache = null;
  return {
    name: 'service-account',
    async meta({ fresh = false } = {}) {
      if (metaCache && !fresh) return metaCache;
      const info = await call('?fields=sheets.properties(sheetId,title,gridProperties(columnCount))');
      const sheets = (info.sheets || []).map((s) => s.properties);
      const heads = sheets.length ? await getValues(sheets.map((s) => `${q(s.title)}!1:1`)) : [];
      const tabs = {};
      sheets.forEach((s, i) => { tabs[s.title] = { sheetId: s.sheetId, columnCount: s.gridProperties?.columnCount || 26, headers: heads[i]?.[0] || [] }; });
      metaCache = { tabs };
      return metaCache;
    },
    async addTabs(list) {
      await batchUpdate(list.map(({ title, headers }) => ({
        addSheet: { properties: { title, gridProperties: { rowCount: 200, columnCount: Math.max(26, headers.length + 4), frozenRowCount: 1 } } },
      })));
      await this.meta({ fresh: true });
      for (const { title, headers } of list) await this.setHeaders(title, headers);
    },
    async setHeaders(title, headers) {
      const m = (await this.meta()).tabs[title];
      if (m && m.columnCount < headers.length) {
        await batchUpdate([{ appendDimension: { sheetId: m.sheetId, dimension: 'COLUMNS', length: headers.length - m.columnCount + 4 } }]);
      }
      await call('/values:batchUpdate', {
        method: 'POST',
        body: { valueInputOption: 'RAW', data: [{ range: `${q(title)}!A1:${colLetter(headers.length - 1)}1`, values: [headers] }] },
      });
      if (m) { m.headers = headers.slice(); m.columnCount = Math.max(m.columnCount, headers.length + 4); }
    },
    async readTabs(titles) {
      const vals = await getValues(titles.map(q));
      return Object.fromEntries(titles.map((t, i) => [t, vals[i] || []]));
    },
    async readColumn(title, col = 0) {
      const L = colLetter(col);
      return (await getValues([`${q(title)}!${L}:${L}`]))[0].map((r) => r[0] ?? '');
    },
    async readRows(title, from, to) {
      return (await getValues([`${q(title)}!${from}:${to}`]))[0];
    },
    async append(title, rows) {
      const m = (await this.meta()).tabs[title];
      if (!m) throw new SheetsError(`Tab "${title}" is missing.`, 500);
      await batchUpdate([{
        appendCells: {
          sheetId: m.sheetId,
          fields: 'userEnteredValue',
          rows: rows.map((r) => ({ values: r.map((v) => (v === '' ? {} : { userEnteredValue: { stringValue: String(v) } })) })),
        },
      }]);
    },
    async writeCells(cells) {
      if (!cells.length) return;
      await call('/values:batchUpdate', {
        method: 'POST',
        body: { valueInputOption: 'RAW', data: cells.map((c) => ({ range: `${q(c.title)}!${colLetter(c.col)}${c.row}`, values: [[toStr(c.value)]] })) },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Apps Script web app (doPost in app-script/Code.gs)
// ---------------------------------------------------------------------------
export function appsScriptTransport(url) {
  async function call(op, args = {}) {
    if (!url) throw new SheetsError('APPS_SCRIPT_URL is empty in config/config.js (needed when SHEETS_CONNECTION is "apps-script").', 500);
    const secret = process.env.APPS_SCRIPT_SECRET;
    if (!secret) throw new SheetsError('Set APPS_SCRIPT_SECRET in Vercel env (same value as the APP_SECRET script property).', 500);
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: 'POST', redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight on Google's side
          body: JSON.stringify({ secret, op, ...args }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        if (attempt < 2) { await sleep(800 * 2 ** attempt); continue; }
        throw new SheetsError(`Apps Script unreachable: ${e.message}`, 502);
      }
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch {
        throw new SheetsError('Apps Script did not return JSON. Re-deploy the web app with "Execute as: Me" and "Who has access: Anyone".', 502);
      }
      if (body.ok) return body.result;
      if (body.busy && attempt < 4) { await sleep(500 * 2 ** attempt); continue; }
      throw new SheetsError(`Apps Script: ${body.error || 'unknown error'}`, body.status || 502);
    }
  }
  let metaCache = null;
  return {
    name: 'apps-script',
    call,
    async meta({ fresh = false } = {}) {
      if (!metaCache || fresh) metaCache = await call('meta');
      return metaCache;
    },
    async addTabs(list) { await call('addTabs', { list }); await this.meta({ fresh: true }); },
    async setHeaders(title, headers) {
      await call('setHeaders', { title, headers });
      const m = (await this.meta()).tabs[title];
      if (m) m.headers = headers.slice();
    },
    async readTabs(titles) {
      const out = await call('readTabs', { titles });
      return Object.fromEntries(titles.map((t) => [t, normRows(out[t])]));
    },
    async readColumn(title, col = 0) { return (await call('readColumn', { title, col })).map(toStr); },
    async readRows(title, from, to) { return normRows(await call('readRows', { title, from, to })); },
    async append(title, rows) { await call('append', { title, rows }); },
    async writeCells(cells) { if (cells.length) await call('writeCells', { cells }); },
  };
}

// ---------------------------------------------------------------------------
// Memory (dev/tests). SHEETS_MEMORY_FILE=.data/sheet.json keeps data on disk.
// SHEETS_MEMORY_LATENCY_MS simulates network latency (used by the
// double-booking test to force real interleaving).
// ---------------------------------------------------------------------------
export function memoryTransport() {
  const g = globalThis;
  const file = process.env.SHEETS_MEMORY_FILE;
  if (!g.__jlMemSheet) {
    let tabs = {};
    if (file && fs.existsSync(file)) { try { tabs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { tabs = {}; } }
    g.__jlMemSheet = { tabs, timer: null };
  }
  const store = g.__jlMemSheet;
  const lat = Number(process.env.SHEETS_MEMORY_LATENCY_MS || 0);
  const tick = () => (lat ? sleep(lat * (0.5 + Math.random())) : Promise.resolve());
  const persist = () => {
    if (!file) return;
    clearTimeout(store.timer);
    store.timer = setTimeout(() => {
      fs.mkdirSync(file.replace(/[/\\][^/\\]*$/, '') || '.', { recursive: true });
      fs.writeFileSync(file, JSON.stringify(store.tabs));
    }, 50);
  };
  const tab = (title) => {
    if (!store.tabs[title]) throw new SheetsError(`Tab "${title}" is missing.`, 500);
    return store.tabs[title];
  };
  const lastDataRow = (rows) => { let n = rows.length; while (n > 0 && !(rows[n - 1] || []).some((v) => v !== '')) n--; return n; };
  const clone = (rows) => rows.map((r) => r.slice());
  return {
    name: 'memory',
    async meta() {
      await tick();
      return { tabs: Object.fromEntries(Object.entries(store.tabs).map(([t, rows]) => [t, { headers: (rows[0] || []).slice() }])) };
    },
    async addTabs(list) { await tick(); for (const { title, headers } of list) store.tabs[title] ||= [headers.slice()]; persist(); },
    async setHeaders(title, headers) { await tick(); tab(title)[0] = headers.slice(); persist(); },
    async readTabs(titles) { await tick(); return Object.fromEntries(titles.map((t) => [t, clone(tab(t))])); },
    async readColumn(title, col = 0) { await tick(); return tab(title).map((r) => r[col] ?? ''); },
    async readRows(title, from, to) { await tick(); return clone(tab(title).slice(from - 1, to)); },
    async append(title, rows) {
      await tick();
      const t = tab(title);
      t.length = lastDataRow(t); // appendCells semantics: after the last row with data
      for (const r of rows) t.push(r.map(toStr));
      persist();
    },
    async writeCells(cells) {
      await tick();
      for (const c of cells) {
        const t = tab(c.title);
        while (t.length < c.row) t.push([]);
        const r = t[c.row - 1];
        while (r.length <= c.col) r.push('');
        r[c.col] = toStr(c.value);
      }
      persist();
    },
    _reset() { store.tabs = {}; persist(); },
  };
}
