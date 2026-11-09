import { z } from 'zod';
import { PRODUCT_UNITS } from '../constants/catalog';
import { rupees } from './common';

export const variantSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1, 'validation.required').max(40),
    unit: z.enum(PRODUCT_UNITS),
    unitQuantity: z.number().positive('validation.quantity_invalid').max(100000),
    price: rupees.refine((v) => v > 0, 'validation.price_required'),
    salePrice: rupees.nullable().optional().default(null),
    stock: z.number().int().min(0).max(100000),
    trackInventory: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.salePrice == null || v.salePrice < v.price, {
    message: 'validation.sale_price_too_high',
    path: ['salePrice'],
  });

export const productSchema = z.object({
  name: z.string().trim().min(2, 'validation.required').max(120),
  nameTe: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  descriptionTe: z.string().trim().max(2000).optional().default(''),
  /** Benefit points shown to customers, one per line in the form. */
  highlights: z.array(z.string().trim().max(120)).max(8, 'validation.too_many_highlights').optional().default([]),
  highlightsTe: z.array(z.string().trim().max(120)).max(8, 'validation.too_many_highlights').optional().default([]),
  templateId: z.string().uuid().nullable().optional().default(null),
  categoryId: z.string().uuid('validation.required'),
  isAvailable: z.boolean().default(true),
  variants: z.array(variantSchema).min(1, 'validation.variant_required').max(20),
});

export type ProductInput = z.input<typeof productSchema>;
export type VariantInput = z.input<typeof variantSchema>;
