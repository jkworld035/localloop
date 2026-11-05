import { requireAdmin, roleCan, type Permission } from '@/lib/auth';
import { NavLink } from '@/components/NavLink';
import { signOut } from '../login/actions';

/** Modules implemented in this release. Later phases add orders, deliveries, live map, catalogue, coupons, etc. */
const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: '/', label: 'Overview', perm: 'orders' },
  { href: '/approvals', label: 'Approvals', perm: 'vendors' },
  { href: '/settings', label: 'Platform settings', perm: 'settings' },
  { href: '/audit', label: 'Audit log', perm: 'audit' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const items = NAV.filter((n) => roleCan(admin.role, n.perm));

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
        <main className="mx-auto max-w-6xl p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}
