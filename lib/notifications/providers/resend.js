// Resend (https://resend.com) — needs RESEND_API_KEY and EMAIL_FROM.
// Delivery webhooks: point Resend at /api/webhooks/email?secret=EMAIL_WEBHOOK_SECRET
export default {
  name: 'resend',
  async send({ to, toName, subject, html, text }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [toName ? `${toName.replace(/[<>"]/g, '')} <${to}>` : to],
        subject, html, text,
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || `Resend error ${res.status}`);
    return { id: body.id };
  },
};
