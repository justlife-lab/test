// =============================================================================
// Email templates
//
// Admins can override subject/body per type in Admin → Settings → Email
// templates (stored in `email_templates`). These are the built-in defaults.
//
// Syntax
//   {{variable}}                 — replaced with the HTML-escaped value
//   {{#if variable}} … {{/if}}   — section shown only when variable is truthy
//
// Available variables are listed in TEMPLATE_VARIABLES.
// =============================================================================
import CONFIG from '@/config/config';

export const TEMPLATE_TYPES = {
  BOOKING_CONFIRMED: 'Booking confirmed (client)',
  BOOKING_RESCHEDULED: 'Appointment rescheduled (client)',
  BOOKING_CANCELLED: 'Appointment cancelled (client)',
  APPOINTMENT_REMINDER: 'Appointment reminder (client)',
  DOCTOR_ASSIGNED: 'New appointment assigned (doctor)',
};

export const TEMPLATE_VARIABLES = [
  'clientName', 'doctorName', 'doctorSpecialty', 'doctorPhotoUrl',
  'appointmentDate', 'appointmentStartTime', 'appointmentEndTime', 'timeWindow',
  'contactMethod', 'bookingReference', 'appointmentId', 'rescheduleLink', 'cancelLink',
  'previousDoctorName', 'previousAppointmentDate', 'previousTimeWindow',
  'reminderHours', 'doctorPortalLink', 'supportEmail', 'supportPhone',
];

const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:${CONFIG.PRIMARY_COLOR};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${label}</a>`;

const detailsTable = `
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e3eef3;border-radius:12px;margin:18px 0;border-collapse:separate">
  <tr><td style="padding:16px 18px">
    {{#if doctorPhotoUrl}}<img src="{{doctorPhotoUrl}}" width="56" height="56" alt="" style="border-radius:50%;float:right;margin-left:12px">{{/if}}
    <div style="color:#5b6b75;font-size:13px">Doctor</div>
    <div style="font-weight:600;font-size:16px;margin-bottom:10px">{{doctorName}} <span style="color:#5b6b75;font-weight:400;font-size:13px">· {{doctorSpecialty}}</span></div>
    <div style="color:#5b6b75;font-size:13px">Date</div>
    <div style="font-weight:600;margin-bottom:10px">{{appointmentDate}}</div>
    <div style="color:#5b6b75;font-size:13px">Time window (UAE time)</div>
    <div style="font-weight:600;margin-bottom:10px">{{appointmentStartTime}} – {{appointmentEndTime}}</div>
    <div style="color:#5b6b75;font-size:13px">Contact method</div>
    <div style="font-weight:600;margin-bottom:10px">{{contactMethod}}</div>
    <div style="color:#5b6b75;font-size:13px">Justlife Booking Reference</div>
    <div style="font-weight:600;margin-bottom:10px">{{bookingReference}}</div>
    <div style="color:#5b6b75;font-size:13px">Teleconsultation ID</div>
    <div style="font-weight:600">{{appointmentId}}</div>
  </td></tr>
</table>`;

export const DEFAULT_TEMPLATES = {
  BOOKING_CONFIRMED: {
    subject: 'Your Justlife Teleconsultation is Confirmed',
    body: `<p>Hello {{clientName}},</p>
<p>Your Justlife teleconsultation has been successfully booked.</p>
${detailsTable}
<p><strong>Your doctor will contact you during the selected 1-hour time window.</strong> Please keep your phone available during your consultation window.</p>
<h3 style="margin:24px 0 8px;font-size:16px">Need to change your appointment?</h3>
<p>${btn('{{rescheduleLink}}', 'Reschedule Appointment')}</p>
<p style="color:#5b6b75;font-size:13px">If you need to change the appointment, click the reschedule link above and select another available doctor, date or time.{{#if cancelLink}} You can also cancel your appointment from the same page.{{/if}}</p>
<p>Regards,<br>Justlife Healthcare Team</p>`,
  },
  BOOKING_RESCHEDULED: {
    subject: 'Your Justlife Teleconsultation has been Rescheduled',
    body: `<p>Hello {{clientName}},</p>
<p><strong>Your previous appointment has been rescheduled.</strong></p>
{{#if previousAppointmentDate}}<p style="color:#5b6b75;font-size:13px">Previous: {{previousDoctorName}} · {{previousAppointmentDate}} · {{previousTimeWindow}}</p>{{/if}}
<p>Here are your new appointment details:</p>
${detailsTable}
<p><strong>Your doctor will contact you during the selected 1-hour time window.</strong> Please keep your phone available.</p>
<p>${btn('{{rescheduleLink}}', 'Manage Appointment')}</p>
<p>Regards,<br>Justlife Healthcare Team</p>`,
  },
  BOOKING_CANCELLED: {
    subject: 'Your Justlife Teleconsultation has been Cancelled',
    body: `<p>Hello {{clientName}},</p>
<p>Your teleconsultation with {{doctorName}} on <strong>{{appointmentDate}}</strong> ({{timeWindow}}) has been cancelled.</p>
<p>Justlife Booking Reference: <strong>{{bookingReference}}</strong></p>
<p>If you would like to book a new consultation, please contact us at {{supportEmail}} or {{supportPhone}}.</p>
<p>Regards,<br>Justlife Healthcare Team</p>`,
  },
  APPOINTMENT_REMINDER: {
    subject: 'Reminder: your Justlife teleconsultation on {{appointmentDate}}',
    body: `<p>Hello {{clientName}},</p>
<p>Your Justlife teleconsultation is scheduled.</p>
${detailsTable}
<p>Your doctor will contact you by <strong>{{contactMethod}}</strong> during the time window above. Please keep your phone available.</p>
<p>${btn('{{rescheduleLink}}', 'Need to reschedule?')}</p>
<p>Regards,<br>Justlife Healthcare Team</p>`,
  },
  DOCTOR_ASSIGNED: {
    subject: 'New teleconsultation: {{appointmentDate}}, {{timeWindow}}',
    body: `<p>Hello {{doctorName}},</p>
<p>A teleconsultation has been assigned to you.</p>
<p><strong>{{appointmentDate}}</strong><br>{{timeWindow}} (UAE time)<br>Contact by: {{contactMethod}}<br>Teleconsultation ID: {{appointmentId}}</p>
<p>${btn('{{doctorPortalLink}}', 'Open Doctor Portal')}</p>
<p style="color:#5b6b75;font-size:13px">Client details and lab results are available in the doctor portal only.</p>`,
  },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Replace {{vars}} and {{#if var}}…{{/if}} blocks. Values are HTML-escaped. */
export function renderTemplate(tpl, vars) {
  const withBlocks = tpl.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => (vars[key] ? inner : ''));
  return withBlocks.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (key in vars ? esc(vars[key]) : ''));
}

/** Plain-text subject rendering (no escaping needed). */
export function renderSubject(tpl, vars) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

/** Branded wrapper with inline styles (email clients ignore <style>). */
export function wrapEmail(innerHtml, { supportEmail, supportPhone }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f8fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#10222c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3eef3">
<tr><td style="background:${CONFIG.PRIMARY_COLOR};padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">${CONFIG.BRAND_NAME}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${innerHtml}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e3eef3;color:#5b6b75;font-size:12px">Questions? Contact ${esc(supportEmail)} · ${esc(supportPhone)}<br>This email was sent by ${CONFIG.BRAND_NAME}. All times are UAE time (GST, UTC+4).</td></tr>
</table></td></tr></table></body></html>`;
}

export function htmlToText(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2: $1')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
