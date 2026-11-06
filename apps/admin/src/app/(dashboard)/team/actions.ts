'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';
import { adminError } from '@/lib/errors';

const ROLES = ['super_admin', 'operations', 'support', 'finance'] as const;

export type InviteState = { error?: string; email?: string; tempPassword?: string | null; existing?: boolean } | null;

/** Adds a staff member. The one-time password comes back in the action result (never in a URL). */
export async function inviteAdmin(_prev: InviteState, form: FormData): Promise<InviteState> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(80), role: z.enum(ROLES) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Enter a name, a valid email and a role.' };
  const { supabase } = await requireAdmin('admins');
  const { data, error } = await supabase.functions.invoke('admin-invite', { body: parsed.data });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    const code = (body as { error?: string } | null)?.error ?? error.message;
    return {
      error:
        code === 'role_conflict'
          ? 'That email belongs to a shop owner, delivery partner or a customer with orders. Use a separate work email for admin access.'
          : adminError({ message: code }),
    };
  }
  revalidatePath('/team');
  const r = data as { existing: boolean; temp_password: string | null };
  return { email: parsed.data.email, tempPassword: r.temp_password, existing: r.existing };
}

export async function changeRole(form: FormData) {
  const userId = z.string().uuid().parse(form.get('user_id'));
  const role = form.get('remove') ? 'remove' : z.enum(ROLES).parse(form.get('role'));
  const { supabase } = await requireAdmin('admins');
  const { error } = await supabase.rpc('admin_grant_role', { p_user_id: userId, p_role: role === 'remove' ? (null as never) : role });
  revalidatePath('/team');
  back('/team', error ? { error } : { done: role === 'remove' ? 'Admin access removed.' : 'Role updated.' });
}
