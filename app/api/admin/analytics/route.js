// GET /api/admin/analytics?preset=today|yesterday|thisWeek|lastWeek|thisMonth|lastMonth|custom&from=&to=&doctorId=
import { handler, searchParams } from '@/lib/api';
import { computeAnalytics, liveCounters } from '@/lib/analytics';
import { resolvePeriod } from '@/lib/time';

export const GET = handler(async ({ req }) => {
  const sp = searchParams(req);
  const period = resolvePeriod(sp.get('preset') || 'thisMonth', sp.get('from'), sp.get('to'));
  const [analytics, live] = await Promise.all([
    computeAnalytics({ period, doctorId: sp.get('doctorId') || undefined }),
    liveCounters(),
  ]);
  return { ...analytics, live };
}, { roles: ['ADMIN'] });
