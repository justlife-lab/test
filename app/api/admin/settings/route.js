// GET /api/admin/settings · PUT /api/admin/settings { ...partial settings }
import { handler, readJson } from '@/lib/api';
import { getSettings, saveSettings, SETTING_DEFAULTS } from '@/lib/settings';
import { audit, actorFromSession } from '@/lib/audit';
import { badRequest } from '@/lib/errors';

export const GET = handler(async () => ({ settings: await getSettings({ fresh: true }), defaults: SETTING_DEFAULTS }), { roles: ['ADMIN'] });

export const PUT = handler(async ({ req, user }) => {
  const before = await getSettings({ fresh: true });
  const patch = await readJson(req);
  const res = await saveSettings(patch, user.email);
  if (!res.ok) throw badRequest(`Invalid value for: ${res.errors.join(', ')}`);
  await audit(actorFromSession({ user }), 'SETTINGS_UPDATED', {
    entityType: 'settings', oldValue: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), newValue: patch,
  });
  return { settings: res.settings };
}, { roles: ['ADMIN'] });
