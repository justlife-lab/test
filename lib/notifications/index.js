// =============================================================================
// Notification hub
//
// The booking engine only ever calls notify(event, payload). This module maps
// events to channels, so providers can be swapped or added (WhatsApp Business,
// SMS, CRM…) without touching booking code.
//
// Channels
//   • Email — built in (lib/notifications/email.js, provider via EMAIL_PROVIDER)
//   • Webhook — if NOTIFICATION_WEBHOOK_URL is set, every event is POSTed as
//     signed JSON (HMAC-SHA256 in X-Justlife-Signature). Connect WhatsApp/SMS
//     gateways, Zapier/Make, CRM or Google Apps Script here.
//
// Events: BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED,
//         DOCTOR_ASSIGNED (derived), APPOINTMENT_REMINDER
// =============================================================================
import 'server-only';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { sendTemplatedEmail } from './email';
import { appUrl, rescheduleLinkUrl, doctorPhotoUrl } from '@/lib/url';
import { formatDateLong, formatTime, formatRange } from '@/lib/time';

export const CONTACT_LABEL = { PHONE: 'Phone Call', WHATSAPP: 'WhatsApp' };

async function loadAppointment(id) {
  const t = await db.tables(['appointments', 'clients', 'doctors']);
  const a = t.appointments.find((x) => x.id === id);
  if (!a) return null;
  const client = t.clients.find((c) => c.id === a.clientId);
  const doctor = t.doctors.find((d) => d.id === a.doctorId);
  return client && doctor ? { ...a, client, doctor } : null;
}

function baseVars(appt, settings) {
  const photo = doctorPhotoUrl(appt.doctor);
  const reschedule = appt.rescheduleToken ? rescheduleLinkUrl(appt.rescheduleToken) : '';
  return {
    clientName: appt.client.name.split(' ')[0] || appt.client.name,
    doctorName: appt.doctor.name,
    doctorSpecialty: appt.doctor.specialty,
    doctorPhotoUrl: photo ? appUrl(photo) : '',
    appointmentDate: formatDateLong(appt.startAt),
    appointmentStartTime: formatTime(appt.startAt),
    appointmentEndTime: formatTime(appt.endAt),
    timeWindow: formatRange(appt.startAt, appt.endAt),
    contactMethod: CONTACT_LABEL[appt.contactMethod],
    bookingReference: appt.bookingReference,
    appointmentId: appt.appointmentNo,
    rescheduleLink: reschedule,
    cancelLink: settings.allowClientCancel ? reschedule : '',
    doctorPortalLink: appUrl(`/doctor/appointments/${appt.id}`),
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
  };
}

async function postWebhook(event, appt, extra = {}) {
  const url = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!url) return;
  // Minimal, non-clinical payload. Receivers fetch more via the API if needed.
  const body = JSON.stringify({
    event,
    sentAt: new Date().toISOString(),
    appointment: appt && {
      id: appt.id, appointmentNo: appt.appointmentNo, bookingReference: appt.bookingReference,
      status: appt.status, startAt: appt.startAt, endAt: appt.endAt, contactMethod: appt.contactMethod,
      doctor: { id: appt.doctor.id, name: appt.doctor.name },
      client: { name: appt.client.name, email: appt.client.email, mobile: appt.client.mobile },
      rescheduleLink: appt.rescheduleToken ? rescheduleLinkUrl(appt.rescheduleToken) : null,
    },
    ...extra,
  });
  const signature = createHmac('sha256', process.env.NOTIFICATION_WEBHOOK_SECRET || '').update(body).digest('hex');
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Justlife-Event': event, 'X-Justlife-Signature': signature },
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('[notify] webhook failed', event, err.message);
  }
}

/** Dispatch an event to all channels. Never throws — notifications must not break bookings. */
export async function notify(event, payload = {}) {
  try {
    const settings = await getSettings();
    const appt = payload.appointmentId ? await loadAppointment(payload.appointmentId) : null;
    if (!appt) return;
    const vars = baseVars(appt, settings);
    const toClient = (type, extraVars = {}) => sendTemplatedEmail({
      type, to: appt.client.email, toName: appt.client.name, vars: { ...vars, ...extraVars }, appointmentId: appt.id, settings,
    });
    const toDoctor = () => settings.notifyDoctorOnAssignment && sendTemplatedEmail({
      type: 'DOCTOR_ASSIGNED', to: appt.doctor.email, toName: appt.doctor.name, vars, appointmentId: appt.id, settings,
    });

    switch (event) {
      case 'BOOKING_CREATED':
        await Promise.all([toClient('BOOKING_CONFIRMED'), toDoctor(), postWebhook(event, appt)]);
        break;
      case 'BOOKING_RESCHEDULED': {
        const prev = payload.previousAppointmentId ? await loadAppointment(payload.previousAppointmentId) : null;
        await Promise.all([
          toClient('BOOKING_RESCHEDULED', prev ? {
            previousDoctorName: prev.doctor.name,
            previousAppointmentDate: formatDateLong(prev.startAt),
            previousTimeWindow: formatRange(prev.startAt, prev.endAt),
          } : {}),
          toDoctor(),
          postWebhook(event, appt, { previousAppointmentId: payload.previousAppointmentId }),
        ]);
        break;
      }
      case 'BOOKING_CANCELLED':
        await Promise.all([toClient('BOOKING_CANCELLED'), postWebhook(event, appt)]);
        break;
      case 'APPOINTMENT_REMINDER':
        await Promise.all([toClient('APPOINTMENT_REMINDER', { reminderHours: payload.hours }), postWebhook(event, appt, { hours: payload.hours })]);
        break;
      default:
        await postWebhook(event, appt, payload);
    }
  } catch (err) {
    console.error('[notify] failed', event, err);
  }
}
