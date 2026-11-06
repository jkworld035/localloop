'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

const optionalNumber = z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().positive().nullable());
const istDate = (end: boolean) =>
  z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().transform((d) => (d ? `${d}T${end ? '23:59:59' : '00:00:00'}+05:30` : null)),
  );

const coupon = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/),
    description: z.string().trim().max(200),
    discount_type: z.enum(['percent', 'flat']),
    discount_value: z.coerce.number().positive(),
    max_discount: optionalNumber,
    min_order_value: z.coerce.number().min(0),
    usage_limit: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().positive().nullable()),
    per_customer_limit: z.coerce.number().int().positive(),
    starts_at: istDate(false),
    ends_at: istDate(true),
  })
  .refine((c) => c.discount_type === 'flat' || c.discount_value <= 100, { message: 'percent' })
  .refine((c) => !c.starts_at || !c.ends_at || c.ends_at > c.starts_at, { message: 'window' });

export async function createCoupon(form: FormData) {
  const parsed = coupon.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const m = parsed.error.issues[0]?.message;
    back('/coupons', {
      error:
        m === 'percent'
          ? 'A percentage discount must be 100 or less.'
          : m === 'window'
            ? 'The end date must be after the start date.'
            : 'Check the form: code is 3–20 capital letters or digits, amounts must be positive.',
    });
  }
  const { supabase, userId } = await requireAdmin('coupons');
  const { starts_at, ...rest } = parsed.data;
  const { error } = await supabase.from('coupons').insert({ ...rest, ...(starts_at ? { starts_at } : {}), created_by: userId });
  revalidatePath('/coupons');
  back('/coupons', error ? { error } : { done: `Coupon ${parsed.data.code} created.` });
}

export async function toggleCoupon(form: FormData) {
  const id = z.string().uuid().parse(form.get('id'));
  const active = form.get('active') === 'true';
  const { supabase } = await requireAdmin('coupons');
  const { error } = await supabase.from('coupons').update({ is_active: active }).eq('id', id);
  revalidatePath('/coupons');
  back('/coupons', error ? { error } : { done: active ? 'Coupon switched on.' : 'Coupon switched off.' });
}
