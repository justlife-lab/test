// Cryptographically secure identifiers. Server-only.
import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';
import CONFIG from '@/config/config';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no look-alikes

/** Unguessable URL token (default 12 chars ≈ 69 bits of entropy). */
export function secureToken(length = CONFIG.TOKEN_LENGTH) {
  const bytes = randomBytes(length * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    // rejection sampling keeps the distribution uniform
    if (bytes[i] < 256 - (256 % ALPHABET.length)) out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out.length === length ? out : secureToken(length);
}

/** Client-facing appointment number, e.g. JLTC-102938. */
export function appointmentNumber() {
  return `${CONFIG.APPOINTMENT_PREFIX}${randomInt(100000, 1000000)}`;
}
