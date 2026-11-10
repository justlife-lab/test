// GET /api/admin/availability?doctorId=&from=&to=&excludeAppointmentId=
// Free slots for admin booking/rescheduling. Admins can book the current
// window (if not yet ended) and up to 90 days ahead.
import { handler, searchParams } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { getAvailability } from '@/lib/availability';
import { publicDoctor, slotOut } from '@/lib/serializers';
import { isDateKey } from '@/lib/time';

export const GET = handler(async ({ req }) => {
  const sp = searchParams(req);
  const settings = await getSettings();
  const result = await getAvailability({
    settings: { ...settings, bookingHorizonDays: 90, minBookingNoticeMinutes: -55 },
    doctorIds: sp.get('doctorId') ? [sp.get('doctorId')] : undefined,
    fromKey: isDateKey(sp.get('from')) ? sp.get('from') : undefined,
    toKey: isDateKey(sp.get('to')) ? sp.get('to') : undefined,
    excludeAppointmentId: sp.get('excludeAppointmentId') || undefined,
  });
  return {
    doctors: result.map(({ doctor, days }) => ({
      ...publicDoctor(doctor),
      days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, v.map(slotOut)])),
    })),
  };
}, { roles: ['ADMIN'] });
