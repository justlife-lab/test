// =============================================================================
// Booking engine — the ONLY code path that writes appointment slots.
//
// Google Sheets has no transactions or locks, so double bookings are prevented
// with an "append, then verify — the earliest row wins" protocol:
//
//   1. assertSlotAvailable() checks hours / leave / off-day / blocks / clashes.
//   2. The new appointment row is APPENDED. Google applies appends to one
//      spreadsheet strictly one after another, so row order = arrival order.
//   3. We re-read the Appointments tab LIVE (bypassing every cache) and look
//      for another active appointment of the same doctor overlapping our time
//      that sits ABOVE our row (= arrived first).
//        • found  → we lost the race: our row is tombstoned and the client
//                   sees "Sorry, this time slot has just been booked…"
//        • none   → we won. Anyone appending after us sees our row in step 3.
//
// Every slot is only ever claimed by appending a NEW row (reschedules and
// drag-and-drop moves create a new version; the old one becomes
// RESCHEDULED), so this single rule covers bookings, reschedules and moves.
// Single-use booking links use the same rule (first booking row wins).
// =============================================================================
import 'server-only';
import { db, ACTIVE_STATUSES } from '@/lib/db';
import { assertSlotAvailable, findClash, slotTaken, AVAILABILITY_TABLES } from '@/lib/availability';
import { AppError, MESSAGES, notFound } from '@/lib/errors';
import { secureToken, appointmentNumber } from '@/lib/tokens';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { formatDateShort, formatRange, clockTime } from '@/lib/time';
import { bookingLinkUrl } from '@/lib/url';

function uniqueAppointmentNo(appointments) {
  const taken = new Set(appointments.map((a) => a.appointmentNo));
  for (let i = 0; i < 20; i++) {
    const no = appointmentNumber();
    if (!taken.has(no)) return no;
  }
  throw new Error('Could not allocate an appointment number');
}

/** Validates a booking link and returns its row. */
export async function getUsableLink(token, { fresh = false } = {}) {
  if (!token || typeof token !== 'string' || token.length > 64) throw new AppError('LINK_INVALID', MESSAGES.LINK_INVALID, 404);
  const link = (await db.all('bookingLinks', { fresh })).find((l) => l.token === token);
  if (!link) throw new AppError('LINK_INVALID', MESSAGES.LINK_INVALID, 404);
  const status = effectiveLinkStatus(link);
  if (status === 'EXPIRED') throw new AppError('LINK_EXPIRED', MESSAGES.LINK_EXPIRED, 410);
  if (status === 'USED') throw new AppError('LINK_USED', MESSAGES.LINK_USED, 410);
  if (status === 'CANCELLED') throw new AppError('LINK_CANCELLED', MESSAGES.LINK_CANCELLED, 410);
  return link;
}

/** Booking link as shown in the admin UI (live status + absolute URL). */
export const linkOut = (l) => ({ ...l, status: effectiveLinkStatus(l), url: bookingLinkUrl(l.token) });

export function effectiveLinkStatus(link, now = new Date()) {
  if (link.status !== 'ACTIVE') return link.status;
  if (link.expiresAt && new Date(link.expiresAt) < now) return 'EXPIRED';
  if (link.singleUse && link.usesCount > 0) return 'USED';
  return 'ACTIVE';
}

/**
 * Step 3 of the protocol. Re-reads Appointments live and decides whether the
 * row we just appended keeps the slot. Throws (after tombstoning our row) if not.
 */
async function confirmSlot(row, { mode, excludeIds = [], singleUseLinkId = null }) {
  const { appointments } = await db.tables(['appointments'], { fresh: true });
  const mine = appointments.findIndex((a) => a.id === row.id);
  // Our row must be visible in a live read; if not, something is badly wrong.
  if (mine < 0) throw new Error('Booking row not found after write');
  const earlier = appointments.slice(0, mine);
  const clash = findClash(earlier, { doctorId: row.doctorId, start: row.startAt, end: row.endAt, excludeIds });
  const linkClash = singleUseLinkId
    && earlier.some((a) => a.bookingLinkId === singleUseLinkId && !a.rescheduledFromId && a.source === 'CLIENT_LINK');
  if (clash || linkClash) {
    await db.remove('appointments', row.id).catch((e) => console.error('[booking] could not remove losing row', row.id, e));
    throw clash ? slotTaken(mode) : new AppError('LINK_USED', MESSAGES.LINK_USED, 410);
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
/**
 * @param {object} p
 * @param {object} p.client        { name, email, mobile, dateOfBirth?, gender? }  — or p.clientId
 * @param {string} p.doctorId
 * @param {Date}   p.startAt
 * @param {'PHONE'|'WHATSAPP'} p.contactMethod
 * @param {string} p.bookingReference  Justlife booking reference
 * @param {'client'|'admin'} p.mode
 * @param {string} [p.linkToken]   booking link (client mode)
 * @param {string} [p.uploadSession] + p.documentIds  pending lab-result uploads to attach
 */
export async function createBooking(p) {
  const { settings, actor, mode = 'client' } = p;

  // Live data for the decision (cheap: one read for all tabs involved)
  const data = await db.tables([...AVAILABILITY_TABLES, 'bookingLinks', 'clients'], { fresh: true });
  let link = null;
  if (p.linkToken) link = await getUsableLink(p.linkToken);
  const { startAt, endAt } = await assertSlotAvailable({ doctorId: p.doctorId, startAt: p.startAt, mode, settings, data });

  // Client record — one per (email, mobile), refreshed on every booking
  let clientId = p.clientId;
  let newClient = false;
  if (clientId) {
    if (!data.clients.some((c) => c.id === clientId)) throw notFound('Client not found.');
  } else {
    const c = p.client;
    const email = c.email.toLowerCase();
    const existing = data.clients.find((x) => x.email?.toLowerCase() === email && x.mobile === c.mobile);
    const fields = {
      name: c.name, bookingReference: p.bookingReference,
      ...(c.dateOfBirth ? { dateOfBirth: c.dateOfBirth } : {}),
      ...(c.gender ? { gender: c.gender } : {}),
    };
    newClient = !existing;
    clientId = existing
      ? (await db.update('clients', existing.id, fields)).id
      : (await db.insert('clients', { ...fields, email: c.email, mobile: c.mobile })).id;
  }

  const appt = await db.insert('appointments', {
    appointmentNo: uniqueAppointmentNo(data.appointments),
    bookingReference: p.bookingReference,
    clientId,
    doctorId: p.doctorId,
    startAt, endAt,
    contactMethod: p.contactMethod,
    status: 'SCHEDULED',
    source: p.source ?? (mode === 'admin' ? 'ADMIN' : 'CLIENT_LINK'),
    clientNotes: p.clientNotes || null,
    adminNotes: p.adminNotes || null,
    bookingLinkId: link?.id ?? null,
    rescheduleToken: secureToken(),
    createdById: actor?.id ?? null,
  });
  try {
    await confirmSlot(appt, { mode, singleUseLinkId: link?.singleUse ? link.id : null });
  } catch (err) {
    if (newClient) await db.remove('clients', clientId).catch(() => {}); // don't leave a client row for a failed booking
    throw err;
  }

  // ---- we own the slot from here on ----
  if (link) {
    await db.update('bookingLinks', link.id, {
      usesCount: (link.usesCount || 0) + 1, usedAt: new Date(), ...(link.singleUse ? { status: 'USED' } : {}),
    });
  }
  if (p.documentIds?.length && p.uploadSession) {
    const wanted = new Set(p.documentIds.slice(0, 20));
    const docs = (await db.all('documents', { fresh: true }))
      .filter((d) => wanted.has(d.id) && d.uploadSession === p.uploadSession && !d.appointmentId);
    if (docs.length) await db.updateMany('documents', docs.map((d) => d.id), { appointmentId: appt.id, clientId });
  }
  await audit(actor, 'BOOKING_CREATED', {
    appointmentId: appt.id,
    summary: `Created booking ${appt.appointmentNo}`,
    newValue: { doctorId: p.doctorId, startAt, contactMethod: p.contactMethod, source: appt.source },
  });

  await notify('BOOKING_CREATED', { appointmentId: appt.id });
  return appt;
}

// ---------------------------------------------------------------------------
// Reschedule (keeps history: old row → RESCHEDULED, new row → SCHEDULED)
// ---------------------------------------------------------------------------

/** Whether a client may still reschedule/cancel online. */
export function selfServiceEligibility(appt, settings, now = new Date()) {
  if (!appt || appt.status !== 'SCHEDULED') return { ok: false, reason: MESSAGES.RESCHEDULE_INVALID };
  const hoursLeft = (new Date(appt.startAt) - now) / 3_600_000;
  if (hoursLeft < settings.rescheduleCutoffHours) return { ok: false, reason: MESSAGES.RESCHEDULE_CLOSED };
  if (settings.rescheduleLinkExpiryDays > 0) {
    const issued = new Date(appt.createdAt).getTime();
    if (now.getTime() > issued + settings.rescheduleLinkExpiryDays * 86_400_000) return { ok: false, reason: MESSAGES.RESCHEDULE_CLOSED };
  }
  return { ok: true, canReschedule: appt.rescheduleCount < settings.maxReschedules };
}

/**
 * @param {object} p
 * @param {string} p.appointmentId
 * @param {string} p.newDoctorId
 * @param {Date}   p.newStartAt
 * @param {'client'|'admin'} p.mode
 * @param {string} [p.contactMethod]  optional change
 * @param {string} [p.reason]
 * @param {string} [p.expectedToken]  client mode: token the client presented
 */
export async function rescheduleAppointment(p) {
  const { settings, actor, mode = 'client' } = p;
  const data = await db.tables(AVAILABILITY_TABLES, { fresh: true });
  const old = data.appointments.find((a) => a.id === p.appointmentId);
  if (!old) throw notFound('Appointment not found.');
  if (old.status !== 'SCHEDULED') throw new AppError('NOT_RESCHEDULABLE', 'Only scheduled appointments can be rescheduled.', 409);

  if (mode === 'client') {
    if (!p.expectedToken || old.rescheduleToken !== p.expectedToken) throw new AppError('RESCHEDULE_INVALID', MESSAGES.RESCHEDULE_INVALID, 404);
    const elig = selfServiceEligibility(old, settings);
    if (!elig.ok) throw new AppError('RESCHEDULE_CLOSED', elig.reason, 409);
    if (!elig.canReschedule) throw new AppError('RESCHEDULE_LIMIT', `${MESSAGES.RESCHEDULE_CLOSED}`, 409);
    if (settings.requireRescheduleReason && !p.reason) throw new AppError('BAD_REQUEST', 'Please tell us why you would like to reschedule.', 400);
  }

  // The old slot doesn't count against the new one ("same doctor, shifted time" works).
  const { startAt, endAt, doctor } = await assertSlotAvailable({
    doctorId: p.newDoctorId, startAt: p.newStartAt, mode, settings, excludeAppointmentId: old.id, data,
  });

  const next = await db.insert('appointments', {
    appointmentNo: old.appointmentNo.includes('-R') ? old.appointmentNo.replace(/-R\d+$/, `-R${old.rescheduleCount + 1}`) : `${old.appointmentNo}-R${old.rescheduleCount + 1}`,
    bookingReference: old.bookingReference,
    clientId: old.clientId,
    doctorId: p.newDoctorId,
    startAt, endAt,
    contactMethod: p.contactMethod || old.contactMethod,
    status: 'SCHEDULED',
    source: mode === 'client' ? 'CLIENT_RESCHEDULE' : 'ADMIN_RESCHEDULE',
    clientNotes: old.clientNotes,
    adminNotes: old.adminNotes,
    bookingLinkId: old.bookingLinkId,
    rescheduleToken: old.rescheduleToken || secureToken(),
    rescheduleCount: old.rescheduleCount + 1,
    rescheduledFromId: old.id,
    createdById: actor?.id ?? null,
  });
  await confirmSlot(next, { mode, excludeIds: [old.id] });

  // Re-check the old version wasn't changed meanwhile (e.g. cancelled in another tab).
  const live = await db.get('appointments', old.id, { fresh: true });
  if (!live || live.status !== 'SCHEDULED') {
    await db.remove('appointments', next.id);
    throw new AppError('NOT_RESCHEDULABLE', 'This appointment was changed by someone else. Please refresh and try again.', 409);
  }
  // Superseded: the token moves to the new version, so the emailed link keeps working.
  await db.update('appointments', old.id, { status: 'RESCHEDULED', rescheduleToken: null, rescheduleReason: p.reason || null });

  // Lab results follow the active appointment so the (new) doctor can see them.
  const docs = (await db.all('documents', { fresh: true })).filter((d) => d.appointmentId === old.id);
  if (docs.length) await db.updateMany('documents', docs.map((d) => d.id), { appointmentId: next.id });

  const oldDoctor = data.doctors.find((d) => d.id === old.doctorId);
  const moved = old.doctorId !== p.newDoctorId;
  const from = `${oldDoctor?.name} / ${formatDateShort(old.startAt)} ${clockTime(old.startAt)}–${clockTime(old.endAt)}`;
  const to = `${doctor.name} / ${formatDateShort(startAt)} ${clockTime(startAt)}–${clockTime(endAt)}`;
  const action = mode === 'client' ? 'CLIENT_RESCHEDULED' : (p.viaDrag ? 'BOOKING_MOVED' : 'BOOKING_RESCHEDULED');
  const payload = {
    oldValue: { appointmentId: old.id, appointmentNo: old.appointmentNo, doctorId: old.doctorId, doctor: oldDoctor?.name, startAt: old.startAt, endAt: old.endAt, contactMethod: old.contactMethod },
    newValue: { appointmentId: next.id, appointmentNo: next.appointmentNo, doctorId: next.doctorId, doctor: doctor.name, startAt, endAt, contactMethod: next.contactMethod },
    reason: p.reason || null,
  };
  await audit(actor, action, { appointmentId: next.id, summary: `${old.bookingReference}: ${from} → ${to}`, ...payload });
  await audit(actor, action, { appointmentId: old.id, summary: `Superseded by ${next.appointmentNo}`, ...payload });
  if (moved) await audit(actor, 'DOCTOR_REASSIGNED', { appointmentId: next.id, summary: `${oldDoctor?.name} → ${doctor.name}`, ...payload });

  await notify('BOOKING_RESCHEDULED', { appointmentId: next.id, previousAppointmentId: old.id, doctorChanged: moved });
  return next;
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------
export async function cancelAppointment({ appointmentId, reason, actor, mode = 'admin', settings, expectedToken }) {
  const old = await db.get('appointments', appointmentId, { fresh: true });
  if (!old) throw notFound('Appointment not found.');
  if (mode === 'client') {
    if (!expectedToken || old.rescheduleToken !== expectedToken) throw new AppError('RESCHEDULE_INVALID', MESSAGES.RESCHEDULE_INVALID, 404);
    if (!settings.allowClientCancel) throw new AppError('FORBIDDEN', MESSAGES.RESCHEDULE_CLOSED, 403);
    const elig = selfServiceEligibility(old, settings);
    if (!elig.ok) throw new AppError('RESCHEDULE_CLOSED', elig.reason, 409);
  } else if (!['SCHEDULED', 'CALLING'].includes(old.status)) {
    throw new AppError('NOT_CANCELLABLE', 'Only scheduled appointments can be cancelled.', 409);
  }
  // Token is kept so the client's link shows "cancelled" instead of "invalid".
  const appt = await db.update('appointments', appointmentId, { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason || null });
  await audit(actor, mode === 'client' ? 'CLIENT_CANCELLED' : 'BOOKING_CANCELLED', {
    appointmentId, summary: `Cancelled ${old.appointmentNo} (${formatDateShort(old.startAt)} ${formatRange(old.startAt, old.endAt)})`,
    oldValue: { status: old.status }, newValue: { status: 'CANCELLED' }, reason: reason || null,
  });
  await notify('BOOKING_CANCELLED', { appointmentId: appt.id });
  return appt;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
const FULL_TABLES = ['appointments', 'clients', 'doctors', 'documents', 'consultationNotes', 'upsells'];
const pickDoctor = (d) => d && ({
  id: d.id, name: d.name, email: d.email, specialty: d.specialty, photoFileId: d.photoFileId,
  photoVersion: d.photoVersion, consultationMinutes: d.consultationMinutes, languages: d.languages,
  experienceYears: d.experienceYears, bio: d.bio, consultationType: d.consultationType,
});

/** Appointment with client, doctor, documents, note and upsells attached. */
export async function getAppointmentFull(id, { fresh = false } = {}) {
  if (!id) return null;
  let t = await db.tables(FULL_TABLES, { fresh });
  let a = t.appointments.find((x) => x.id === id);
  if (!a && !fresh) { t = await db.tables(FULL_TABLES, { fresh: true }); a = t.appointments.find((x) => x.id === id); }
  if (!a) return null;
  return {
    ...a,
    client: t.clients.find((c) => c.id === a.clientId) || { id: a.clientId, name: 'Unknown client', email: '', mobile: '' },
    doctor: pickDoctor(t.doctors.find((d) => d.id === a.doctorId)) || { id: a.doctorId, name: 'Unknown doctor' },
    documents: t.documents.filter((d) => d.appointmentId === id)
      .map(({ id: docId, fileName, fileType, size, uploadedBy, createdAt }) => ({ id: docId, fileName, fileType, size, uploadedBy, createdAt })),
    note: t.consultationNotes.find((n) => n.appointmentId === id) || null,
    upsells: t.upsells.filter((u) => u.appointmentId === id),
  };
}

/** Walks rescheduledFromId to return the full history, oldest first. */
export async function getRescheduleChain(appt) {
  const { appointments, doctors } = await db.tables(['appointments', 'doctors']);
  const byId = new Map(appointments.map((a) => [a.id, a]));
  const byFrom = new Map(appointments.filter((a) => a.rescheduledFromId).map((a) => [a.rescheduledFromId, a]));
  const withDoctor = (a) => ({ ...a, doctor: { name: doctors.find((d) => d.id === a.doctorId)?.name } });
  const before = [];
  let cur = appt;
  for (let guard = 0; cur?.rescheduledFromId && guard < 25; guard++) {
    cur = byId.get(cur.rescheduledFromId);
    if (cur) before.unshift(withDoctor(cur));
  }
  const after = [];
  let fwd = appt;
  for (let guard = 0; fwd && guard < 25; guard++) {
    fwd = byFrom.get(fwd.id);
    if (fwd) after.push(withDoctor(fwd));
  }
  return { before, after };
}

export { ACTIVE_STATUSES };
