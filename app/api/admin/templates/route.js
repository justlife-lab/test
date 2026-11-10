// GET    /api/admin/templates — all email templates (custom or default) + variables
// PUT    /api/admin/templates { type, subject, body, enabled }
// DELETE /api/admin/templates?type=… — reset to default
// POST   /api/admin/templates { type, subject, body, preview: true } — render preview with sample data
import { z } from 'zod';
import { handler, readJson, searchParams } from '@/lib/api';
import { db } from '@/lib/db';
import { getTemplate } from '@/lib/notifications/email';
import { TEMPLATE_TYPES, TEMPLATE_VARIABLES, DEFAULT_TEMPLATES, renderTemplate, renderSubject, wrapEmail } from '@/lib/notifications/templates';
import { getSettings } from '@/lib/settings';
import { audit, actorFromSession } from '@/lib/audit';
import { appUrl } from '@/lib/url';
import { badRequest } from '@/lib/errors';

const types = Object.keys(TEMPLATE_TYPES);

export const GET = handler(async () => ({
  templates: await Promise.all(types.map(async (t) => ({ ...(await getTemplate(t)), label: TEMPLATE_TYPES[t], default: DEFAULT_TEMPLATES[t] }))),
  variables: TEMPLATE_VARIABLES,
}), { roles: ['ADMIN'] });

const body = z.object({
  type: z.enum(types),
  subject: z.string().trim().min(3).max(200),
  body: z.string().min(10).max(20000),
  enabled: z.boolean().default(true),
  preview: z.boolean().optional(),
});

export const POST = handler(async ({ req }) => {
  const input = body.parse(await readJson(req));
  const settings = await getSettings();
  const sample = {
    clientName: 'Ahmed', doctorName: 'Dr. Sarah Ahmed', doctorSpecialty: 'General Practitioner', doctorPhotoUrl: '',
    appointmentDate: '10 November 2026', appointmentStartTime: '10:00 AM', appointmentEndTime: '11:00 AM', timeWindow: '10:00 AM – 11:00 AM',
    contactMethod: 'WhatsApp', bookingReference: 'JL-239812', appointmentId: 'JLTC-102938',
    rescheduleLink: appUrl('/reschedule/SAMPLE'), cancelLink: settings.allowClientCancel ? appUrl('/reschedule/SAMPLE') : '',
    previousDoctorName: 'Dr. Ahmed Khan', previousAppointmentDate: '9 November 2026', previousTimeWindow: '02:00 PM – 03:00 PM',
    reminderHours: 24, doctorPortalLink: appUrl('/doctor'), supportEmail: settings.supportEmail, supportPhone: settings.supportPhone,
  };
  return { subject: renderSubject(input.subject, sample), html: wrapEmail(renderTemplate(input.body, sample), settings) };
}, { roles: ['ADMIN'] });

export const PUT = handler(async ({ req, user }) => {
  const input = body.parse(await readJson(req));
  const values = { type: input.type, subject: input.subject, body: input.body, enabled: input.enabled, updatedBy: user.email };
  await db.upsert('emailTemplates', (t) => t.type === input.type, values);
  await audit(actorFromSession({ user }), 'EMAIL_TEMPLATE_UPDATED', { entityType: 'emailTemplate', entityId: input.type, newValue: { subject: input.subject, enabled: input.enabled } });
  return getTemplate(input.type);
}, { roles: ['ADMIN'] });

export const DELETE = handler(async ({ req, user }) => {
  const type = searchParams(req).get('type');
  if (!types.includes(type)) throw badRequest('Unknown template type.');
  const ids = (await db.all('emailTemplates', { fresh: true })).filter((t) => t.type === type).map((t) => t.id);
  await db.removeMany('emailTemplates', ids);
  await audit(actorFromSession({ user }), 'EMAIL_TEMPLATE_RESET', { entityType: 'emailTemplate', entityId: type });
  return getTemplate(type);
}, { roles: ['ADMIN'] });
