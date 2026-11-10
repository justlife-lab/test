// =============================================================================
// Analytics — KPIs for the admin dashboard, reports and doctor performance.
//
// Period filter applies to the APPOINTMENT TIME (startAt, Dubai dates).
//
// Definitions
//   Total bookings     appointments in period, excluding superseded
//                      RESCHEDULED versions (each live booking counted once)
//   Rescheduled        appointment versions that were moved (status RESCHEDULED)
//   Completion %       completed ÷ total bookings
//   On-time call       call started ≤ tolerance minutes after window start
//   Upsell conversion  booked upsells ÷ upsell opportunities   (BOOKED|COMPLETED)
//   Upsell GMV         Σ bookedAmount (or recommendedAmount if blank) of booked upsells
//   Client conversion  completed consultations with ≥1 booked upsell ÷ completed
//   Utilization        booked hours ÷ available working hours
// =============================================================================
import 'server-only';
import { db, groupBy } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { loadAvailabilityData, workingMinutesInRange, ACTIVE_STATUSES, AVAILABILITY_TABLES } from '@/lib/availability';
import { dateKey, eachDay, diffDays, toUtc, addDays } from '@/lib/time';

const BOOKED_UPSELL = ['BOOKED', 'COMPLETED'];
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const round1 = (n) => Math.round(n * 10) / 10;
const money = (u) => Number(u.bookedAmount ?? u.recommendedAmount ?? 0);

function emptyStats(doctor) {
  return {
    doctorId: doctor.id, doctorName: doctor.name, status: doctor.status,
    total: 0, scheduled: 0, completed: 0, cancelled: 0, noShow: 0, rescheduled: 0,
    calls: 0, onTimeCalls: 0, lateCalls: 0, delaySum: 0, durationSum: 0, durationCount: 0,
    upsellOpportunities: 0, upsellsBooked: 0, upsellGmv: 0, consultsWithUpsell: 0,
    bookedMinutes: 0, workingMinutes: 0,
  };
}

function finalize(s) {
  return {
    ...s,
    completionPct: pct(s.completed, s.total),
    onTimePct: pct(s.onTimeCalls, s.calls),
    avgDelayMinutes: s.calls ? round1(s.delaySum / s.calls) : null,
    avgCallMinutes: s.durationCount ? round1(s.durationSum / s.durationCount) : null,
    upsellConversionPct: pct(s.upsellsBooked, s.upsellOpportunities),
    avgUpsellValue: s.upsellsBooked ? Math.round(s.upsellGmv / s.upsellsBooked) : null,
    clientConversionPct: pct(s.consultsWithUpsell, s.completed),
    bookedHours: round1(s.bookedMinutes / 60),
    workingHours: round1(s.workingMinutes / 60),
    utilizationPct: pct(s.bookedMinutes, s.workingMinutes),
    cancellationPct: pct(s.cancelled, s.total),
    noShowPct: pct(s.noShow, s.total),
  };
}

export async function computeAnalytics({ period, doctorId }) {
  const settings = await getSettings();
  const tol = settings.onTimeToleranceMinutes;
  const { fromKey, toKey, start, end } = period;

  const data = await db.tables([...AVAILABILITY_TABLES, 'upsells']);
  const ups = groupBy(data.upsells, 'appointmentId');
  const rows = data.appointments
    .filter((a) => a.startAt >= start && a.startAt < end && (!doctorId || a.doctorId === doctorId))
    .map((a) => ({ ...a, upsells: ups.get(a.id) || [] }));

  const { doctors, leaves } = await loadAvailabilityData({ fromKey, toKey, onlyActive: false, doctorIds: doctorId ? [doctorId] : undefined, data });
  const per = new Map(doctors.map((d) => [d.id, emptyStats(d)]));
  for (const d of doctors) {
    if (d.status === 'ACTIVE') per.get(d.id).workingMinutes = workingMinutesInRange(d, fromKey, toKey, leaves.get(d.id));
  }

  const days = diffDays(fromKey, toKey) <= 92 ? eachDay(fromKey, toKey) : [];
  const byDay = Object.fromEntries(days.map((k) => [k, { date: k, bookings: 0, completed: 0, cancelled: 0, gmv: 0 }]));
  const bySource = {};
  const byContact = { PHONE: 0, WHATSAPP: 0 };
  const clients = new Map();

  for (const a of rows) {
    const s = per.get(a.doctorId);
    if (!s) continue;
    const day = byDay[dateKey(a.startAt)];
    if (a.status === 'RESCHEDULED') { s.rescheduled++; continue; }
    s.total++;
    bySource[a.source] = (bySource[a.source] || 0) + 1;
    byContact[a.contactMethod]++;
    clients.set(a.clientId, (clients.get(a.clientId) || 0) + 1);
    if (day) day.bookings++;

    if (a.status === 'COMPLETED') { s.completed++; if (day) day.completed++; }
    else if (a.status === 'CANCELLED') { s.cancelled++; if (day) day.cancelled++; }
    else if (a.status === 'NO_SHOW') s.noShow++;
    else s.scheduled++;

    if (ACTIVE_STATUSES.includes(a.status)) s.bookedMinutes += (new Date(a.endAt) - new Date(a.startAt)) / 60_000;

    if (a.callStartedAt) {
      const delay = a.callDelayMinutes ?? Math.max(0, Math.round((new Date(a.callStartedAt) - new Date(a.startAt)) / 60_000));
      s.calls++;
      s.delaySum += delay;
      if (delay <= tol) s.onTimeCalls++; else s.lateCalls++;
      if (a.callEndedAt) {
        s.durationSum += Math.max(0, (new Date(a.callEndedAt) - new Date(a.callStartedAt)) / 60_000);
        s.durationCount++;
      }
    }

    s.upsellOpportunities += a.upsells.length;
    const booked = a.upsells.filter((u) => BOOKED_UPSELL.includes(u.status));
    s.upsellsBooked += booked.length;
    const gmv = booked.reduce((sum, u) => sum + money(u), 0);
    s.upsellGmv += gmv;
    if (day) day.gmv += gmv;
    if (a.status === 'COMPLETED' && booked.length) s.consultsWithUpsell++;
  }

  const doctorStats = [...per.values()].map(finalize);
  const totals = finalize(doctorStats.reduce((acc, s) => {
    for (const k of Object.keys(acc)) if (typeof acc[k] === 'number') acc[k] += s[k];
    return acc;
  }, emptyStats({ id: 'all', name: 'All doctors', status: 'ACTIVE' })));

  const best = (key, filter = () => true) => {
    const c = doctorStats.filter((d) => d[key] != null && filter(d)).sort((a, b) => b[key] - a[key])[0];
    return c ? { doctorId: c.doctorId, doctorName: c.doctorName, value: c[key] } : null;
  };
  const repeatClients = [...clients.values()].filter((n) => n > 1).length;

  return {
    period: { preset: period.preset, fromKey, toKey },
    toleranceMinutes: tol,
    totals: { ...totals, uniqueClients: clients.size, repeatClientPct: pct(repeatClients, clients.size) },
    doctors: doctorStats.sort((a, b) => b.total - a.total || a.doctorName.localeCompare(b.doctorName)),
    highlights: {
      topDoctor: best('completed', (d) => d.completed > 0),
      highestConversionDoctor: best('upsellConversionPct', (d) => d.upsellOpportunities > 0),
      mostUtilizedDoctor: best('utilizationPct', (d) => d.workingMinutes > 0),
    },
    series: {
      byDay: Object.values(byDay),
      bySource: Object.entries(bySource).map(([label, value]) => ({ label, value })),
      byContact: Object.entries(byContact).map(([label, value]) => ({ label, value })),
    },
  };
}

/** Live operational counters (independent of the period filter). */
export async function liveCounters(now = new Date()) {
  const dayStart = toUtc(dateKey(now));
  const dayEnd = toUtc(addDays(dateKey(now), 1));
  const rows = (await db.all('appointments')).filter((a) => ACTIVE_STATUSES.includes(a.status));
  return {
    today: rows.filter((a) => a.startAt >= dayStart && a.startAt < dayEnd).length,
    upcoming: rows.filter((a) => a.status === 'SCHEDULED' && a.startAt >= now).length,
    inCall: rows.filter((a) => a.status === 'CALLING').length,
  };
}
