// Shared input validation (zod). Used by API routes; safe for the browser too.
import { z } from 'zod';
import CONFIG from '@/config/config';
import { isDateKey } from '@/lib/time';

/** Normalises UAE-style input to E.164: "050 123 4567" → "+971501234567". */
export function normalizeMobile(raw) {
  let s = String(raw || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  const cc = CONFIG.DEFAULT_COUNTRY_CODE.replace('+', '');
  if (/^0\d{8,9}$/.test(s)) s = `+${cc}${s.slice(1)}`;
  else if (/^5\d{8}$/.test(s)) s = `+${cc}${s}`;
  else if (/^\d{10,15}$/.test(s)) s = `+${s}`;
  return s;
}

export const isValidMobile = (s) => /^\+[1-9]\d{7,14}$/.test(normalizeMobile(s));
export const isValidEmail = (s) => z.string().email().safeParse(String(s || '').trim()).success;
export const BOOKING_REF_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/.]{2,39}$/;

export const mobileSchema = z.string().trim().transform(normalizeMobile)
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), 'Please enter a valid mobile number, e.g. +971 50 123 4567');
export const emailSchema = z.string().trim().toLowerCase().max(200).email('Please enter a valid email address');
export const nameSchema = z.string().trim().min(2, 'Please enter the full name').max(100);
export const bookingRefSchema = z.string().trim().regex(BOOKING_REF_RE, 'Please enter a valid Justlife booking reference');
export const contactSchema = z.enum(['PHONE', 'WHATSAPP'], { message: 'Please choose how the doctor should contact you' });
export const isoDateTime = z.string().datetime({ offset: true }).transform((v) => new Date(v));
export const dateKeySchema = z.string().refine(isDateKey, 'Invalid date');
const optional = (s) => s.optional().nullable().or(z.literal('').transform(() => null));

export const clientInfoSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  mobile: mobileSchema,
  bookingReference: bookingRefSchema,
  dateOfBirth: optional(dateKeySchema),
  gender: optional(z.enum(['Male', 'Female', 'Other', 'Prefer not to say'])),
  notes: optional(z.string().trim().max(1000)),
});

export const publicBookingSchema = clientInfoSchema.extend({
  doctorId: z.string().min(1).max(64),
  startAt: isoDateTime,
  contactMethod: contactSchema,
  uploadSession: optional(z.string().max(64)),
  documentIds: z.array(z.string().max(64)).max(20).optional().default([]),
});

export const doctorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  mobile: optional(mobileSchema),
  phoneNumber: optional(mobileSchema),
  whatsappNumber: optional(mobileSchema),
  specialty: z.string().trim().min(2).max(100),
  languages: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  experienceYears: z.coerce.number().int().min(0).max(70).default(0),
  bio: optional(z.string().trim().max(2000)),
  consultationType: z.string().trim().max(60).default('Teleconsultation'),
  consultationMinutes: z.coerce.number().int().refine((v) => [15, 20, 30, 45, 60, 90, 120].includes(v), 'Choose a standard duration').default(60),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const upsellSchema = z.object({
  service: z.string().trim().min(2).max(100),
  recommendedAmount: z.coerce.number().min(0).max(1_000_000).default(0),
  bookedAmount: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  status: z.enum(['RECOMMENDED', 'INTERESTED', 'BOOKED', 'COMPLETED', 'NOT_INTERESTED']).default('RECOMMENDED'),
  bookingReference: optional(z.string().trim().max(60)),
});

export const notesSchema = z.object({
  mainIssue: optional(z.string().trim().max(5000)),
  assessment: optional(z.string().trim().max(5000)),
  recommendation: optional(z.string().trim().max(5000)),
  furtherTests: optional(z.string().trim().max(5000)),
  prescriptionNotes: optional(z.string().trim().max(5000)),
  ivRecommendation: optional(z.string().trim().max(5000)),
  followUp: optional(z.string().trim().max(1000)),
  followUpAt: optional(isoDateTime),
  additionalNotes: optional(z.string().trim().max(5000)),
});
