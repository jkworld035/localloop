import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

/**
 * The cart lives in the database (carts / cart_items, RLS: owner only), so it
 * survives reinstalls and is exactly what place_order() prices. One cart per
 * customer, bound to one shop.
 */
export function useCart() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['cart', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('carts')
          .select(
            `id, store_id, store:stores(id, name, name_te, min_order_value),
             items:cart_items(id, variant_id, quantity, created_at,
               variant:product_variants(id, label, price, sale_price, product:products(id, name, name_te)))`,
          )
          .eq('customer_id', uid!)
          .maybeSingle(),
      ) ?? null,
  });
}

export type Cart = NonNullable<ReturnType<typeof useCart>['data']>;

/** variant_id → quantity for the current cart (only if it belongs to `storeId`). */
export function useCartQuantities(storeId?: string) {
  const { data: cart } = useCart();
  const map = new Map<string, number>();
  if (cart && (!storeId || cart.store_id === storeId)) cart.items.forEach((i) => map.set(i.variant_id, i.quantity));
  return map;
}

export function cartItemCount(cart: Cart | null | undefined) {
  return cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
}

export function cartSubtotal(cart: Cart | null | undefined) {
  return (
    cart?.items.reduce((sum, i) => sum + (i.variant ? (i.variant.sale_price ?? i.variant.price) * i.quantity : 0), 0) ?? 0
  );
}

/** Thrown when adding from a different shop while the cart has items; the UI asks before replacing. */
export class CartConflictError extends Error {
  constructor(public readonly currentStoreName: string) {
    super('cart_conflict');
  }
}

export const MAX_ITEM_QUANTITY = 50; // matches the cart_items check constraint

export function useSetCartQuantity() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storeId: string; variantId: string; quantity: number; replaceCart?: boolean }) => {
      const quantity = Math.max(0, Math.min(MAX_ITEM_QUANTITY, Math.round(args.quantity)));
      const cart = await qc.fetchQuery({
        queryKey: ['cart', uid],
        queryFn: async () =>
          unwrap(
            await supabase
              .from('carts')
              .select('id, store_id, store:stores(name), items:cart_items(id, variant_id, quantity)')
              .eq('customer_id', uid!)
              .maybeSingle(),
          ) ?? null,
        staleTime: 0,
      });

      let cartId = cart?.id;
      if (!cart || cart.store_id !== args.storeId) {
        if (quantity === 0) return;
        if (cart && cart.items.length > 0 && !args.replaceCart) {
          throw new CartConflictError(cart.store?.name ?? '');
        }
        // Creates the cart or re-points it at this shop (clearing other shops' items) server-side.
        cartId = unwrap(await supabase.rpc('start_cart', { p_store_id: args.storeId })) as string;
      }

      const existing = cart?.store_id === args.storeId ? cart.items.find((i) => i.variant_id === args.variantId) : undefined;
      if (quantity === 0) {
        if (existing) unwrap(await supabase.from('cart_items').delete().eq('id', existing.id).select('id'));
      } else if (existing) {
        unwrap(await supabase.from('cart_items').update({ quantity }).eq('id', existing.id).select('id'));
      } else {
        unwrap(await supabase.from('cart_items').insert({ cart_id: cartId!, variant_id: args.variantId, quantity }).select('id'));
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });
}

export interface CartQuote {
  store_id: string;
  store_name: string;
  items: {
    variant_id: string;
    product_id: string;
    product_name: string;
    variant_label: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    available: boolean;
    stock: number | null;
  }[];
  subtotal: number;
  delivery_fee: number;
  tax: number;
  discount: number;
  total: number;
  distance_m: number | null;
  min_order_value: number;
  coupon_id: string | null;
  /** e.g. 'store_closed', 'insufficient_stock:<variant_id>' */
  issues: string[];
}

/** Server-side price check — the same function place_order() uses, so the total shown is the total charged. */
export function useCartQuote(args: { addressId: string | null; couponCode: string | null; enabled: boolean }) {
  const { data: cart } = useCart();
  const itemsKey = cart?.items.map((i) => `${i.variant_id}:${i.quantity}`).join(',');
  return useQuery({
    queryKey: ['cart-quote', cart?.id, itemsKey, args.addressId, args.couponCode],
    enabled: args.enabled && cartItemCount(cart) > 0,
    queryFn: async () =>
      unwrap(
        await supabase.rpc('quote_cart', {
          p_address_id: args.addressId ?? undefined,
          p_coupon_code: args.couponCode ?? undefined,
        }),
      ) as unknown as CartQuote,
  });
}

/** Splits 'insufficient_stock:<id>' into its code and the affected variant. */
export function parseIssue(issue: string): { code: string; variantId?: string } {
  const [code, variantId] = issue.split(':');
  return { code: code!, variantId };
}
