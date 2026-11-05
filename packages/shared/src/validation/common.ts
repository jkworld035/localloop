import { z } from 'zod';
import { INDIA_BOUNDS } from '../constants/geo';

/**
 * Validation messages are i18n keys (see apps/mobile/translations/*.json →
 * "validation"), so the same schema produces English or Telugu errors.
 */

/** Indian mobile number: 10 digits starting 6–9, with optional +91 / 0 prefix. */
export const indianMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(?:\+91|91|0)?[6-9]\d{9}$/, 'validation.phone_invalid'))
  .transform((v) => `+91${v.slice(-10)}`);

export const otpCode = z.string().trim().regex(/^\d{6}$/, 'validation.otp_invalid');

export const deliveryOtp = z.string().trim().regex(/^\d{4}$/, 'validation.delivery_otp_invalid');

export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, 'validation.pincode_invalid');

/**
 * GSTIN: 2-digit state code, 10-char PAN, entity number, 'Z', checksum.
 * Optional everywhere — many small shops are below the GST threshold.
 */
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'validation.gstin_invalid');

export const optionalGstin = z
  .union([gstin, z.literal('')])
  .optional()
  .transform((v) => (v ? v : null));

export const email = z.string().trim().toLowerCase().email('validation.email_invalid');
export const optionalEmail = z
  .union([email, z.literal('')])
  .optional()
  .transform((v) => (v ? v : null));

export const personName = z
  .string()
  .trim()
  .min(2, 'validation.name_short')
  .max(80, 'validation.name_long');

export const latLng = z
  .object({
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
  })
  .refine(
    (p) =>
      p.latitude >= INDIA_BOUNDS.minLat &&
      p.latitude <= INDIA_BOUNDS.maxLat &&
      p.longitude >= INDIA_BOUNDS.minLng &&
      p.longitude <= INDIA_BOUNDS.maxLng,
    'validation.location_outside_india',
  );
export type LatLng = z.infer<typeof latLng>;

/** Money in rupees with at most 2 decimals. */
export const rupees = z
  .number({ invalid_type_error: 'validation.amount_invalid' })
  .nonnegative('validation.amount_negative')
  .max(1_000_000, 'validation.amount_too_large')
  .refine((v) => Number.isFinite(v), 'validation.amount_invalid')
  .transform((v) => Math.round(v * 100) / 100);
