// =============================================================================
// Time helpers — everything the UI shows is Asia/Dubai.
//
// Storage: UTC timestamps (Date objects / timestamptz).
// "Date keys": 'YYYY-MM-DD' strings that mean a Dubai calendar day.
// "Clock times": 'HH:MM' strings that mean Dubai wall-clock time.
//
// Asia/Dubai has a fixed UTC+4 offset (no DST), so converting wall-clock →
// UTC is exact arithmetic. Formatting uses Intl with the IANA zone so it is
// correct in every browser and on the server regardless of host timezone.
// Safe to import from both client and server code.
// =============================================================================
import CONFIG from '@/config/config';

const OFFSET_MS = CONFIG.TIMEZONE_OFFSET_MINUTES * 60_000;
const TZ = CONFIG.TIMEZONE;
const LOCALE = CONFIG.LOCALE;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDate = (d) => (d instanceof Date ? d : new Date(d));

/** Dubai calendar date ('YYYY-MM-DD') of an instant. */
export function dateKey(date = new Date()) {
  return new Date(toDate(date).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Dubai wall-clock 'HH:MM' of an instant. */
export function clockTime(date) {
  return new Date(toDate(date).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

/** UTC instant for a Dubai date key + 'HH:MM'. */
export function toUtc(key, hhmm = '00:00') {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) - OFFSET_MS);
}

/** Day of week (0 = Sunday) of a Dubai date key. */
export function dayOfWeek(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000);
}

export function eachDay(fromKey, toKey) {
  const out = [];
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push(k);
  return out;
}

export function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hhmmOf(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const isClock = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// ---------------------------------------------------------------------------
// Formatting (Dubai)
// ---------------------------------------------------------------------------
const fmt = (opts) => new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts });
const F = {
  long: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
  weekdayLong: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  short: fmt({ day: '2-digit', month: 'short', year: 'numeric' }),
  dayMonth: fmt({ day: 'numeric', month: 'short' }),
  weekday: fmt({ weekday: 'short' }),
  time12: new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }),
  dateTime: fmt({ day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
};

/** "10 November 2026" */
export const formatDateLong = (d) => F.long.format(toDate(d));
/** "Tuesday, 10 November 2026" */
export const formatDateWeekday = (d) => F.weekdayLong.format(toDate(d));
/** "10 Nov 2026" */
export const formatDateShort = (d) => F.short.format(toDate(d));
/** "10 Nov" */
export const formatDayMonth = (d) => F.dayMonth.format(toDate(d));
/** "10:00 AM" */
export const formatTime = (d) => F.time12.format(toDate(d));
/** "10:00 AM – 11:00 AM" */
export const formatRange = (a, b) => `${formatTime(a)} – ${formatTime(b)}`;
/** "06 Nov 2026, 14:32" */
export const formatDateTime = (d) => (d ? F.dateTime.format(toDate(d)) : '—');

/** Date-key helpers for display without building Dates by hand. */
export const keyToDate = (key) => toUtc(key, '12:00'); // midday avoids any edge
export const formatKeyLong = (key) => formatDateLong(keyToDate(key));
export const formatKeyShort = (key) => formatDateShort(keyToDate(key));
export const formatKeyWeekday = (key) => F.weekday.format(keyToDate(key));
export const formatKeyDayMonth = (key) => formatDayMonth(keyToDate(key));

/** "Today" / "Tomorrow" / "Saturday" / "Sat 14 Nov" relative to now in Dubai. */
export function relativeDayLabel(key, now = new Date()) {
  const today = dateKey(now);
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return DAY_NAMES[dayOfWeek(key)];
  return `${formatKeyWeekday(key)} ${formatKeyDayMonth(key)}`;
}

/** Monday of the week containing `key` (UAE work week starts Monday). */
export function startOfWeek(key) {
  const dow = dayOfWeek(key);
  const delta = (dow - CONFIG.WEEK_STARTS_ON + 7) % 7;
  return addDays(key, -delta);
}

export function startOfMonth(key) {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Resolve a dashboard period preset to Dubai date keys and UTC bounds.
 * `end` is exclusive (start of the day after toKey).
 */
export function resolvePeriod(preset = 'thisMonth', from, to, now = new Date()) {
  const today = dateKey(now);
  let fromKey;
  let toKey;
  switch (preset) {
    case 'today': fromKey = toKey = today; break;
    case 'yesterday': fromKey = toKey = addDays(today, -1); break;
    case 'thisWeek': fromKey = startOfWeek(today); toKey = addDays(fromKey, 6); break;
    case 'lastWeek': fromKey = addDays(startOfWeek(today), -7); toKey = addDays(fromKey, 6); break;
    case 'lastMonth': {
      const firstThis = startOfMonth(today);
      toKey = addDays(firstThis, -1);
      fromKey = startOfMonth(toKey);
      break;
    }
    case 'custom':
      fromKey = isDateKey(from) ? from : today;
      toKey = isDateKey(to) ? to : fromKey;
      if (toKey < fromKey) [fromKey, toKey] = [toKey, fromKey];
      break;
    case 'thisMonth':
    default:
      fromKey = startOfMonth(today); toKey = endOfMonth(today); break;
  }
  return { preset, fromKey, toKey, start: toUtc(fromKey), end: toUtc(addDays(toKey, 1)) };
}

export const PERIOD_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['thisWeek', 'This Week'], ['lastWeek', 'Last Week'],
  ['thisMonth', 'This Month'], ['lastMonth', 'Last Month'], ['custom', 'Custom Range'],
];
