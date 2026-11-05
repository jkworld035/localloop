import { z } from 'zod';
import { indianMobile, latLng, personName, pincode } from './common';

export const addressSchema = z.object({
  label: z.string().trim().min(1, 'validation.required').max(30),
  contactName: personName,
  contactPhone: indianMobile,
  line1: z.string().trim().min(3, 'validation.address_short').max(160),
  line2: z.string().trim().max(160).optional().default(''),
  landmark: z.string().trim().max(120).optional().default(''),
  locality: z.string().trim().min(2, 'validation.required').max(80),
  city: z.string().trim().min(2, 'validation.required').max(80),
  state: z.string().trim().min(2, 'validation.required').max(60),
  pincode,
  location: latLng,
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.input<typeof addressSchema>;
export type Address = z.output<typeof addressSchema>;
