import Link from 'next/link';
import { requireAdmin, roleCan } from '@/lib/auth';
import { ActionResult, Badge, btnDanger, btnPrimary, btnSecondary, Empty, inputCls, PageHeader, StatusBadge, Table } from '@/components/ui';
import { ago, ist, label } from '@/lib/format';
import { setActive, setStoreStatus } from './actions';

export const metadata = { title: 'Users & shops' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'customer', label: 'Customers' },
  { key: 'vendor', label: 'Vendors' },
  { key: 'delivery_partner', label: 'Delivery partners' },
  { key: 'stores', label: 'Shops' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function BlockForm({ userId, active, tab }: { userId: string; active: boolean; tab: Tab }) {
  return (
    <form action={setActive} className="flex flex-wrap gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="active" value={String(!active)} />
      {active && (
        <label>
          <span className="sr-only">Reason for blocking</span>
          <input name="reason" placeholder="Reason to block" minLength={5} maxLength={300} required className={`${inputCls} w-44`} />
        </label>
      )}
      <button className={active ? btnDanger : btnSecondary}>{active ? 'Block' : 'Restore'}</button>
    </form>
  );
}

const clean = (q: string) => q.replace(/[%_,()*]/g, '').trim();

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; done?: string; error?: string }> }) {
  const admin = await requireAdmin('users');
  const db = admin.supabase;
  const sp = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === sp.tab)?.key ?? 'customer') as Tab;
  const q = clean(sp.q ?? '');
  const digits = q.replace(/\D/g, '');
  const canStores = roleCan(admin.role, 'stores');

  let body: React.ReactNode;
  if (tab === 'stores') {
    let sq = db
      .from('stores')
      .select('id, name, locality, status, status_reason, is_accepting_orders, rating_avg, rating_count, created_at, vendor:vendors(business_name, profile:profiles!vendors_id_fkey(full_name, phone))')
      .order('created_at', { ascending: false })
      .limit(100);
    if (q) sq = sq.ilike('name', `%${q}%`);
    const { data } = await sq;
    body = !data?.length ? (
      <Empty>No shops found.</Empty>
    ) : (
      <Table head={['Shop', 'Owner', 'Status', 'Rating', 'Action']}>
        {data.map((s) => (
          <tr key={s.id} className="border-t border-line align-top">
            <td className="px-4 py-3">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-ink-2">{s.locality}</p>
            </td>
            <td className="px-4 py-3">
              {s.vendor?.profile?.full_name}
              <p className="text-xs text-ink-2">{s.vendor?.profile?.phone}</p>
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={s.status} />
              {!s.is_accepting_orders && s.status === 'approved' && <p className="mt-1 text-xs text-ink-2">Paused by owner</p>}
              {s.status_reason && <p className="mt-1 text-xs text-ink-2">{s.status_reason}</p>}
            </td>
            <td className="px-4 py-3">{s.rating_count ? `★ ${Number(s.rating_avg).toFixed(1)} (${s.rating_count})` : '—'}</td>
            <td className="px-4 py-3">
              {canStores && (s.status === 'approved' || s.status === 'suspended') && (
                <form action={setStoreStatus} className="flex flex-wrap gap-2">
                  <input type="hidden" name="store_id" value={s.id} />
                  {s.status === 'approved' ? (
                    <>
                      <input name="reason" placeholder="Reason to hide" minLength={5} maxLength={300} required aria-label="Reason to hide the shop" className={`${inputCls} w-40`} />
                      <button name="status" value="suspended" className={btnDanger}>
                        Hide shop
                      </button>
                    </>
                  ) : (
                    <button name="status" value="approved" className={btnSecondary}>
                      Make visible
                    </button>
                  )}
                </form>
              )}
              {s.status === 'pending' && (
                <Link href="/approvals" className="text-forest hover:underline">
                  Review in Approvals
                </Link>
              )}
            </td>
          </tr>
        ))}
      </Table>
    );
  } else {
    let uq = db
      .from('profiles')
      .select('id, full_name, phone, email, is_active, created_at, preferred_language')
      .eq('role', tab)
      .order('created_at', { ascending: false })
      .limit(100);
    if (digits.length >= 4) uq = uq.ilike('phone', `%${digits}%`);
    else if (q) uq = uq.ilike('full_name', `%${q}%`);
    const { data: people } = await uq;
    const ids = (people ?? []).map((p) => p.id);

    // Role-specific details for the listed accounts.
    const partners =
      tab === 'delivery_partner' && ids.length
        ? (await db.from('delivery_partners').select('id, status, vehicle_type, vehicle_registration, is_online, current_location_at, rating_avg, rating_count').in('id', ids)).data
        : null;
    const vendors = tab === 'vendor' && ids.length ? (await db.from('vendors').select('id, business_name, status').in('id', ids)).data : null;
    const orderCounts =
      tab === 'customer' && ids.length
        ? (await db.from('orders').select('customer_id').in('customer_id', ids)).data?.reduce<Record<string, number>>((m, o) => ((m[o.customer_id] = (m[o.customer_id] ?? 0) + 1), m), {})
        : null;

    body = !people?.length ? (
      <Empty>No accounts found.</Empty>
    ) : (
      <Table head={['Name', 'Phone', tab === 'customer' ? 'Orders' : 'Verification', 'Joined', 'Sign-in', 'Action']}>
        {people.map((p) => {
          const dp = partners?.find((x) => x.id === p.id);
          const v = vendors?.find((x) => x.id === p.id);
          return (
            <tr key={p.id} className="border-t border-line align-top">
              <td className="px-4 py-3">
                <p className="font-medium">{p.full_name ?? '—'}</p>
                {v && <p className="text-xs text-ink-2">{v.business_name}</p>}
                {dp && (
                  <p className="text-xs text-ink-2">
                    {label(dp.vehicle_type)} {dp.vehicle_registration}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {p.phone}
                <p className="text-xs text-ink-2">{p.preferred_language === 'te' ? 'Telugu' : 'English'}</p>
              </td>
              <td className="px-4 py-3">
                {tab === 'customer' && (orderCounts?.[p.id] ?? 0)}
                {v && <StatusBadge status={v.status} />}
                {dp && (
                  <>
                    <StatusBadge status={dp.status} />
                    {dp.is_online && (
                      <span className="ml-1">
                        <Badge tone="ok">online</Badge>
                      </span>
                    )}
                    <p className="mt-1 text-xs text-ink-2">GPS {ago(dp.current_location_at)}</p>
                    {dp.rating_count > 0 && <p className="text-xs text-ink-2">★ {Number(dp.rating_avg).toFixed(1)} ({dp.rating_count})</p>}
                  </>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{ist(p.created_at, 'date')}</td>
              <td className="px-4 py-3">{p.is_active ? <Badge tone="ok">active</Badge> : <Badge tone="bad">blocked</Badge>}</td>
              <td className="px-4 py-3">
                <BlockForm userId={p.id} active={p.is_active} tab={tab} />
              </td>
            </tr>
          );
        })}
      </Table>
    );
  }

  return (
    <>
      <PageHeader title="Users & shops" description="Find any account by name or phone. Blocking stops sign-in immediately and is recorded in the audit log." />
      <nav aria-label="Account type" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/users?tab=${t.key}`}
            aria-current={t.key === tab ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium ${t.key === tab ? 'bg-forest text-white' : 'bg-white text-ink hover:bg-sunken'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <form className="mb-6 flex gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        <label className="flex-1">
          <span className="sr-only">Search</span>
          <input name="q" defaultValue={sp.q} placeholder={tab === 'stores' ? 'Shop name' : 'Name or phone number'} className={`${inputCls} w-full max-w-md`} />
        </label>
        <button className={btnPrimary}>Search</button>
      </form>
      <ActionResult done={sp.done} error={sp.error} />
      {body}
      <p className="mt-3 text-xs text-ink-2">Showing the latest 100 matches.</p>
    </>
  );
}
