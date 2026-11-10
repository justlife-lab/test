// =============================================================================
// Doctor availability engine
//
//   working schedule  (DoctorSchedules tab, multiple periods per day)
// − weekly off days   (Doctors ▸ weeklyOffDays)
// − leave dates       (DoctorLeaves tab)
// − existing bookings (Appointments in an ACTIVE status)
// − blocked slots     (BlockedSlots tab)
// − inactive / on-leave doctors
// = available slots
//
// The doctor calendar is the single source of truth. Clients only ever see
// slots computed here, every booking re-checks with assertSlotAvailable(), and
// lib/booking.js then confirms against LIVE sheet data after writing.
// =============================================================================
import 'server-only';
import { db, ACTIVE_STATUSES, groupBy, sortBy } from '@/lib/db';
import { AppError, MESSAGES } from '@/lib/errors';
import {
  dateKey, clockTime, toUtc, dayOfWeek, addDays, minutesOf, hhmmOf, eachDay,
} from '@/lib/time';

export { ACTIVE_STATUSES };

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

// ---------------------------------------------------------------------------
// Pure functions (no DB) — easy to unit-test
// ---------------------------------------------------------------------------

/** Working periods for one Dubai date as minute ranges [{start, end}]. */
export function workingPeriods(doctor, key, leaveDates = new Set()) {
  const dow = dayOfWeek(key);
  if ((doctor.weeklyOffDays || []).includes(dow)) return [];
  if (leaveDates.has(key)) return [];
  return (doctor.schedules || [])
    .filter((s) => s.dayOfWeek === dow)
    .map((s) => ({ start: minutesOf(s.startTime), end: minutesOf(s.endTime) }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start);
}

/** All slot candidates (aligned to period starts) before removing bookings. */
export function candidateSlots(doctor, key, leaveDates) {
  const dur = doctor.consultationMinutes || 60;
  const slots = [];
  for (const p of workingPeriods(doctor, key, leaveDates)) {
    for (let m = p.start; m + dur <= p.end; m += dur) {
      const startAt = toUtc(key, hhmmOf(m));
      slots.push({ startAt, endAt: new Date(startAt.getTime() + dur * 60_000) });
    }
  }
  return slots;
}

/**
 * Free slots for one doctor on one date.
 * @param busy     [{startAt, endAt}] bookings + blocked time for this doctor
 * @param earliest Date — slots starting before this are hidden (notice period)
 */
export function freeSlots(doctor, key, { leaveDates, busy = [], earliest }) {
  return candidateSlots(doctor, key, leaveDates).filter((s) =>
    (!earliest || s.startAt >= earliest)
    && !busy.some((b) => overlaps(s.startAt, s.endAt, new Date(b.startAt), new Date(b.endAt))));
}

// ---------------------------------------------------------------------------
// Sheet-backed availability
// ---------------------------------------------------------------------------
export const AVAILABILITY_TABLES = ['doctors', 'doctorSchedules', 'doctorLeaves', 'appointments', 'blockedSlots'];

/** Doctors with their schedules attached, ordered for display. */
export function doctorsWithSchedules(data, { onlyActive = true, doctorIds } = {}) {
  const sched = groupBy(data.doctorSchedules, 'doctorId');
  let ds = data.doctors;
  if (onlyActive) ds = ds.filter((d) => d.status === 'ACTIVE');
  if (doctorIds?.length) ds = ds.filter((d) => doctorIds.includes(d.id));
  return sortBy(ds, 'sortOrder', 'name').map((d) => ({ ...d, schedules: sched.get(d.id) || [] }));
}

/**
 * Loads everything needed to compute availability for a set of doctors over a
 * date range — one sheet read (or none, when cached).
 */
export async function loadAvailabilityData({ doctorIds, fromKey, toKey, onlyActive = true, fresh = false, data }) {
  data ||= await db.tables(AVAILABILITY_TABLES, { fresh });
  const doctors = doctorsWithSchedules(data, { onlyActive, doctorIds });
  const ids = new Set(doctors.map((d) => d.id));
  if (!ids.size) return { doctors: [], leaves: new Map(), busy: new Map() };

  const rangeStart = toUtc(fromKey);
  const rangeEnd = toUtc(addDays(toKey, 1));
  const leaves = new Map([...ids].map((id) => [id, new Set()]));
  for (const l of data.doctorLeaves) if (ids.has(l.doctorId) && l.date >= fromKey && l.date <= toKey) leaves.get(l.doctorId).add(l.date);
  const busy = new Map([...ids].map((id) => [id, []]));
  for (const a of data.appointments) {
    if (ids.has(a.doctorId) && ACTIVE_STATUSES.includes(a.status) && a.startAt < rangeEnd && a.endAt > rangeStart) busy.get(a.doctorId).push(a);
  }
  for (const b of data.blockedSlots) {
    if (ids.has(b.doctorId) && b.startAt < rangeEnd && b.endAt > rangeStart) busy.get(b.doctorId).push({ doctorId: b.doctorId, startAt: b.startAt, endAt: b.endAt });
  }
  return { doctors, leaves, busy };
}

/**
 * Client-facing availability.
 * Returns [{ doctor, days: { 'YYYY-MM-DD': [{startAt, endAt}] } }]
 * Booked slots are never included — they are simply absent.
 */
export async function getAvailability({ settings, doctorIds, fromKey, toKey, now = new Date(), excludeAppointmentId }) {
  const today = dateKey(now);
  const lastKey = addDays(today, settings.bookingHorizonDays - 1);
  const from = !fromKey || fromKey < today ? today : fromKey;
  const to = !toKey || toKey > lastKey ? lastKey : toKey;
  if (to < from) return [];

  const { doctors, leaves, busy } = await loadAvailabilityData({ doctorIds, fromKey: from, toKey: to });
  const earliest = new Date(now.getTime() + settings.minBookingNoticeMinutes * 60_000);

  return doctors.map((doctor) => {
    const doctorBusy = busy.get(doctor.id).filter((b) => b.id !== excludeAppointmentId);
    const days = {};
    for (const key of eachDay(from, to)) {
      const slots = freeSlots(doctor, key, { leaveDates: leaves.get(doctor.id), busy: doctorBusy, earliest });
      if (slots.length) days[key] = slots;
    }
    return { doctor, days };
  });
}

/**
 * Authoritative check, run INSIDE the booking transaction after the doctor's
 * advisory lock is held. Throws AppError when the slot cannot be booked.
 *
 * mode 'client': slot must be one of the generated 1-hour slots, inside the
 *                booking horizon and after the minimum notice.
 * mode 'admin':  any start time that fits fully inside a working period is
 *                allowed (e.g. drag-and-drop), and the window may already have
 *                started as long as it has not ended.
 */
export async function assertSlotAvailable({ doctorId, startAt, mode = 'client', settings, now = new Date(), excludeAppointmentId, fresh = false, data }) {
  data ||= await db.tables(AVAILABILITY_TABLES, { fresh });
  const [doctor] = doctorsWithSchedules(data, { onlyActive: false, doctorIds: [doctorId] });
  if (!doctor || doctor.status !== 'ACTIVE') {
    throw new AppError('DOCTOR_UNAVAILABLE', mode === 'client' ? MESSAGES.DOCTOR_UNAVAILABLE : MESSAGES.NOT_AVAILABLE_AT_TIME, 409);
  }

  const dur = doctor.consultationMinutes || 60;
  const start = new Date(startAt);
  const end = new Date(start.getTime() + dur * 60_000);
  const key = dateKey(start);
  const notAvailable = () => new AppError('NOT_AVAILABLE', MESSAGES.NOT_AVAILABLE_AT_TIME, 409);

  // Time-window rules
  if (mode === 'client') {
    const earliest = new Date(now.getTime() + settings.minBookingNoticeMinutes * 60_000);
    const lastKey = addDays(dateKey(now), settings.bookingHorizonDays - 1);
    if (start < earliest || key > lastKey) throw notAvailable();
  } else if (end <= now) {
    throw new AppError('IN_PAST', 'This time window has already passed.', 409);
  }

  // Leave
  const onLeave = data.doctorLeaves.some((l) => l.doctorId === doctorId && l.date === key);
  const periods = workingPeriods(doctor, key, new Set(onLeave ? [key] : []));

  // Working hours / weekly off day
  const startMin = minutesOf(clockTime(start));
  const endMin = startMin + dur;
  const fits = periods.find((p) => startMin >= p.start && endMin <= p.end);
  if (!fits) throw notAvailable();
  if (mode === 'client' && (startMin - fits.start) % dur !== 0) throw notAvailable();

  // Existing bookings
  if (findClash(data.appointments, { doctorId, start, end, excludeIds: [excludeAppointmentId] })) throw slotTaken(mode);

  // Blocked time
  if (data.blockedSlots.some((b) => b.doctorId === doctorId && b.startAt < end && b.endAt > start)) throw notAvailable();

  return { doctor, startAt: start, endAt: end };
}

/** First active appointment of this doctor overlapping [start, end), or null. */
export function findClash(appointments, { doctorId, start, end, excludeIds = [] }) {
  return appointments.find((a) => a.doctorId === doctorId && ACTIVE_STATUSES.includes(a.status)
    && !excludeIds.includes(a.id) && a.startAt < end && a.endAt > start) || null;
}

export const slotTaken = (mode) => (mode === 'client'
  ? new AppError('SLOT_TAKEN', MESSAGES.SLOT_TAKEN, 409)
  : new AppError('SLOT_TAKEN', `${MESSAGES.NOT_AVAILABLE_AT_TIME} Another appointment already occupies this time.`, 409));

/**
 * Working windows per doctor per day (for shading the admin calendar).
 * Returns { [doctorId]: { [dateKey]: [{start:'HH:MM', end:'HH:MM'}] } }
 */
export async function getWorkingWindows({ doctorIds, fromKey, toKey, data }) {
  const { doctors, leaves } = await loadAvailabilityData({ doctorIds, fromKey, toKey, onlyActive: false, data });
  const out = {};
  for (const d of doctors) {
    out[d.id] = {};
    for (const key of eachDay(fromKey, toKey)) {
      out[d.id][key] = d.status === 'ACTIVE'
        ? workingPeriods(d, key, leaves.get(d.id)).map((p) => ({ start: hhmmOf(p.start), end: hhmmOf(p.end) }))
        : [];
    }
  }
  return out;
}

/** Total scheduled working minutes for a doctor over a range (for utilization). */
export function workingMinutesInRange(doctor, fromKey, toKey, leaveDates) {
  let total = 0;
  for (const key of eachDay(fromKey, toKey)) {
    for (const p of workingPeriods(doctor, key, leaveDates)) total += p.end - p.start;
  }
  return total;
}
