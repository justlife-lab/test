// =============================================================================
// DEMO / TEST DATA ONLY — never run against the production sheet.
//
//   npm run sheet:seed:demo            → (re)creates demo data in the sheet
//   npm run sheet:seed:demo -- --reset → removes demo data only
//
// Uses the same sheet as the app (config/config.js ▸ GOOGLE_SHEET_URL, or env
// GOOGLE_SHEET_URL) and the same credentials (GOOGLE_SERVICE_ACCOUNT_JSON).
// Every demo record is tagged so it can be removed safely: doctors & clients
// use *@demo.justlife.test emails, links are labelled DEMO.
// Refuses to run when NODE_ENV=production or VERCEL_ENV=production unless
// --i-know-this-is-production is passed. Requires Node 22+.
// =============================================================================
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { getStore } from '../lib/sheets/index.js';

const args = new Set(process.argv.slice(2));
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
if (isProd && !args.has('--i-know-this-is-production')) {
  console.error('✗ Refusing to seed demo data in production.');
  process.exit(1);
}

const DOMAIN = 'demo.justlife.test';
const DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD || 'Demo-Doctor-2026';
const db = getStore();

// Dubai is UTC+4 with no DST.
const dubai = (key, hh, mm = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 4, mm));
};
const todayKey = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();
const token = (n = 12) => randomBytes(n * 2).toString('base64url').replace(/[-_]/g, '').slice(0, n);
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const isDemo = (email) => String(email || '').endsWith(`@${DOMAIN}`);

async function reset() {
  const t = await db.tables(['doctors', 'users', 'clients', 'appointments', 'doctorSchedules', 'doctorLeaves', 'consultationNotes', 'upsells', 'bookingLinks', 'auditLogs', 'emailLogs'], { fresh: true });
  const doctorIds = new Set(t.doctors.filter((d) => isDemo(d.email)).map((d) => d.id));
  const apptIds = new Set(t.appointments.filter((a) => doctorIds.has(a.doctorId)).map((a) => a.id));
  const del = async (table, rows) => { if (rows.length) await db.removeMany(table, rows.map((r) => r.id)); };
  await del('consultationNotes', t.consultationNotes.filter((n) => apptIds.has(n.appointmentId)));
  await del('upsells', t.upsells.filter((u) => apptIds.has(u.appointmentId)));
  await del('appointments', t.appointments.filter((a) => apptIds.has(a.id)));
  await del('doctorSchedules', t.doctorSchedules.filter((s) => doctorIds.has(s.doctorId)));
  await del('doctorLeaves', t.doctorLeaves.filter((l) => doctorIds.has(l.doctorId)));
  await del('clients', t.clients.filter((c) => isDemo(c.email)));
  await del('users', t.users.filter((u) => isDemo(u.email)));
  await del('doctors', t.doctors.filter((d) => doctorIds.has(d.id)));
  await del('bookingLinks', t.bookingLinks.filter((l) => l.label === 'DEMO'));
  await del('auditLogs', t.auditLogs.filter((l) => isDemo(l.actorEmail)));
  await del('emailLogs', t.emailLogs.filter((l) => isDemo(l.recipient)));
  console.log(`✓ Removed demo data (${doctorIds.size} doctors)`);
}

async function seedDemo() {

  const rows = { doctors: [], doctorSchedules: [], users: [], doctorLeaves: [], clients: [], appointments: [], consultationNotes: [], upsells: [] };
  const DOCTORS = [
    {
      name: 'Dr. Sarah Ahmed', email: `sarah.ahmed@${DOMAIN}`, specialty: 'General Practitioner', exp: 8, langs: ['English', 'Arabic', 'Hindi'],
      bio: 'Sarah has eight years of family and urgent-care experience in Dubai and focuses on preventive health, fatigue and common infections.',
      off: [0, 6], sched: { 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [['09:00', '14:00']] },
    },
    {
      name: 'Dr. Ahmed Khan', email: `ahmed.khan@${DOMAIN}`, specialty: 'Internal Medicine', exp: 12, langs: ['English', 'Arabic', 'Urdu'],
      bio: 'Ahmed specialises in chronic conditions — diabetes, blood pressure and cholesterol — and reviewing lab results with patients.',
      off: [5, 6], sched: Object.fromEntries([0, 1, 2, 3, 4].map((d) => [d, [['09:00', '13:00'], ['16:00', '20:00']]])),
    },
    {
      name: 'Dr. Maria Santos', email: `maria.santos@${DOMAIN}`, specialty: 'Family Medicine', exp: 6, langs: ['English', 'Tagalog'],
      bio: 'Maria looks after the whole family, from children’s fevers to women’s health and wellness check-ins.',
      off: [0], sched: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, [['10:00', '18:00']]])),
    },
    {
      name: 'Dr. Omar Haddad', email: `omar.haddad@${DOMAIN}`, specialty: 'Endocrinology', exp: 15, langs: ['Arabic', 'French', 'English'], status: 'ON_LEAVE',
      bio: 'Omar focuses on thyroid and hormonal health. (Demo: on leave — hidden from clients.)',
      off: [5, 6], sched: Object.fromEntries([0, 1, 2, 3, 4].map((d) => [d, [['08:00', '15:00']]])),
    },
  ];

  const hash = await bcrypt.hash(DOCTOR_PASSWORD, 10);
  const doctors = [];
  for (const [i, d] of DOCTORS.entries()) {
    const id = randomUUID();
    const mobile = `+97150000000${i}`;
    rows.doctors.push({
      id, name: d.name, email: d.email, mobile, phoneNumber: mobile, whatsappNumber: mobile, specialty: d.specialty,
      languages: d.langs, experienceYears: d.exp, bio: d.bio, status: d.status || 'ACTIVE', weeklyOffDays: d.off, sortOrder: i,
    });
    for (const [day, periods] of Object.entries(d.sched)) {
      for (const [s, e] of periods) rows.doctorSchedules.push({ doctorId: id, dayOfWeek: Number(day), startTime: s, endTime: e });
    }
    rows.users.push({ email: d.email, name: d.name, role: 'DOCTOR', status: 'ACTIVE', passwordHash: hash, doctorId: id });
    doctors.push({ ...d, id });
  }
  // Leave for Dr. Sarah in ~10 days
  for (const n of [9, 10, 11]) rows.doctorLeaves.push({ doctorId: doctors[0].id, date: addDays(todayKey(), n), reason: 'Annual leave (demo)' });

  // Clients
  const FIRST = ['Ahmed', 'Fatima', 'Rahul', 'Priya', 'John', 'Aisha', 'Omar', 'Leila', 'Mark', 'Sofia', 'Yusuf', 'Hana', 'David', 'Mariam', 'Arjun', 'Noura', 'James', 'Sara', 'Ali', 'Grace'];
  const LAST = ['Ali', 'Hassan', 'Sharma', 'Nair', 'Smith', 'Rahman', 'Farouk', 'Khoury', 'Taylor', 'Costa'];
  const clients = [];
  for (let i = 0; i < 24; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
    const id = randomUUID();
    const ref = `JL-${String(230000 + i * 137).padStart(6, '0')}`;
    rows.clients.push({ id, name, email: `${name.toLowerCase().replace(/\s+/g, '.')}${i}@${DOMAIN}`, mobile: `+9715${String(51000000 + i * 7919).slice(0, 8)}`, bookingReference: ref });
    clients.push({ id, ref });
  }

  // Appointments: last 30 days (history) + next 5 days (upcoming)
  let count = 0;
  const insertAppt = async (a) => {
    const id = randomUUID();
    rows.appointments.push({
      id, appointmentNo: a.no, bookingReference: a.ref, clientId: a.clientId, doctorId: a.doctorId, startAt: a.start, endAt: a.end,
      contactMethod: a.contact, status: a.status, source: a.source, rescheduleToken: a.token ?? null, rescheduleCount: 0,
      callStartedAt: a.callStart ?? null, callEndedAt: a.callEnd ?? null, callDelayMinutes: a.delay ?? null,
      callMethod: a.callStart ? a.contact : null, outcome: a.outcome ?? null,
      cancelledAt: a.status === 'CANCELLED' ? new Date(a.start.getTime() - 86400_000) : null,
      cancelReason: a.status === 'CANCELLED' ? 'Client request (demo)' : null,
      createdAt: new Date(a.start.getTime() - (2 + Math.floor(rnd() * 5)) * 86400_000),
    });
    count++;
    return id;
  };

  const active = doctors.filter((d) => !d.status);
  for (let n = -30; n <= 5; n++) {
    const key = addDays(todayKey(), n);
    for (const d of active) {
      if (d.off.includes(dow(key)) || (d === doctors[0] && n >= 9 && n <= 11)) continue;
      const hours = (d.sched[dow(key)] || []).flatMap(([s, e]) => { const out = []; for (let h = Number(s.slice(0, 2)); h + 1 <= Number(e.slice(0, 2)); h++) out.push(h); return out; });
      const used = new Set();
      const howMany = n < 0 ? 1 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3);
      for (let k = 0; k < howMany && used.size < hours.length; k++) {
        let h = pick(hours); while (used.has(h)) h = pick(hours);
        used.add(h);
        const c = pick(clients);
        const start = dubai(key, h); const end = dubai(key, h + 1);
        const contact = rnd() < 0.6 ? 'WHATSAPP' : 'PHONE';
        const no = `JLTC-${String(100000 + count * 7 + Math.floor(rnd() * 6)).slice(0, 6)}`;
        const base = { no, ref: c.ref, clientId: c.id, doctorId: d.id, start, end, contact, source: rnd() < 0.8 ? 'CLIENT_LINK' : 'ADMIN' };
        if (n >= 0 && start > new Date()) { await insertAppt({ ...base, status: 'SCHEDULED', token: token() }); continue; }
        const r = rnd();
        if (r < 0.08) { await insertAppt({ ...base, status: 'CANCELLED', token: token() }); continue; }
        if (r < 0.15) {
          await insertAppt({ ...base, status: 'NO_SHOW', callStart: new Date(start.getTime() + 3 * 60000), delay: 3, outcome: 'Client did not answer' });
          continue;
        }
        const delay = rnd() < 0.7 ? Math.floor(rnd() * 6) : 6 + Math.floor(rnd() * 15);
        const callStart = new Date(start.getTime() + delay * 60000);
        const callEnd = new Date(callStart.getTime() + (12 + Math.floor(rnd() * 20)) * 60000);
        const id = await insertAppt({ ...base, status: 'COMPLETED', callStart, callEnd, delay, outcome: 'Consultation completed' });
        rows.consultationNotes.push({
          appointmentId: id, doctorId: d.id,
          mainIssue: pick(['Persistent fatigue for 3 weeks', 'Review of recent blood test', 'Recurring headaches', 'Seasonal allergies', 'Low vitamin D follow-up']),
          assessment: 'Stable, no red-flag symptoms reported during the call (demo note).',
          recommendation: pick(['Hydration, rest and a vitamin panel', 'Repeat blood test in 4 weeks', 'Start vitamin D supplementation', 'IV hydration therapy at home']),
          furtherTests: pick(['Full blood count', 'Vitamin D & B12', 'HbA1c', null]),
        });
        if (rnd() < 0.45) {
          const svc = pick([['Lab Test', 250], ['IV Therapy', 350], ['Doctor Home Visit', 400]]);
          const status = pick(['BOOKED', 'BOOKED', 'COMPLETED', 'INTERESTED', 'NOT_INTERESTED', 'RECOMMENDED']);
          rows.upsells.push({
            appointmentId: id, service: svc[0], recommendedAmount: svc[1], status,
            bookedAmount: ['BOOKED', 'COMPLETED'].includes(status) ? svc[1] : null,
            bookingReference: ['BOOKED', 'COMPLETED'].includes(status) ? `JL-UP-${count}` : null,
          });
        }
      }
    }
  }

  // One append per tab keeps this within Google's quota.
  for (const [table, list] of Object.entries(rows)) if (list.length) await db.insert(table, list);
  const linkToken = token();
  await db.insert('bookingLinks', { token: linkToken, label: 'DEMO', singleUse: false, status: 'ACTIVE', createdByEmail: `seed@${DOMAIN}` });

  console.log(`✓ Demo data created: ${DOCTORS.length} doctors, ${rows.clients.length} clients, ${count} appointments`);
  console.log(`  Doctor portal logins: ${DOCTORS.map((d) => d.email).join(', ')}`);
  console.log(`  Doctor password: ${DOCTOR_PASSWORD}`);
  console.log(`  Demo booking link: /book/${linkToken}`);
  console.log(`DEMO_LINK_TOKEN=${linkToken}`);
}

try {
  await reset();
  if (!args.has('--reset')) await seedDemo();
} catch (err) {
  console.error('✗ Seed failed:', err.message);
  process.exitCode = 1;
}
