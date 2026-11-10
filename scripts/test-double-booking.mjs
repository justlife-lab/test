// =============================================================================
// Double-booking stress test — run against a TEST/STAGING deployment.
//
//   BASE_URL=https://staging.example.com TOKEN=<booking-link-token> npm run test:double-booking
//
// Fires N simultaneous bookings (default 20) for the SAME doctor + slot as if
// N different clients clicked at once. Expected: exactly 1 succeeds; all others
// get HTTP 409 "Sorry, this time slot has just been booked by another client…".
// Use a link that is NOT single-use. Creates one real booking — cancel it after.
// =============================================================================
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.TOKEN || process.argv[2];
const N = Number(process.env.CONCURRENCY || 20);
if (!TOKEN) { console.error('Usage: BASE_URL=… TOKEN=<booking link token> node scripts/test-double-booking.mjs'); process.exit(1); }

const avail = await fetch(`${BASE}/api/public/availability?kind=link&t=${TOKEN}`).then((r) => r.json());
const doctor = avail.doctors?.find((d) => Object.keys(d.days).length);
if (!doctor) { console.error('No available slots found for this link.', avail); process.exit(1); }
const day = Object.keys(doctor.days).sort()[0];
const slot = doctor.days[day][0];
console.log(`Target: ${doctor.name} · ${slot.startAt} — ${N} simultaneous clients`);

const attempts = Array.from({ length: N }, (_, i) => fetch(`${BASE}/api/public/bookings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.0.${i + 1}` },
  body: JSON.stringify({
    token: TOKEN, name: `Load Test ${i + 1}`, email: `loadtest${i + 1}@example.com`, mobile: `+97150${String(1000000 + i).padStart(7, '0')}`,
    bookingReference: `JL-TEST-${i + 1}`, contactMethod: 'PHONE', doctorId: doctor.id, startAt: slot.startAt,
  }),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })));

const results = await Promise.all(attempts);
const ok = results.filter((r) => r.status === 200);
const conflicts = results.filter((r) => r.status === 409);
const other = results.filter((r) => r.status !== 200 && r.status !== 409);
console.log(`✓ booked: ${ok.length}   ✗ rejected (409): ${conflicts.length}   other: ${other.length}`);
if (ok[0]) console.log(`  Winner: ${ok[0].body.appointmentNo}`);
if (conflicts[0]) console.log(`  Rejection message: "${conflicts[0].body.error}"`);
if (other.length) console.log('  Other responses:', other.map((r) => `${r.status} ${r.body.error}`));

const after = await fetch(`${BASE}/api/public/availability?kind=link&t=${TOKEN}`).then((r) => r.json());
const stillShown = (after.doctors.find((d) => d.id === doctor.id)?.days[day] || []).some((s) => s.startAt === slot.startAt);
console.log(stillShown ? '✗ Slot is STILL shown to clients' : '✓ Slot no longer shown to clients');

const pass = ok.length === 1 && conflicts.length === N - 1 && !stillShown;
console.log(pass ? '\nPASS — double booking prevented.' : '\nFAIL');
process.exit(pass ? 0 : 1);
