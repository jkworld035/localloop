import { formatINR } from '@localloop/shared';
import { requireAdmin } from '@/lib/auth';
import { PageHeader, Stat } from '@/components/ui';

export const metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

type Overview = Record<
  | 'customers' | 'vendors' | 'vendors_pending' | 'partners' | 'partners_pending' | 'partners_online'
  | 'active_stores' | 'stores_pending' | 'orders_today' | 'orders_in_progress' | 'delivered_today'
  | 'cancelled_today' | 'gmv_today' | 'commission_today' | 'open_tickets',
  number
> & { avg_delivery_minutes_7d: number | null };

export default async function OverviewPage() {
  const { supabase } = await requireAdmin('orders');
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw new Error(error.message);
  const o = data as unknown as Overview;
  const pending = o.vendors_pending + o.stores_pending + o.partners_pending;

  return (
    <>
      <PageHeader title="Overview" description="Live platform figures. “Today” is the India Standard Time calendar day; demo data is excluded." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Orders today" value={o.orders_today} />
        <Stat label="In progress" value={o.orders_in_progress} />
        <Stat label="Delivered today" value={o.delivered_today} />
        <Stat label="Cancelled / rejected today" value={o.cancelled_today} />
        <Stat label="GMV today" value={formatINR(o.gmv_today)} hint="Delivered orders" />
        <Stat label="Commission today" value={formatINR(o.commission_today)} />
        <Stat
          label="Avg. delivery time"
          value={o.avg_delivery_minutes_7d == null ? '—' : `${o.avg_delivery_minutes_7d} min`}
          hint="Placed → delivered, last 7 days"
        />
        <Stat label="Open support tickets" value={o.open_tickets} />
        <Stat label="Customers" value={o.customers} />
        <Stat label="Active shops" value={o.active_stores} />
        <Stat label="Approved vendors" value={o.vendors} />
        <Stat label="Delivery partners" value={o.partners} hint={`${o.partners_online} online now`} />
      </div>
      {pending > 0 && (
        <a href="/approvals" className="mt-8 block rounded-2xl border border-amber bg-warn-bg p-5 font-medium text-warn hover:underline">
          {pending} application{pending === 1 ? '' : 's'} waiting for review →
        </a>
      )}
    </>
  );
}
