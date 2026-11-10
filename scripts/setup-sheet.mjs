// =============================================================================
// npm run sheet:setup — checks the Google Sheet connection and creates all
// tabs + headers. Safe to run any time (never deletes or changes data).
//
// Uses config/config.js (GOOGLE_SHEET_URL, SHEETS_CONNECTION) and the same env
// vars as the app: GOOGLE_SERVICE_ACCOUNT_JSON  (or APPS_SCRIPT_SECRET).
//   export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat my-key.json)"; npm run sheet:setup
// =============================================================================
import { getStore, sheetSettings, spreadsheetIdFrom, TABLES } from '../lib/sheets/index.js';

const s = sheetSettings();
console.log(`Connection : ${s.connection}`);
if (s.connection === 'service-account') {
  console.log(`Sheet id   : ${spreadsheetIdFrom(s.url) || '✗ GOOGLE_SHEET_URL is not a valid link'}`);
  try {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    console.log(`Share with : ${sa.client_email || '✗ GOOGLE_SERVICE_ACCOUNT_JSON not set'}  (as Editor)`);
  } catch { console.log('Share with : ✗ GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
} else if (s.connection === 'apps-script') {
  console.log(`Web app    : ${s.appsScriptUrl || '✗ APPS_SCRIPT_URL is empty'}`);
}

try {
  const db = getStore();
  await db.ensureSchema();
  const t = await db.tables(Object.keys(TABLES), { fresh: true });
  console.log('\n✓ Connected. Tabs ready:');
  for (const [name, def] of Object.entries(TABLES)) console.log(`  ${def.tab.padEnd(18)} ${String(t[name].length).padStart(5)} rows`);
  console.log('\nNext: deploy to Vercel and sign in at /admin with your @justlife.com Google account.');
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
}
