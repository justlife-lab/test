// Doctor admin helpers: schedule validation & loading.
import 'server-only';
import { z } from 'zod';
import { db, sortBy } from '@/lib/db';
import { adminDoctor } from '@/lib/serializers';
import { isClock, minutesOf, dateKey } from '@/lib/time';

export const scheduleSchema = z.object({
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(7),
  periods: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().refine(isClock, 'Use HH:MM'),
    endTime: z.string().refine(isClock, 'Use HH:MM'),
  })).max(70),
}).superRefine((v, ctx) => {
  for (let d = 0; d < 7; d++) {
    const ps = v.periods.filter((p) => p.dayOfWeek === d).map((p) => [minutesOf(p.startTime), minutesOf(p.endTime)]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < ps.length; i++) {
      if (ps[i][1] <= ps[i][0]) ctx.addIssue({ code: 'custom', message: 'Each working period must end after it starts.' });
      if (i && ps[i][0] < ps[i - 1][1]) ctx.addIssue({ code: 'custom', message: 'Working periods on the same day must not overlap.' });
    }
  }
});

export async function loadDoctorAdmin(id, { fresh = false } = {}) {
  const t = await db.tables(['doctors', 'doctorSchedules', 'doctorLeaves', 'blockedSlots', 'users'], { fresh });
  const d = t.doctors.find((x) => x.id === id);
  if (!d) return null;
  const since = dateKey(new Date(Date.now() - 30 * 86_400_000));
  const now = new Date();
  const login = t.users.find((u) => u.doctorId === id && u.role === 'DOCTOR');
  return {
    ...adminDoctor(d),
    schedules: sortBy(t.doctorSchedules.filter((s) => s.doctorId === id), 'dayOfWeek', 'startTime')
      .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })),
    leaves: sortBy(t.doctorLeaves.filter((l) => l.doctorId === id && l.date >= since), 'date'),
    blockedSlots: sortBy(t.blockedSlots.filter((b) => b.doctorId === id && b.endAt >= now), 'startAt'),
    login: login ? { id: login.id, status: login.status, lastLogin: login.lastLogin, email: login.email } : null,
  };
}

export const DEFAULT_WEEK = [1, 2, 3, 4].map((d) => ({ dayOfWeek: d, startTime: '09:00', endTime: '17:00' }))
  .concat([{ dayOfWeek: 5, startTime: '09:00', endTime: '14:00' }]);
