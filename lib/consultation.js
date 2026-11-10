// =============================================================================
// Consultation workflow: Scheduled → Calling → Completed (or No Show),
// clinical notes and upsells. Used by the doctor portal and the admin console.
// Ownership is enforced by loadAccessibleAppointment() before any of these run.
// =============================================================================
import 'server-only';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { AppError, notFound } from '@/lib/errors';
import { getAppointmentFull } from '@/lib/booking';
import { notesSchema, upsellSchema } from '@/lib/validation';
import { dateKey, formatDateLong } from '@/lib/time';

/** Doctors may only ever load their own appointments (404, not 403, to avoid probing). */
export async function loadAccessibleAppointment(id, user) {
  const appt = await getAppointmentFull(id, { fresh: true });
  if (!appt) throw notFound('Appointment not found.');
  if (user.role === 'DOCTOR' && appt.doctorId !== user.doctorId) throw notFound('Appointment not found.');
  return appt;
}

const actorOf = (user) => ({ type: user.role === 'DOCTOR' ? 'DOCTOR' : 'ADMIN', id: user.id, email: user.email });

export async function startCall(appt, user, { method } = {}) {
  if (appt.status === 'CALLING') return appt;
  if (appt.status !== 'SCHEDULED') throw new AppError('INVALID_STATE', 'Only scheduled consultations can be started.', 409);
  const now = new Date();
  // Calls can only start on the appointment's (Dubai) day, so early "practice"
  // starts can't inflate the on-time KPI.
  if (dateKey(now) < dateKey(appt.startAt)) {
    throw new AppError('TOO_EARLY', `This consultation can be started on ${formatDateLong(appt.startAt)}.`, 409);
  }
  const delay = Math.max(0, Math.round((now - new Date(appt.startAt)) / 60_000));
  await db.update('appointments', appt.id, {
    status: 'CALLING', callStartedAt: now, callDelayMinutes: delay, callMethod: method || appt.contactMethod,
  });
  await audit(actorOf(user), 'CALL_STARTED', {
    appointmentId: appt.id, summary: `Call started ${delay ? `${delay} min after window start` : 'on time'}`,
    newValue: { callStartedAt: now, delayMinutes: delay, method: method || appt.contactMethod },
  });
  return getAppointmentFull(appt.id);
}

async function upsertNotes(appt, input) {
  const values = { ...input, doctorId: appt.doctorId };
  const existing = (await db.all('consultationNotes', { fresh: true })).find((n) => n.appointmentId === appt.id);
  if (existing) await db.update('consultationNotes', existing.id, values);
  else await db.insert('consultationNotes', { appointmentId: appt.id, ...values });
}

export async function saveNotes(appt, user, raw) {
  if (['CANCELLED', 'RESCHEDULED'].includes(appt.status)) throw new AppError('INVALID_STATE', 'Notes cannot be added to a cancelled or rescheduled appointment.', 409);
  const input = notesSchema.parse(raw);
  await upsertNotes(appt, input);
  await audit(actorOf(user), 'NOTES_UPDATED', { appointmentId: appt.id, oldValue: appt.note ?? null, newValue: input });
  return getAppointmentFull(appt.id);
}

export async function completeConsultation(appt, user, { notes, outcome, callMethod }) {
  const allowed = user.role === 'ADMIN' ? ['SCHEDULED', 'CALLING'] : ['CALLING'];
  if (!allowed.includes(appt.status)) {
    throw new AppError('INVALID_STATE', appt.status === 'SCHEDULED' ? 'Start the consultation before completing it.' : 'This consultation cannot be completed.', 409);
  }
  const input = notesSchema.parse(notes || {});
  const missing = ['mainIssue', 'assessment', 'recommendation'].filter((k) => !input[k]);
  if (missing.length) throw new AppError('NOTES_REQUIRED', 'Please complete Main Issue, Assessment and Recommendation before completing the consultation.', 400, { missing });
  const now = new Date();
  await upsertNotes(appt, input);
  await db.update('appointments', appt.id, {
    status: 'COMPLETED', callEndedAt: now, outcome: outcome?.slice(0, 200) || 'Consultation completed',
    ...(callMethod ? { callMethod } : {}),
  });
  await audit(actorOf(user), 'CONSULTATION_COMPLETED', {
    appointmentId: appt.id, summary: `Completed by ${user.email}`,
    oldValue: { status: appt.status }, newValue: { status: 'COMPLETED', callEndedAt: now, outcome },
  });
  await audit(actorOf(user), 'NOTES_UPDATED', { appointmentId: appt.id, oldValue: appt.note ?? null, newValue: input });
  return getAppointmentFull(appt.id);
}

export async function markNoShow(appt, user, { outcome } = {}) {
  if (!['SCHEDULED', 'CALLING'].includes(appt.status)) throw new AppError('INVALID_STATE', 'Only scheduled consultations can be marked as no-show.', 409);
  await db.update('appointments', appt.id, {
    status: 'NO_SHOW', outcome: outcome?.slice(0, 200) || 'Client did not answer', callEndedAt: appt.callStartedAt ? new Date() : null,
  });
  await audit(actorOf(user), 'MARKED_NO_SHOW', { appointmentId: appt.id, oldValue: { status: appt.status }, newValue: { status: 'NO_SHOW', outcome } });
  return getAppointmentFull(appt.id);
}

export async function addUpsell(appt, user, raw) {
  const input = upsellSchema.parse(raw);
  const row = await db.insert('upsells', {
    appointmentId: appt.id, service: input.service, status: input.status,
    recommendedAmount: input.recommendedAmount, bookedAmount: input.bookedAmount ?? null,
    bookingReference: input.bookingReference ?? null, createdById: user.id,
  });
  await audit(actorOf(user), 'UPSELL_CREATED', { appointmentId: appt.id, entityType: 'upsell', entityId: row.id, newValue: input, summary: `${input.service} — ${input.status}` });
  return row;
}

export async function updateUpsell(appt, user, upsellId, raw) {
  const old = await db.get('upsells', upsellId, { fresh: true });
  if (!old || old.appointmentId !== appt.id) throw notFound('Upsell not found.');
  const input = upsellSchema.partial().parse(raw);
  const set = {};
  if (input.service !== undefined) set.service = input.service;
  if (input.status !== undefined) set.status = input.status;
  if (input.recommendedAmount !== undefined) set.recommendedAmount = input.recommendedAmount;
  if (input.bookedAmount !== undefined) set.bookedAmount = input.bookedAmount ?? null;
  if (input.bookingReference !== undefined) set.bookingReference = input.bookingReference;
  const row = await db.update('upsells', upsellId, set);
  await audit(actorOf(user), 'UPSELL_UPDATED', {
    appointmentId: appt.id, entityType: 'upsell', entityId: upsellId, oldValue: old, newValue: row, summary: `${row.service}: ${old.status} → ${row.status}`,
  });
  return row;
}

export async function deleteUpsell(appt, user, upsellId) {
  const found = await db.get('upsells', upsellId, { fresh: true });
  if (!found || found.appointmentId !== appt.id) throw notFound('Upsell not found.');
  const old = await db.remove('upsells', upsellId);
  await audit(actorOf(user), 'UPSELL_DELETED', { appointmentId: appt.id, entityType: 'upsell', entityId: upsellId, oldValue: old });
}

/** Detailed view returned to admin & doctor UIs. */
export function appointmentDetail(a, { includeAdmin = false } = {}) {
  return {
    id: a.id,
    appointmentNo: a.appointmentNo,
    bookingReference: a.bookingReference,
    status: a.status,
    source: a.source,
    startAt: a.startAt,
    endAt: a.endAt,
    contactMethod: a.contactMethod,
    callStartedAt: a.callStartedAt,
    callEndedAt: a.callEndedAt,
    callDelayMinutes: a.callDelayMinutes,
    callMethod: a.callMethod,
    outcome: a.outcome,
    clientNotes: a.clientNotes,
    rescheduleCount: a.rescheduleCount,
    rescheduledFromId: a.rescheduledFromId,
    rescheduleReason: a.rescheduleReason,
    cancelReason: a.cancelReason,
    cancelledAt: a.cancelledAt,
    createdAt: a.createdAt,
    client: {
      id: a.client.id, name: a.client.name, email: a.client.email, mobile: a.client.mobile,
      dateOfBirth: a.client.dateOfBirth, gender: a.client.gender,
    },
    doctor: { id: a.doctor.id, name: a.doctor.name, specialty: a.doctor.specialty },
    documents: a.documents.map((d) => ({ id: d.id, fileName: d.fileName, fileType: d.fileType, size: d.size, uploadedBy: d.uploadedBy, createdAt: d.createdAt })),
    note: a.note,
    upsells: a.upsells.map((u) => ({ ...u, recommendedAmount: Number(u.recommendedAmount), bookedAmount: u.bookedAmount == null ? null : Number(u.bookedAmount) })),
    ...(includeAdmin ? { adminNotes: a.adminNotes } : {}),
  };
}
