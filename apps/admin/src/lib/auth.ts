import 'server-only';
import type { Enums } from '@localloop/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isConfigured } from './env';
import { supabaseServer } from './supabase/server';

export type AdminRole = Enums<'admin_role'>;
export type Permission =
  | 'users' | 'vendors' | 'partners' | 'stores' | 'catalog' | 'orders' | 'deliveries' | 'areas'
  | 'reviews' | 'notifications' | 'tickets' | 'payments' | 'commissions' | 'coupons' | 'reports'
  | 'settings' | 'admins' | 'audit';

/** Mirrors public.admin_can() so the UI only shows modules the admin can use. The database remains authoritative. */
const ROLE_PERMISSIONS: Record<AdminRole, Permission[] | 'all'> = {
  super_admin: 'all',
  operations: ['users', 'vendors', 'partners', 'stores', 'catalog', 'orders', 'deliveries', 'areas', 'reviews', 'notifications', 'tickets'],
  support: ['users', 'orders', 'deliveries', 'tickets', 'reviews'],
  finance: ['orders', 'payments', 'commissions', 'coupons', 'reports'],
};

export function roleCan(role: AdminRole, perm: Permission) {
  const p = ROLE_PERMISSIONS[role];
  return p === 'all' || p.includes(perm);
}

/**
 * Data Access Layer: resolves the verified admin for this request (memoised
 * per render). Redirects to /login when signed out and to /forbidden when the
 * account is not an active admin. Call it in every page and Server Action.
 */
export const requireAdmin = cache(async (perm?: Permission) => {
  // Without configuration the root layout shows a setup notice; don't attempt (and log) a doomed client.
  if (!isConfigured) redirect('/login');
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // verifies the JWT with Supabase Auth (not just the cookie)
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('admin_role, must_change_password, profile:profiles!admin_users_id_fkey(full_name, email, is_active, role)')
    .eq('id', user.id)
    .maybeSingle();
  if (!admin || !admin.profile?.is_active || admin.profile.role !== 'admin') redirect('/forbidden');
  if (perm && !roleCan(admin.admin_role, perm)) redirect('/forbidden');

  return {
    supabase,
    userId: user.id,
    role: admin.admin_role,
    name: admin.profile.full_name ?? admin.profile.email ?? 'Admin',
    mustChangePassword: admin.must_change_password,
  };
});
