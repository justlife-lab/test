// =============================================================================
// Private file storage for lab results and doctor photos.
//
// CONFIG.FILE_STORAGE (or env STORAGE_DRIVER):
//   sheet — bytes stored base64 in the spreadsheet's "FileData" tab, split
//           into ≤45,000-character cells. Zero setup. Good for photos and a
//           modest number of small PDFs; use 'drive' for real volume.
//   drive — a Google Drive folder, through the Apps Script web app
//           (APPS_SCRIPT_URL in config + APPS_SCRIPT_SECRET env +
//           DRIVE_FOLDER_ID script property). Folder must NOT be shared publicly.
//   s3    — any S3-compatible PRIVATE bucket (S3_BUCKET, S3_REGION,
//           S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT for R2).
//
// Whatever the driver, files are only ever streamed through authenticated API
// routes (/api/files/:id) — there is no public URL to a lab result.
// =============================================================================
import 'server-only';
import { db, getStore } from '@/lib/db';
import { secureToken } from '@/lib/tokens';
import { appsScriptTransport } from '@/lib/sheets/transport.js';
import { sheetSettings } from '@/lib/sheets/index.js';
import { FILE_DATA_TAB, TOMBSTONE } from '@/lib/sheets/schema.js';
import CONFIG from '@/config/config';

const driverName = () => {
  const d = (process.env.STORAGE_DRIVER || CONFIG.FILE_STORAGE || 'sheet').toLowerCase();
  return d === 'db' ? 'sheet' : d;
};
const CHUNK = 45_000;

let script;
const appsScript = () => (script ||= appsScriptTransport(sheetSettings().appsScriptUrl));

// --- sheet driver helpers ---------------------------------------------------
async function sheetPut(fileId, buf) {
  const b64 = buf.toString('base64');
  const rows = [];
  for (let i = 0, part = 0; i < b64.length || part === 0; i += CHUNK, part++) rows.push([fileId, String(part), b64.slice(i, i + CHUNK)]);
  const store = getStore();
  await store.ensureSchema();
  await store.transport.append(FILE_DATA_TAB, rows);
}

async function sheetRows(fileId) {
  const t = getStore().transport;
  const ids = await t.readColumn(FILE_DATA_TAB, 0);
  const rows = [];
  ids.forEach((v, i) => { if (i > 0 && v === fileId) rows.push(i + 1); });
  return rows;
}

async function sheetGet(fileId) {
  const rows = await sheetRows(fileId);
  if (!rows.length) return null;
  const vals = await getStore().transport.readRows(FILE_DATA_TAB, rows[0], rows[rows.length - 1]);
  const parts = vals.filter((r) => r[0] === fileId).sort((a, b) => Number(a[1]) - Number(b[1]));
  return Buffer.from(parts.map((r) => r[2] || '').join(''), 'base64');
}

async function sheetDelete(fileId) {
  const rows = await sheetRows(fileId);
  await getStore().transport.writeCells(rows.flatMap((row) => [
    { title: FILE_DATA_TAB, row, col: 0, value: TOMBSTONE },
    { title: FILE_DATA_TAB, row, col: 2, value: '' },
  ]));
}

let s3;
async function s3Client() {
  if (s3) return s3;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  return s3;
}

/** Detect real file type from magic bytes — never trust the browser's MIME. */
export function sniffMime(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export function isAllowedUpload(fileName, sniffed) {
  const ext = `.${String(fileName).split('.').pop()?.toLowerCase()}`;
  return CONFIG.ALLOWED_UPLOAD_TYPES.includes(sniffed) && CONFIG.ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
}

export function safeFileName(name) {
  return String(name || 'file').replace(/[^\w.\- ()]/g, '_').slice(-120) || 'file';
}

/** Store bytes; returns the Files-tab row ({ id, … }). */
export async function putFile(buf, mimeType) {
  const driver = driverName();
  if (driver === 's3') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const key = `private/${new Date().toISOString().slice(0, 7)}/${secureToken(24)}`;
    await (await s3Client()).send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key, Body: buf, ContentType: mimeType, ServerSideEncryption: process.env.S3_ENDPOINT ? undefined : 'AES256',
    }));
    return db.insert('storedFiles', { driver: 's3', storageKey: key, mimeType, size: buf.length });
  }
  if (driver === 'drive') {
    const { id } = await appsScript().call('putFile', { name: `jltc-${secureToken(16)}`, mimeType, base64: buf.toString('base64') });
    return db.insert('storedFiles', { driver: 'drive', storageKey: id, mimeType, size: buf.length });
  }
  const id = crypto.randomUUID();
  await sheetPut(id, buf);
  return db.insert('storedFiles', { id, driver: 'sheet', storageKey: null, mimeType, size: buf.length });
}

// Photos are fetched on every page view; keep a small in-memory copy.
const hot = new Map();

/** Fetch bytes for streaming back through an authorised route. */
export async function getFile(fileId) {
  if (hot.has(fileId)) return hot.get(fileId);
  const f = (await db.get('storedFiles', fileId)) || (await db.get('storedFiles', fileId, { fresh: true }));
  if (!f) return null;
  let out;
  if (f.driver === 's3') {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const obj = await (await s3Client()).send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: f.storageKey }));
    out = { mimeType: f.mimeType, size: f.size, body: Buffer.from(await obj.Body.transformToByteArray()) };
  } else if (f.driver === 'drive') {
    const { base64 } = await appsScript().call('getFile', { id: f.storageKey });
    out = { mimeType: f.mimeType, size: f.size, body: Buffer.from(base64, 'base64') };
  } else {
    const body = await sheetGet(f.id);
    if (!body) return null;
    out = { mimeType: f.mimeType, size: f.size, body };
  }
  if (f.mimeType.startsWith('image/') && out.body.length < 200_000) {
    hot.set(fileId, out);
    if (hot.size > 100) hot.delete(hot.keys().next().value);
  }
  return out;
}

/** Deletes the bytes, the Files-tab row and any Documents rows pointing at it. */
export async function deleteFile(fileId) {
  if (!fileId) return;
  hot.delete(fileId);
  const f = await db.get('storedFiles', fileId);
  try {
    if (f?.driver === 's3') {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await (await s3Client()).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: f.storageKey }));
    } else if (f?.driver === 'drive') {
      await appsScript().call('deleteFile', { id: f.storageKey });
    } else if (f) {
      await sheetDelete(f.id);
    }
  } catch (err) {
    console.error('[storage] could not delete file bytes', fileId, err.message);
  }
  if (f) await db.remove('storedFiles', fileId);
  const docs = (await db.all('documents')).filter((d) => d.fileId === fileId).map((d) => d.id);
  if (docs.length) await db.removeMany('documents', docs);
}

/** Response for a private file — never cached by shared caches. */
export function fileResponse({ body, mimeType }, fileName, inline = true) {
  return new Response(body, {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(body.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeFileName(fileName)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Only magic-byte-verified PDF/JPEG/PNG are ever stored, so no active
      // content can be served. (A CSP "sandbox" would break Chrome's PDF viewer.)
      ...(mimeType.startsWith('image/') ? { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
    },
  });
}
