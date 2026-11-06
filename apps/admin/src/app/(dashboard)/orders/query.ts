import 'server-only';
import { ORDER_STATUSES } from '@localloop/shared';
import type { requireAdmin } from '@/lib/auth';

type Db = Awaited<ReturnType<typeof requireAdmin>>['supabase'];

export interface OrderFilters {
  status?: string;
  q?: string;
  from?: string; // yyyy-mm-dd (IST)
  to?: string;
}

export const OPEN_STATUSES = ['placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up'] as const;

/** Orders matching the list filters. `q` matches an order number or a 10-digit customer phone. */
export async function findOrders(db: Db, f: OrderFilters, limit: number, offset = 0) {
  let q = db
    .from('orders')
    .select(
      'id, order_number, status, total, payment_method, payment_status, placed_at, delivered_at, is_demo, delivery_address, store:stores(name), customer:customers(profile:profiles(full_name, phone))',
      { count: 'exact' },
    )
    .order('placed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (f.status === 'open') q = q.in('status', [...OPEN_STATUSES]);
  else if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) q = q.eq('status', f.status as (typeof ORDER_STATUSES)[number]);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) q = q.gte('placed_at', `${f.from}T00:00:00+05:30`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) q = q.lte('placed_at', `${f.to}T23:59:59.999+05:30`);

  const term = (f.q ?? '').trim();
  if (term) {
    const digits = term.replace(/\D/g, '');
    if (digits.length === 10) {
      const { data: people } = await db.from('profiles').select('id').eq('phone', `+91${digits}`);
      q = q.in('customer_id', (people ?? []).map((p) => p.id).concat('00000000-0000-0000-0000-000000000000'));
    } else {
      q = q.ilike('order_number', `%${term.replace(/[%_,()]/g, '')}%`);
    }
  }
  return q;
}
