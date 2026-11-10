// SMTP (Google Workspace, SES, SendGrid, Mailgun…) via nodemailer.
// Needs SMTP_URL (e.g. smtps://user:pass@smtp.gmail.com:465) and EMAIL_FROM.
import nodemailer from 'nodemailer';

let transport;
export default {
  name: 'smtp',
  async send({ to, toName, subject, html, text }) {
    transport ??= nodemailer.createTransport(process.env.SMTP_URL);
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: toName ? { name: toName, address: to } : to,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      subject, html, text,
    });
    return { id: info.messageId };
  },
};
