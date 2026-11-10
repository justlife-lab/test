// POST /api/admin/doctors/:id/photo (multipart "file") — uploads and
// automatically optimises the profile photo: square crop, 480×480, WebP (~20–40 KB).
import sharp from 'sharp';
import { handler } from '@/lib/api';
import { db } from '@/lib/db';
import { putFile, deleteFile, sniffMime } from '@/lib/storage';
import { audit, actorFromSession } from '@/lib/audit';
import { badRequest, notFound } from '@/lib/errors';
import { doctorPhotoUrl } from '@/lib/url';

export const runtime = 'nodejs';

export const POST = handler(async ({ req, params, user }) => {
  const doc = await db.get('doctors', params.id, { fresh: true });
  if (!doc) throw notFound('Doctor not found.');
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw badRequest('Please choose an image.');
  if (file.size > 4.4 * 1024 * 1024) throw badRequest('Image must be 4 MB or smaller.');
  const buf = Buffer.from(await file.arrayBuffer());
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(sniffMime(buf))) throw badRequest('Please upload a JPG, PNG or WebP image.');

  const optimized = await sharp(buf).rotate().resize(480, 480, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer();
  const stored = await putFile(optimized, 'image/webp');
  const updated = await db.update('doctors', params.id, { photoFileId: stored.id, photoVersion: (doc.photoVersion || 0) + 1 });
  if (doc.photoFileId) await deleteFile(doc.photoFileId);
  await audit(actorFromSession({ user }), 'DOCTOR_PHOTO_UPDATED', { entityType: 'doctor', entityId: params.id, summary: `${buf.length} → ${optimized.length} bytes` });
  return { photoUrl: doctorPhotoUrl(updated), originalBytes: buf.length, optimizedBytes: optimized.length };
}, { roles: ['ADMIN'] });
