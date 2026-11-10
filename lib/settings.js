// Runtime business settings. Defaults come from config/config.js; admins can
// override them in Admin → Settings. Overrides live in the "Settings" tab of
// the Google Sheet (key | value) and can also be edited there directly —
// values are JSON: 5, true, "text", [{"hours":24,"enabled":true}].
import 'server-only';
import { db } from '@/lib/db';
import CONFIG from '@/config/config';

export const SETTING_DEFAULTS = {
  onTimeToleranceMinutes: CONFIG.ON_TIME_TOLERANCE_MINUTES,
  bookingHorizonDays: CONFIG.BOOKING_HORIZON_DAYS,
  minBookingNoticeMinutes: CONFIG.MIN_BOOKING_NOTICE_MINUTES,
  rescheduleCutoffHours: CONFIG.RESCHEDULE_CUTOFF_HOURS,
  maxReschedules: CONFIG.MAX_RESCHEDULES,
  rescheduleLinkExpiryDays: CONFIG.RESCHEDULE_LINK_EXPIRY_DAYS,
  allowClientCancel: CONFIG.ALLOW_CLIENT_CANCEL,
  requireRescheduleReason: CONFIG.REQUIRE_RESCHEDULE_REASON,
  maxUploadMb: CONFIG.MAX_UPLOAD_MB,
  maxUploadFiles: CONFIG.MAX_UPLOAD_FILES,
  reminders: CONFIG.REMINDER_HOURS.map((hours) => ({ hours, enabled: true })),
  supportEmail: CONFIG.SUPPORT_EMAIL,
  supportPhone: CONFIG.SUPPORT_PHONE,
  notifyDoctorOnAssignment: true,
};

// Validation rules applied when admins save settings.
export const SETTING_RULES = {
  onTimeToleranceMinutes: (v) => Number.isInteger(v) && v >= 0 && v <= 60,
  bookingHorizonDays: (v) => Number.isInteger(v) && v >= 1 && v <= 90,
  minBookingNoticeMinutes: (v) => Number.isInteger(v) && v >= 0 && v <= 1440,
  rescheduleCutoffHours: (v) => typeof v === 'number' && v >= 0 && v <= 168,
  maxReschedules: (v) => Number.isInteger(v) && v >= 0 && v <= 20,
  rescheduleLinkExpiryDays: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
  allowClientCancel: (v) => typeof v === 'boolean',
  requireRescheduleReason: (v) => typeof v === 'boolean',
  maxUploadMb: (v) => typeof v === 'number' && v > 0 && v <= 4.4, // Vercel body limit 4.5 MB
  maxUploadFiles: (v) => Number.isInteger(v) && v >= 0 && v <= 10,
  reminders: (v) => Array.isArray(v) && v.length <= 6 && v.every((r) => typeof r.hours === 'number' && r.hours > 0 && r.hours <= 168 && typeof r.enabled === 'boolean'),
  supportEmail: (v) => typeof v === 'string' && v.length <= 200,
  supportPhone: (v) => typeof v === 'string' && v.length <= 50,
  notifyDoctorOnAssignment: (v) => typeof v === 'boolean',
};

let cache = null;
let cacheAt = 0;
const TTL = 30_000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < TTL) return cache;
  const rows = await db.all('settings', { fresh });
  const merged = { ...SETTING_DEFAULTS };
  // Ignore hand-typed values that fail validation, so a typo in the sheet
  // can't break bookings — the default is used instead.
  for (const r of rows) if (r.key in SETTING_DEFAULTS && SETTING_RULES[r.key](r.value)) merged[r.key] = r.value;
  cache = merged;
  cacheAt = Date.now();
  return merged;
}

export async function saveSettings(patch, updatedBy) {
  const errors = [];
  const entries = Object.entries(patch).filter(([k]) => k in SETTING_DEFAULTS);
  for (const [k, v] of entries) if (!SETTING_RULES[k](v)) errors.push(k);
  if (errors.length) return { ok: false, errors };
  for (const [key, value] of entries) {
    await db.upsert('settings', (r) => r.key === key, { key, value, updatedBy, updatedAt: new Date() }, { value, updatedBy });
  }
  cache = null;
  return { ok: true, settings: await getSettings({ fresh: true }) };
}

/** Public subset safe to send to the browser. */
export function publicSettings(s) {
  return {
    maxUploadMb: s.maxUploadMb,
    maxUploadFiles: s.maxUploadFiles,
    bookingHorizonDays: s.bookingHorizonDays,
    allowClientCancel: s.allowClientCancel,
    requireRescheduleReason: s.requireRescheduleReason,
    rescheduleCutoffHours: s.rescheduleCutoffHours,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
  };
}
