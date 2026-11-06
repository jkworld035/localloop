import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { findOrders } from '../query';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  // Quote everything; neutralise spreadsheet formulas from user-entered text.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`;
};

/** CSV of the filtered order list (up to 5,000 rows) for accounts and reconciliation. */
export async function GET(req: NextRequest) {
  const { supabase } = await requireAdmin('orders');
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { data, error } = await findOrders(supabase, sp, 5000);
  if (error) return new Response(error.message, { status: 500 });

  const head = ['order_number', 'placed_at', 'status', 'store', 'customer', 'phone', 'locality', 'total', 'payment_method', 'payment_status', 'delivered_at'];
  const rows = (data ?? []).map((o) => {
    const addr = o.delivery_address as Record<string, string>;
    return [o.order_number, o.placed_at, o.status, o.store?.name, o.customer?.profile?.full_name, o.customer?.profile?.phone, addr.locality, o.total, o.payment_method, o.payment_status, o.delivered_at];
  });
  const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="localloop-orders-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
