// Email provider registry. Select with EMAIL_PROVIDER = resend | smtp | console.
// Add a new provider by exporting { name, send({to, toName, subject, html, text}) → {id} }.
import 'server-only';
import resend from './resend';
import smtp from './smtp';
import consoleProvider from './console';

const PROVIDERS = { resend, smtp, console: consoleProvider };

export function getEmailProvider() {
  const name = (process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? '' : 'console')).toLowerCase();
  return PROVIDERS[name] ?? null;
}
