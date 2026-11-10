// Admin area — server-side guard (in addition to middleware.js).
import { requireAdminPage } from '@/lib/session';
import AdminShell from '@/components/admin/Sidebar';

export const metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const user = await requireAdminPage();
  return <AdminShell user={{ name: user.name, email: user.email }}>{children}</AdminShell>;
}
