import { z } from 'zod';
import { WEEKDAYS } from '../constants/catalog';
import { indianMobile, latLng, optionalEmail, optionalGstin, personName, pincode, rupees } from './common';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.time_invalid');

export const timeRange = z
  .object({ open: hhmm, close: hhmm })
  // close may be earlier than open for shops that run past midnight
  .refine((r) => r.open !== r.close, 'validation.time_range_invalid');

/** Matches the jsonb shape checked by public.valid_opening_hours(). */
export const openingHoursSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((d) => [d, z.array(timeRange).max(3)])) as Record<
    (typeof WEEKDAYS)[number],
    z.ZodArray<typeof timeRange>
  >,
);
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const vendorRegistrationSchema = z.object({
  ownerName: personName,
  email: optionalEmail,
  businessName: z.string().trim().min(2, 'validation.required').max(120),
  businessCategoryId: z.string().uuid('validation.required'),
  gstin: optionalGstin,
});
export type VendorRegistrationInput = z.input<typeof vendorRegistrationSchema>;

export const storeSchema = z.object({
  name: z.string().trim().min(2, 'validation.required').max(120),
  nameTe: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(1000).optional().default(''),
  categoryId: z.string().uuid('validation.required'),
  phone: indianMobile,
  addressLine: z.string().trim().min(5, 'validation.address_short').max(200),
  locality: z.string().trim().min(2, 'validation.required').max(80),
  city: z.string().trim().min(2, 'validation.required').max(80),
  state: z.string().trim().min(2, 'validation.required').max(60),
  pincode,
  location: latLng,
  deliveryRadiusKm: z.number().min(0.5).max(25),
  minOrderValue: rupees,
  avgPrepMinutes: z.number().int().min(5).max(180),
  openingHours: openingHoursSchema,
});
export type StoreInput = z.input<typeof storeSchema>;
