// PUT /api/admin/doctors/:id/schedule — { weeklyOffDays: [0,6], periods: [{dayOfWeek, startTime, endTime}] }
// Existing bookings are kept; the response lists any that now fall outside hours
// so the admin can reschedule them.
import { handler, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { scheduleSchema, loadDoctorAdmin } from '@/lib/doctors';
import { workingPeriods, ACTIVE_STATUSES } from '@/lib/availability';
import { audit, actorFromSession } from '@/lib/audit';
import { dateKey, clockTime, minutesOf } from '@/lib/time';
import { notFound } from '@/lib/errors';

export const PUT = handler(async ({ req, params, user }) => {
  const input = scheduleSchema.parse(await readJson(req));
  const before = await loadDoctorAdmin(params.id, { fresh: true });
  if (!before) throw notFound('Doctor not found.');
  // Insert the new periods first, then remove the old ones, so availability is
  // never briefly empty for clients loading the page in between.
  const oldIds = (await db.all('doctorSchedules')).filter((s) => s.doctorId === params.id).map((s) => s.id);
  if (input.periods.length) await db.insert('doctorSchedules', input.periods.map((p) => ({ ...p, doctorId: params.id })));
  if (oldIds.length) await db.removeMany('doctorSchedules', oldIds);
  await db.update('doctors', params.id, { weeklyOffDays: input.weeklyOffDays });
  await audit(actorFromSession({ user }), 'DOCTOR_SCHEDULE_UPDATED', {
    entityType: 'doctor', entityId: params.id, summary: before.name,
    oldValue: { weeklyOffDays: before.weeklyOffDays, periods: before.schedules }, newValue: input,
  });

  // Flag future bookings that no longer fit the schedule.
  const doc = { ...before, weeklyOffDays: input.weeklyOffDays, schedules: input.periods };
  const now = new Date();
  const upcoming = (await db.all('appointments'))
    .filter((a) => a.doctorId === params.id && ACTIVE_STATUSES.includes(a.status) && a.startAt >= now);
  const conflicts = upcoming.filter((a) => {
    const s = minutesOf(clockTime(a.startAt));
    const e = s + (new Date(a.endAt) - new Date(a.startAt)) / 60_000;
    return !workingPeriods(doc, dateKey(a.startAt)).some((p) => s >= p.start && e <= p.end);
  }).map((a) => ({ id: a.id, appointmentNo: a.appointmentNo, startAt: a.startAt }));
  return { doctor: await loadDoctorAdmin(params.id), conflicts };
}, { roles: ['ADMIN'] });
