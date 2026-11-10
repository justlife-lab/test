// GET /api/admin/users — admin accounts (created automatically on first Google login)
import { handler } from '@/lib/api';
import { db, sortBy } from '@/lib/db';

export const GET = handler(async () => sortBy((await db.all('users')).filter((u) => u.role === 'ADMIN'), ['lastLogin', 'desc'])
  .map(({ id, name, email, status, lastLogin, createdAt }) => ({ id, name, email, status, lastLogin, createdAt })), { roles: ['ADMIN'] });
