/**
 * =============================================================================
 * Justlife Teleconsultation — Google Apps Script (bound to the database sheet)
 * =============================================================================
 * The spreadsheet IS the app's database: the Vercel app reads and writes the
 * tabs Users, Doctors, Appointments, Clients, … directly. This script adds:
 *
 *   ✓ Justlife menu      readable "Bookings view" + "Monthly summary" tabs,
 *                        reminders, backup, compact, setup check
 *   ✓ Hourly reminders   calls the app's /api/cron/reminders (Vercel's free
 *                        plan only runs cron once a day)
 *   ✓ Web app API        (optional) lets the app reach this sheet without a
 *                        service account — config SHEETS_CONNECTION:'apps-script'
 *   ✓ Drive file store   (optional) lab results & photos in a private Drive
 *                        folder — config FILE_STORAGE:'drive'
 *
 * SETUP (5 minutes)
 *   1. In the sheet: Extensions → Apps Script → replace Code.gs with this file → Save.
 *   2. Project Settings (gear) → Script Properties → add:
 *        APP_URL          https://your-app.vercel.app     (no trailing slash)
 *        CRON_SECRET      same value as the Vercel env var CRON_SECRET
 *      Only if you use the web app API or Drive storage:
 *        APP_SECRET       a long random string; same value as Vercel env APPS_SCRIPT_SECRET
 *        DRIVE_FOLDER_ID  id of a PRIVATE Drive folder for lab results (from its URL)
 *   3. Reload the sheet → Justlife menu → "Install triggers" (approve permissions).
 *   4. Optional web app: Deploy → New deployment → type "Web app",
 *        Execute as: Me · Who has access: Anyone → Deploy → copy the /exec URL
 *        into config/config.js ▸ APPS_SCRIPT_URL.
 *      ("Anyone" is required so Vercel can call it; every call must carry
 *       APP_SECRET, otherwise it is refused.)
 *
 * IMPORTANT for people editing the sheet by hand
 *   • Don't sort, insert or delete rows in the data tabs — use Filter views
 *     (Data → Filter views) to look at subsets. Editing a cell's value is fine.
 *   • Don't rename tabs or the header row (row 1). Adding your own extra
 *     columns at the right is fine.
 *   • Rows whose first cell is "#deleted" were removed by the app; the menu's
 *     "Compact" cleans them up.
 * =============================================================================
 */

var DATA_TABS = ['Users', 'Doctors', 'DoctorSchedules', 'DoctorLeaves', 'BlockedSlots', 'Clients', 'BookingLinks',
  'Appointments', 'Documents', 'ConsultationNotes', 'Upsells', 'EmailTemplates', 'Settings', 'Files', 'AuditLog', 'EmailLog', 'FileData'];
var VIEW = { BOOKINGS: 'Bookings view', SUMMARY: 'Monthly summary', LOG: 'Script log' };
var TOMBSTONE = '#deleted';
var TZ = 'Asia/Dubai';

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function log_(action, result) {
  var sh = ss_().getSheetByName(VIEW.LOG) || ss_().insertSheet(VIEW.LOG);
  if (sh.getLastRow() === 0) sh.appendRow(['Time (Dubai)', 'Action', 'Result']);
  sh.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), action, String(result).slice(0, 500)]);
}

// ---------------------------------------------------------------------------
// Reading data tabs as objects (header row → keys)
// ---------------------------------------------------------------------------
function table_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getDisplayValues();
  var head = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0] || r[0] === TOMBSTONE) continue;
    var o = {};
    for (var j = 0; j < head.length; j++) o[head[j]] = r[j];
    out.push(o);
  }
  return out;
}

function setting_(key, fallback) {
  var row = table_('Settings').filter(function (r) { return r.key === key; })[0];
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch (e) { return fallback; }
}

function dubai_(iso, fmt) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? iso : Utilities.formatDate(d, TZ, fmt);
}

function writeView_(name, head, rows) {
  var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e3f7ff');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1);
  return sh;
}

// ---------------------------------------------------------------------------
// Reports (computed straight from the data tabs — no API calls)
// ---------------------------------------------------------------------------

/** Human-readable bookings list: names instead of ids, Dubai times. */
function refreshBookingsView() {
  var doctors = {}; table_('Doctors').forEach(function (d) { doctors[d.id] = d; });
  var clients = {}; table_('Clients').forEach(function (c) { clients[c.id] = c; });
  var ups = {};
  table_('Upsells').forEach(function (u) { (ups[u.appointmentId] = ups[u.appointmentId] || []).push(u); });
  var appts = table_('Appointments').sort(function (a, b) { return a.startAt < b.startAt ? 1 : -1; });
  var rows = appts.map(function (a) {
    var c = clients[a.clientId] || {}; var d = doctors[a.doctorId] || {};
    var u = ups[a.id] || [];
    var gmv = u.filter(function (x) { return x.status === 'BOOKED' || x.status === 'COMPLETED'; })
      .reduce(function (s, x) { return s + (Number(x.bookedAmount || x.recommendedAmount) || 0); }, 0);
    return [a.appointmentNo, a.bookingReference, dubai_(a.startAt, 'yyyy-MM-dd'), dubai_(a.startAt, 'HH:mm'), dubai_(a.endAt, 'HH:mm'),
      d.name || '', c.name || '', c.mobile || '', c.email || '', a.contactMethod, a.status, a.source,
      a.callDelayMinutes, a.outcome, u.map(function (x) { return x.service + ': ' + x.status; }).join('; '), gmv || '',
      dubai_(a.createdAt, 'yyyy-MM-dd HH:mm')];
  });
  writeView_(VIEW.BOOKINGS, ['Appointment', 'Justlife ref', 'Date (Dubai)', 'Start', 'End', 'Doctor', 'Client', 'Mobile', 'Email',
    'Contact', 'Status', 'Source', 'Call delay (min)', 'Outcome', 'Upsells', 'Upsell GMV (AED)', 'Booked at (Dubai)'], rows);
  return rows.length;
}

/** Monthly KPI summary. */
function refreshMonthlySummary() {
  var tol = Number(setting_('onTimeToleranceMinutes', 5));
  var ups = {};
  table_('Upsells').forEach(function (u) { (ups[u.appointmentId] = ups[u.appointmentId] || []).push(u); });
  var byMonth = {};
  table_('Appointments').forEach(function (a) {
    if (a.status === 'RESCHEDULED') return; // superseded versions don't count as bookings
    var m = dubai_(a.startAt, 'yyyy-MM');
    var s = byMonth[m] = byMonth[m] || { total: 0, completed: 0, cancelled: 0, noShow: 0, calls: 0, onTime: 0, opps: 0, booked: 0, gmv: 0 };
    s.total++;
    if (a.status === 'COMPLETED') s.completed++;
    if (a.status === 'CANCELLED') s.cancelled++;
    if (a.status === 'NO_SHOW') s.noShow++;
    if (a.callStartedAt) { s.calls++; if ((Number(a.callDelayMinutes) || 0) <= tol) s.onTime++; }
    (ups[a.id] || []).forEach(function (x) {
      s.opps++;
      if (x.status === 'BOOKED' || x.status === 'COMPLETED') { s.booked++; s.gmv += Number(x.bookedAmount || x.recommendedAmount) || 0; }
    });
  });
  var pct = function (n, d) { return d ? Math.round((n / d) * 1000) / 10 : ''; };
  var rows = Object.keys(byMonth).sort().reverse().map(function (m) {
    var s = byMonth[m];
    return [m, s.total, s.completed, pct(s.completed, s.total), s.cancelled, s.noShow, pct(s.onTime, s.calls), s.opps, s.booked, pct(s.booked, s.opps), s.gmv];
  });
  writeView_(VIEW.SUMMARY, ['Month', 'Bookings', 'Completed', 'Completion %', 'Cancelled', 'No-show', 'On-time calls % (≤' + tol + ' min)',
    'Upsell opportunities', 'Upsells booked', 'Upsell conversion %', 'Upsell GMV (AED)'], rows);
}

function refreshReports() {
  var n = refreshBookingsView();
  refreshMonthlySummary();
  log_('refreshReports', n + ' appointments');
}

// ---------------------------------------------------------------------------
// Reminders (hourly trigger)
// ---------------------------------------------------------------------------
function runReminders() {
  var appUrl = (props_().getProperty('APP_URL') || '').replace(/\/$/, '');
  var secret = props_().getProperty('CRON_SECRET') || '';
  if (!appUrl || !secret) { log_('runReminders', 'Set APP_URL and CRON_SECRET in Script Properties'); return; }
  var res = UrlFetchApp.fetch(appUrl + '/api/cron/reminders', { method: 'get', headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) { log_('runReminders', 'FAILED ' + res.getResponseCode() + ' ' + body); return; }
  var sent = JSON.parse(body).sent;
  if (sent) log_('runReminders', sent + ' reminder(s) sent');
}

// ---------------------------------------------------------------------------
// Backup & maintenance
// ---------------------------------------------------------------------------
function backupToDrive() {
  var copy = DriveApp.getFileById(ss_().getId()).makeCopy('Justlife Teleconsultation backup ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
  log_('backupToDrive', copy.getUrl());
  return copy.getUrl();
}

/**
 * Physically removes "#deleted" rows. Row numbers shift, so run it when nobody
 * is using the app (e.g. late evening). Takes a backup first.
 */
function compactTombstones() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Compact', 'Removes deleted rows from all data tabs. Run only when nobody is using the app. A backup is made first. Continue?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  backupToDrive();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var removed = 0;
    DATA_TABS.forEach(function (name) {
      var sh = ss_().getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return;
      var col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
      for (var i = col.length - 1; i >= 0; i--) if (col[i][0] === TOMBSTONE) { sh.deleteRow(i + 2); removed++; }
    });
    log_('compactTombstones', removed + ' rows removed');
    ui.alert(removed + ' deleted rows removed.');
  } finally { lock.releaseLock(); }
}

/** Shows what's configured. */
function checkSetup() {
  var p = props_();
  var missing = DATA_TABS.filter(function (t) { return !ss_().getSheetByName(t); });
  var lines = [
    'Data tabs: ' + (missing.length ? 'missing ' + missing.join(', ') + ' (the app creates them on first use)' : 'all ' + DATA_TABS.length + ' present ✓'),
    'APP_URL: ' + (p.getProperty('APP_URL') || '— not set'),
    'CRON_SECRET: ' + (p.getProperty('CRON_SECRET') ? 'set ✓' : '— not set'),
    'APP_SECRET (web app): ' + (p.getProperty('APP_SECRET') ? 'set ✓' : 'not set (only needed for apps-script connection / Drive storage)'),
    'DRIVE_FOLDER_ID: ' + (p.getProperty('DRIVE_FOLDER_ID') || 'not set (only needed for Drive storage)'),
    'Triggers: ' + ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(', '),
  ];
  SpreadsheetApp.getUi().alert('Justlife setup', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------------------------------------------------------------------------
// Triggers & menu
// ---------------------------------------------------------------------------
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runReminders').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('refreshReports').timeBased().everyDays(1).atHour(6).inTimezone(TZ).create();
  ScriptApp.newTrigger('backupToDrive').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(23).inTimezone(TZ).create();
  log_('installTriggers', 'Hourly reminders, daily 06:00 reports, weekly Friday backup');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Justlife')
    .addItem('Refresh Bookings view & Monthly summary', 'refreshReports')
    .addItem('Run reminders now', 'runReminders')
    .addItem('Backup to Drive', 'backupToDrive')
    .addSeparator()
    .addItem('Compact (remove deleted rows)…', 'compactTombstones')
    .addItem('Check setup', 'checkSetup')
    .addItem('Install triggers', 'installTriggers')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Web app API — used by the Vercel app when SHEETS_CONNECTION = 'apps-script'
// and/or FILE_STORAGE = 'drive'. Mirrors lib/sheets/transport.js.
// ---------------------------------------------------------------------------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_({ ok: true, result: 'Justlife Teleconsultation sheet API. Use POST.' }); }

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad JSON', status: 400 }); }
  var secret = props_().getProperty('APP_SECRET');
  if (!secret || secret.length < 24 || req.secret !== secret) return json_({ ok: false, error: 'Unauthorized (APP_SECRET mismatch)', status: 401 });
  var writes = { addTabs: 1, setHeaders: 1, append: 1, writeCells: 1, putFile: 1, deleteFile: 1 };
  var lock = null;
  if (writes[req.op]) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return json_({ ok: false, busy: true, error: 'Busy, retry' });
  }
  try {
    return json_({ ok: true, result: OPS_[req.op] ? OPS_[req.op](req) : (function () { throw new Error('Unknown op ' + req.op); })() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (lock) { SpreadsheetApp.flush(); lock.releaseLock(); }
  }
}

function sheetOrThrow_(title) {
  var sh = ss_().getSheetByName(title);
  if (!sh) throw new Error('Tab "' + title + '" is missing.');
  return sh;
}

/**
 * Writes strings as plain text, so "+971…" or "08" stay exactly as given and
 * client input such as "=IMPORTXML(…)" can never run as a formula.
 */
function setText_(range, values) {
  range.setNumberFormat('@');
  range.setValues(values.map(function (row) {
    return row.map(function (v) { v = v == null ? '' : String(v); return /^[=+\-@]/.test(v) && !/^[+\-]?\d/.test(v) ? "'" + v : v; });
  }));
}

function ensureCols_(sh, n) { if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns()); }

var OPS_ = {
  meta: function () {
    var tabs = {};
    ss_().getSheets().forEach(function (sh) {
      var lc = sh.getLastColumn();
      tabs[sh.getName()] = { sheetId: sh.getSheetId(), headers: lc ? sh.getRange(1, 1, 1, lc).getDisplayValues()[0] : [] };
    });
    return { tabs: tabs };
  },
  addTabs: function (req) {
    req.list.forEach(function (t) {
      var sh = ss_().getSheetByName(t.title) || ss_().insertSheet(t.title);
      ensureCols_(sh, t.headers.length);
      setText_(sh.getRange(1, 1, 1, t.headers.length), [t.headers]);
      sh.getRange(1, 1, 1, t.headers.length).setFontWeight('bold').setBackground('#e3f7ff');
      sh.setFrozenRows(1);
    });
    return true;
  },
  setHeaders: function (req) {
    var sh = sheetOrThrow_(req.title);
    ensureCols_(sh, req.headers.length);
    setText_(sh.getRange(1, 1, 1, req.headers.length), [req.headers]);
    return true;
  },
  readTabs: function (req) {
    var out = {};
    req.titles.forEach(function (t) { out[t] = sheetOrThrow_(t).getDataRange().getDisplayValues(); });
    return out;
  },
  readColumn: function (req) {
    var sh = sheetOrThrow_(req.title);
    var n = sh.getLastRow();
    return n ? sh.getRange(1, req.col + 1, n, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  },
  readRows: function (req) {
    var sh = sheetOrThrow_(req.title);
    var to = Math.min(req.to, sh.getLastRow());
    if (to < req.from) return [];
    return sh.getRange(req.from, 1, to - req.from + 1, Math.max(1, sh.getLastColumn())).getDisplayValues();
  },
  append: function (req) {
    var sh = sheetOrThrow_(req.title);
    if (!req.rows.length) return true;
    var width = req.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
    var rows = req.rows.map(function (r) { var x = r.slice(); while (x.length < width) x.push(''); return x; });
    ensureCols_(sh, width);
    setText_(sh.getRange(sh.getLastRow() + 1, 1, rows.length, width), rows); // after the last row with data
    return true;
  },
  writeCells: function (req) {
    req.cells.forEach(function (c) {
      var sh = sheetOrThrow_(c.title);
      ensureCols_(sh, c.col + 1);
      setText_(sh.getRange(c.row, c.col + 1), [[c.value]]);
    });
    return true;
  },
  // ---- Drive file storage (lab results, doctor photos) ----
  putFile: function (req) {
    var folder = DriveApp.getFolderById(props_().getProperty('DRIVE_FOLDER_ID'));
    var blob = Utilities.newBlob(Utilities.base64Decode(req.base64), req.mimeType, req.name);
    return { id: folder.createFile(blob).getId() };
  },
  getFile: function (req) {
    var f = fileInFolder_(req.id);
    return { base64: Utilities.base64Encode(f.getBlob().getBytes()), mimeType: f.getMimeType() };
  },
  deleteFile: function (req) { fileInFolder_(req.id).setTrashed(true); return true; },
};

/** Only files inside DRIVE_FOLDER_ID can be read or deleted through the API. */
function fileInFolder_(id) {
  var folderId = props_().getProperty('DRIVE_FOLDER_ID');
  var f = DriveApp.getFileById(id);
  var parents = f.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return f;
  throw new Error('File is not in the configured Drive folder.');
}
