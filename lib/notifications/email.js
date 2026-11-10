// Email delivery with a persistent log ("EmailLog" tab, Admin → Email log) and retries.
// The log row is written once, AFTER the send attempt, so each email costs one
// sheet write instead of two (Google Sheets quota is ~60 writes/minute).
import 'server-only';
import { db } from '@/lib/db';
import { getEmailProvider } from './providers';
import {
  DEFAULT_TEMPLATES, renderTemplate, renderSubject, wrapEmail, htmlToText,
} from './templates';

export async function getTemplate(type) {
  const row = (await db.all('emailTemplates')).find((t) => t.type === type);
  const def = DEFAULT_TEMPLATES[type];
  return {
    type,
    subject: row?.subject ?? def.subject,
    body: row?.body ?? def.body,
    enabled: row ? row.enabled !== false : true,
    customized: Boolean(row),
  };
}

/** Renders a template type and sends it, logging the outcome. Never throws. */
export async function sendTemplatedEmail({ type, to, toName, vars, appointmentId, settings }) {
  try {
    const tpl = await getTemplate(type);
    if (!tpl.enabled) return null;
    const html = wrapEmail(renderTemplate(tpl.body, vars), settings);
    const subject = renderSubject(tpl.subject, vars);
    const msg = { type, recipient: to, recipientName: toName ?? null, subject, html, text: htmlToText(renderTemplate(tpl.body, vars)), appointmentId: appointmentId ?? null };
    return db.insert('emailLogs', { ...msg, ...(await attempt(msg)), attempts: 1 });
  } catch (err) {
    console.error('[email] render/send failed', type, err);
    return null;
  }
}

/** Tries to send; returns the status fields to store. */
async function attempt(msg) {
  const provider = getEmailProvider();
  if (!provider) {
    return { status: 'FAILED', error: 'No email provider configured. Set EMAIL_PROVIDER (resend | smtp) in environment variables.' };
  }
  try {
    const { id } = await provider.send({ to: msg.recipient, toName: msg.recipientName, subject: msg.subject, html: msg.html, text: msg.text });
    return { status: 'SENT', provider: provider.name, providerMessageId: id ?? null, error: null, sentAt: new Date() };
  } catch (err) {
    return { status: 'FAILED', provider: provider.name, error: String(err?.message || err).slice(0, 1000) };
  }
}

export async function retryEmail(id) {
  const log = await db.get('emailLogs', id, { fresh: true });
  if (!log) return null;
  return db.update('emailLogs', id, { ...(await attempt(log)), attempts: (log.attempts || 0) + 1 });
}
