// Builds the shared store from config/config.js + environment.
// Plain module (no Next.js aliases) so CLI scripts can use it as well.
import CONFIG from '../../config/config.js';
import { createStore } from './store.js';
import {
  serviceAccountTransport, appsScriptTransport, memoryTransport, spreadsheetIdFrom, SheetsError,
} from './transport.js';

export { TABLES, TOMBSTONE } from './schema.js';
export { SheetsError, spreadsheetIdFrom };

/** Env overrides config, so Preview deployments can point at a test sheet. */
export const sheetSettings = () => ({
  url: process.env.GOOGLE_SHEET_URL || CONFIG.GOOGLE_SHEET_URL,
  connection: (process.env.SHEETS_DRIVER || CONFIG.SHEETS_CONNECTION || 'service-account').toLowerCase(),
  appsScriptUrl: process.env.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL,
  cacheMs: Math.max(0, Number(process.env.SHEET_CACHE_SECONDS ?? CONFIG.SHEET_CACHE_SECONDS ?? 5)) * 1000,
});

function makeTransport() {
  const s = sheetSettings();
  if (s.connection === 'memory') return memoryTransport();
  if (s.connection === 'apps-script') return appsScriptTransport(s.appsScriptUrl);
  const id = spreadsheetIdFrom(s.url);
  if (!id) {
    throw new SheetsError('GOOGLE_SHEET_URL in config/config.js is not a valid Google Sheets link. Paste the link from your browser, e.g. https://docs.google.com/spreadsheets/d/<id>/edit', 500);
  }
  return serviceAccountTransport(id);
}

/** One store per server instance (cached on globalThis for dev hot-reload). */
export function getStore() {
  const g = globalThis;
  if (!g.__jlStore) g.__jlStore = createStore({ transport: makeTransport(), cacheMs: sheetSettings().cacheMs });
  return g.__jlStore;
}

// Lazy proxy so importing never throws at build time (config errors surface on first use).
export const db = new Proxy({}, { get: (_t, prop) => getStore()[prop] });
