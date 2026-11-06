import type { PaymentMethod } from '@localloop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

export function useMyOrders() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['my-orders', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('orders')
          .select('id, order_number, status, total, placed_at, store_id, store:stores(name, name_te)')
          .eq('customer_id', uid!)
          .order('placed_at', { ascending: false })
          .limit(50),
      ),
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('orders')
          .select(
            `id, order_number, status, placed_at, accepted_at, delivered_at, prep_time_minutes,
             subtotal, delivery_fee, discount, tax, total, payment_method, payment_status,
             delivery_address, delivery_instructions, rejection_reason, cancel_reason,
             store:stores(id, name, name_te, phone),
             items:order_items(id, product_id, product_name, variant_label, unit_price, quantity, line_total),
             history:order_status_history(id, to_status, created_at, note)`,
          )
          .eq('id', orderId)
          .order('created_at', { referencedTable: 'order_status_history', ascending: true })
          .single(),
      ),
  });
}

/** The 4-digit handover code. RLS returns it only to the customer and only while the order is open. */
export function useDeliveryOtp(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['order-otp', orderId],
    enabled,
    queryFn: async () =>
      unwrap(await supabase.from('order_secrets').select('delivery_otp').eq('order_id', orderId).maybeSingle())?.delivery_otp ??
      null,
  });
}

/** Live status: Realtime pushes changes to this order (RLS-filtered); unsubscribes when the screen closes. */
export function useOrderRealtime(orderId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['order', orderId] });
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
    };
    const channel = supabase
      .channel(`order:${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, refresh)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_status_history', filter: `order_id=eq.${orderId}` },
        refresh,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, qc]);
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      addressId: string;
      paymentMethod: PaymentMethod;
      idempotencyKey: string;
      couponCode: string | null;
      instructions: string;
    }) =>
      unwrap(
        await supabase.rpc('place_order', {
          p_address_id: a.addressId,
          p_payment_method: a.paymentMethod,
          p_idempotency_key: a.idempotencyKey,
          p_coupon_code: a.couponCode ?? undefined,
          p_instructions: a.instructions,
        }),
      ) as unknown as { order_id: string; order_number: string; total: number; duplicate: boolean },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
    },
  });
}

export function useCancelOrder(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) =>
      unwrap(await supabase.rpc('customer_cancel_order', { p_order_id: orderId, p_reason: reason })),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['order', orderId] });
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
    },
  });
}

export function useTestPaymentsEnabled() {
  return useQuery({
    queryKey: ['setting', 'test_payments_enabled'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const row = unwrap(
        await supabase.from('app_settings').select('value').eq('key', 'test_payments_enabled').maybeSingle(),
      );
      return row?.value === true;
    },
  });
}
