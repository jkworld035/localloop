import { ORDER_STATUSES } from '@localloop/shared';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { Badge, btnPrimary, btnSecondary, Empty, inputCls, Notice, PageHeader, StatusBadge, Table } from '@/components/ui';
import { inr, ist, label } from '@/lib/format';
import { findOrders } from './query';

export const metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const PAGE = 50;

type Search = { status?: string; q?: string; from?: string; to?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase } = await requireAdmin('orders');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { data, count, error } = await findOrders(supabase, sp, PAGE, (page - 1) * PAGE);
  const qs = (extra: Record<string, string | number>) =>
    '?' + new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Orders" description="Search any order by number or customer phone. Open an order to cancel it or send it to delivery partners again." />
      <form className="mb-6 flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">Order no. or phone</span>
          <input name="q" defaultValue={sp.q} placeholder="LL261106-… or 98xxxxxxxx" className={`${inputCls} w-60`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">Status</span>
          <select name="status" defaultValue={sp.status ?? ''} className={inputCls}>
            <option value="">All</option>
            <option value="open">Open (not finished)</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">From</span>
          <input type="date" name="from" defaultValue={sp.from} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">To</span>
          <input type="date" name="to" defaultValue={sp.to} className={inputCls} />
        </label>
        <button className={btnPrimary}>Search</button>
        <a href={`/orders/export${qs({})}`} className={`${btnSecondary} inline-flex items-center`}>
          Download CSV
        </a>
      </form>

      {error && <Notice tone="bad">Couldn&apos;t load orders: {error.message}</Notice>}
      {data && data.length === 0 ? (
        <Empty>No orders match these filters.</Empty>
      ) : (
        <Table head={['Order', 'Placed', 'Customer', 'Shop', 'Area', 'Total', 'Payment', 'Status']}>
          {data?.map((o) => {
            const addr = o.delivery_address as Record<string, string>;
            return (
              <tr key={o.id} className="border-t border-line hover:bg-ivory">
                <td className="px-4 py-3">
                  <Link href={`/orders/${o.id}`} className="font-medium text-forest underline-offset-2 hover:underline">
                    {o.order_number}
                  </Link>
                  {o.is_demo && (
                    <span className="ml-2">
                      <Badge>demo</Badge>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{ist(o.placed_at)}</td>
                <td className="px-4 py-3">
                  {o.customer?.profile?.full_name ?? '—'}
                  <div className="text-xs text-ink-2">{o.customer?.profile?.phone}</div>
                </td>
                <td className="px-4 py-3">{o.store?.name}</td>
                <td className="px-4 py-3">{addr.locality}</td>
                <td className="px-4 py-3 tabular-nums">{inr(o.total)}</td>
                <td className="px-4 py-3">
                  {label(o.payment_method)} · <span className="text-ink-2">{label(o.payment_status)}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {!!count && count > PAGE && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/orders${qs({ page: page - 1 })}`} className="font-medium text-forest hover:underline">
              ← Newer
            </Link>
          )}
          <span className="text-ink-2">
            Page {page} of {Math.ceil(count / PAGE)} · {count} orders
          </span>
          {page * PAGE < count && (
            <Link href={`/orders${qs({ page: page + 1 })}`} className="font-medium text-forest hover:underline">
              Older →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
