// Server-component guards (defence in depth on top of middleware.js).
import 'server-only';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api';

export async function requireAdminPage() {
  try { return await requireUser(['ADMIN']); } catch { redirect('/login'); }
}

export async function requireDoctorPage() {
  try { return await requireUser(['DOCTOR']); } catch { redirect('/doctor/login'); }
}
