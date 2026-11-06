import { redirect } from 'next/navigation';
import { requireAdmin, roleCan, type Permission } from '@/lib/auth';
import { NavLink } from '@/components/NavLink';
import { signOut } from '../login/actions';

const NAV: { href: string; label: string; perm: Permission[] }[] = [
  { href: '/', label: 'Overview', perm: ['orders'] },
  { href: '/live', label: 'Live map', perm: ['deliveries'] },
  { href: '/orders', label: 'Orders', perm: ['orders'] },
  { href: '/approvals', label: 'Approvals', perm: ['vendors'] },
  { href: '/users', label: 'Users & shops', perm: ['users'] },
  { href: '/support', label: 'Support', perm: ['tickets'] },
  { href: '/reviews', label: 'Reviews', perm: ['reviews'] },
  { href: '/catalogue', label: 'Catalogue', perm: ['catalog'] },
  { href: '/coupons', label: 'Coupons', perm: ['coupons'] },
  { href: '/finance', label: 'Finance', perm: ['payments', 'commissions'] },
  { href: '/health', label: 'App health', perm: ['orders'] },
  { href: '/areas', label: 'Delivery areas', perm: ['areas'] },
  { href: '/team', label: 'Admin team', perm: ['admins'] },
  { href: '/settings', label: 'Platform settings', perm: ['settings'] },
  { href: '/audit', label: 'Audit log', perm: ['audit'] },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Staff added with a one-time password choose their own before anything else.
  if (admin.mustChangePassword) redirect('/account/password');
  const items = NAV.filter((n) => n.perm.some((p) => roleCan(admin.role, p)));

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white p-5 md:flex">
        <a href="/" className="mb-8 block">
          <span className="text-xl font-bold text-forest">LocalLoop</span>
          <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-xs font-medium text-ink-2">Admin</span>
        </a>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {items.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line pt-4 text-sm">
          <p className="font-medium">{admin.name}</p>
          <p className="text-ink-2">{admin.role.replace('_', ' ')}</p>
          <a href="/account/password" className="mt-3 block font-medium text-forest hover:underline">
            Change password
          </a>
          <form action={signOut} className="mt-3">
            <button className="font-medium text-bad hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="flex-1">
        {/* Compact nav for narrow screens */}
        <nav aria-label="Main" className="flex gap-2 overflow-x-auto border-b border-line bg-white p-3 md:hidden">
          {items.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto max-w-7xl p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}
