'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin, type Permission } from '@/lib/auth';

const decision = z.object({
  kind: z.enum(['vendors', 'stores', 'delivery_partners']),
  id: z.string().uuid(),
  status: z.enum(['approved', 'rejected', 'suspended']),
  reason: z.string().trim().max(300).optional(),
});

const PERM: Record<z.infer<typeof decision>['kind'], Permission> = {
  vendors: 'vendors',
  stores: 'stores',
  delivery_partners: 'partners',
};

/**
 * Approve / reject / suspend an application. Runs as the signed-in admin:
 * RLS (admin_can) authorises the update, guard triggers stamp reviewer and
 * time, audit_admin_write records before/after, and the owner is notified.
 */
export async function decide(form: FormData) {
  const parsed = decision.safeParse({
    kind: form.get('kind'),
    id: form.get('id'),
    status: form.get('status'),
    reason: form.get('reason') || undefined,
  });
  if (!parsed.success) redirect('/approvals?error=invalid');
  const d = parsed.data;
  if (d.status !== 'approved' && (!d.reason || d.reason.length < 5)) redirect('/approvals?error=reason');

  const { supabase } = await requireAdmin(PERM[d.kind]);
  const { error, count } = await supabase
    .from(d.kind)
    .update({ status: d.status, status_reason: d.status === 'approved' ? null : d.reason }, { count: 'exact' })
    .eq('id', d.id);

  if (error || count === 0) redirect(`/approvals?error=${encodeURIComponent(error?.message ?? 'not_updated')}`);
  revalidatePath('/approvals');
  revalidatePath('/');
  redirect(`/approvals?done=${d.status}`);
}
