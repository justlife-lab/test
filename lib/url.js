// Absolute app URL — never hard-coded. Set APP_URL (or NEXTAUTH_URL) in Vercel.
export function appUrl(path = '') {
  const base = process.env.APP_URL
    || process.env.NEXTAUTH_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`)
    || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}

export const bookingLinkUrl = (token) => appUrl(`/book/${token}`);
export const rescheduleLinkUrl = (token) => appUrl(`/reschedule/${token}`);
export const doctorPhotoUrl = (doctor) => (doctor?.photoFileId ? `/api/public/doctor-photo/${doctor.id}?v=${doctor.photoVersion}` : null);
