// POST   /api/admin/bookings/:id/documents (multipart "file") — CX uploads lab results
// DELETE /api/admin/bookings/:id/documents?documentId=…
import { handler, searchParams } from '@/lib/api';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { putFile, deleteFile, sniffMime, isAllowedUpload, safeFileName } from '@/lib/storage';
import { audit, actorFromSession } from '@/lib/audit';
import { AppError, MESSAGES, notFound } from '@/lib/errors';

export const POST = handler(async ({ req, params, user }) => {
  const settings = await getSettings();
  const appt = await db.get('appointments', params.id);
  if (!appt) throw notFound('Appointment not found.');
  const file = (await req.formData()).get('file');
  if (!file || typeof file === 'string' || file.size === 0 || file.size > settings.maxUploadMb * 1024 * 1024) {
    throw new AppError('UPLOAD_FAILED', MESSAGES.UPLOAD_FAILED, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  const name = safeFileName(file.name);
  if (!mime || !isAllowedUpload(name, mime)) throw new AppError('UPLOAD_FAILED', MESSAGES.UPLOAD_FAILED, 400);
  const stored = await putFile(buf, mime);
  const doc = await db.insert('documents', {
    appointmentId: appt.id, clientId: appt.clientId, fileName: name, fileType: mime, size: buf.length, fileId: stored.id, uploadedBy: user.email,
  });
  await audit(actorFromSession({ user }), 'DOCUMENT_UPLOADED', { appointmentId: appt.id, entityType: 'document', entityId: doc.id, summary: name });
  return { id: doc.id, fileName: doc.fileName, fileType: doc.fileType, size: doc.size };
}, { roles: ['ADMIN'] });

export const DELETE = handler(async ({ req, params, user }) => {
  const documentId = searchParams(req).get('documentId') || '';
  const doc = await db.get('documents', documentId, { fresh: true });
  if (!doc || doc.appointmentId !== params.id) throw notFound();
  await deleteFile(doc.fileId);
  await audit(actorFromSession({ user }), 'DOCUMENT_DELETED', { appointmentId: params.id, entityType: 'document', entityId: doc.id, summary: doc.fileName });
  return { ok: true };
}, { roles: ['ADMIN'] });
