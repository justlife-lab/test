// Shapes returned to browsers. Public shapes never include doctor contact
// details or any client data.
import { doctorPhotoUrl } from '@/lib/url';

export const publicDoctor = (d) => ({
  id: d.id,
  name: d.name,
  specialty: d.specialty,
  languages: d.languages,
  experienceYears: d.experienceYears,
  bio: d.bio,
  consultationType: d.consultationType,
  consultationMinutes: d.consultationMinutes,
  photoUrl: doctorPhotoUrl(d),
});

export const slotOut = (s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() });

export const adminDoctor = (d) => ({
  ...publicDoctor(d),
  email: d.email,
  mobile: d.mobile,
  phoneNumber: d.phoneNumber,
  whatsappNumber: d.whatsappNumber,
  status: d.status,
  weeklyOffDays: d.weeklyOffDays,
  sortOrder: d.sortOrder,
  createdAt: d.createdAt,
});
