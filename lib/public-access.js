// Resolves a public token (booking link or reschedule link) to an access
// context. Clients never authenticate — the unguessable token IS the access.
import 'server-only';
import { db } from '@/lib/db';
import { getUsableLink, selfServiceEligibility } from '@/lib/booking';
import { AppError, MESSAGES } from '@/lib/errors';

export async function resolvePublicAccess(kind, token, settings) {
  if (kind === 'reschedule') {
    if (!token || token.length > 64) throw new AppError('RESCHEDULE_INVALID', MESSAGES.RESCHEDULE_INVALID, 404);
    const appt = (await db.all('appointments')).find((a) => a.rescheduleToken === token);
    if (!appt) throw new AppError('RESCHEDULE_INVALID', MESSAGES.RESCHEDULE_INVALID, 404);
    const elig = selfServiceEligibility(appt, settings);
    if (!elig.ok || !elig.canReschedule) throw new AppError('RESCHEDULE_CLOSED', elig.reason || MESSAGES.RESCHEDULE_CLOSED, 409);
    return { kind, appointment: appt };
  }
  const link = await getUsableLink(token);
  return { kind: 'link', link };
}
