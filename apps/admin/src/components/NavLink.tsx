'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium ${
        active ? 'bg-forest text-white' : 'text-ink hover:bg-sunken'
      }`}
    >
      {children}
    </Link>
  );
}
