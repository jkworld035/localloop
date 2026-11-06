'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back, str } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';
import { inr } from '@/lib/format';

const money = z.coerce.number().nonnegative();

export async function settlePartnerCash(form: FormData) {
  const partnerId = z.string().uuid().parse(form.get('partner_id'));
  const expected = money.parse(form.get('expected'));
  const { supabase } = await requireAdmin('payments');
  const { error } = await supabase.rpc('admin_settle_partner_cash', { p_partner_id: partnerId, p_expected: expected, p_note: str(form, 'note') || undefined });
  revalidatePath('/finance');
  back('/finance', error ? { error } : { done: `Recorded ${inr(expected)} cash received.` });
}

export async function recordVendorPayout(form: FormData) {
  const vendorId = z.string().uuid().parse(form.get('vendor_id'));
  const expected = money.parse(form.get('expected'));
  const { supabase } = await requireAdmin('commissions');
  const { error } = await supabase.rpc('admin_record_vendor_payout', { p_vendor_id: vendorId, p_expected: expected, p_reference: str(form, 'reference') });
  revalidatePath('/finance');
  back('/finance', error ? { error } : { done: `Recorded payout of ${inr(expected)}. The shop has been notified.` });
}

export async function retryRefund(form: FormData) {
  const paymentId = z.string().uuid().parse(form.get('payment_id'));
  const { supabase } = await requireAdmin('payments');
  const { error } = await supabase.rpc('admin_retry_refund', { p_payment_id: paymentId });
  revalidatePath('/finance');
  back('/finance', error ? { error } : { done: 'Refund queued again.' });
}
