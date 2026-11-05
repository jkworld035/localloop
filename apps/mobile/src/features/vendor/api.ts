import { parseEwkbPoint, toEwktPoint, type OpeningHours, type Tables } from '@localloop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

// ───────────────────────── vendor & store ─────────────────────────

export function useVendor() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['vendor', uid],
    enabled: !!uid,
    queryFn: async () => unwrap(await supabase.from('vendors').select('*').eq('id', uid!).maybeSingle()) ?? null,
  });
}

export interface VendorRegistration {
  ownerName: string;
  businessName: string;
  businessCategoryId: string;
  gstin: string | null;
  email: string | null;
}

export function useRegisterVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: VendorRegistration) =>
      unwrap(
        await supabase.rpc('register_vendor', {
          p_owner_name: v.ownerName,
          p_business_name: v.businessName,
          p_business_category_id: v.businessCategoryId,
          p_gstin: v.gstin ?? undefined,
          p_email: v.email ?? undefined,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export type Store = Tables<'stores'> & { point: { latitude: number; longitude: number } | null };

/** The vendor's shop (the app supports one shop per vendor account). */
export function useMyStore() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['my-store', uid],
    enabled: !!uid,
    queryFn: async () => {
      const row = unwrap(
        await supabase.from('stores').select('*').eq('vendor_id', uid!).order('created_at').limit(1).maybeSingle(),
      );
      return row ? ({ ...row, point: parseEwkbPoint(row.location) } as Store) : null;
    },
  });
}

export interface StoreForm {
  name: string;
  nameTe: string;
  description: string;
  categoryId: string;
  phone: string;
  addressLine: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  location: { latitude: number; longitude: number };
  deliveryRadiusKm: number;
  minOrderValue: number;
  avgPrepMinutes: number;
  openingHours: OpeningHours;
}

export function useSaveStore() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id: string | null; form: StoreForm }) => {
      const values = {
        name: form.name,
        name_te: form.nameTe,
        description: form.description,
        category_id: form.categoryId,
        phone: form.phone,
        address_line: form.addressLine,
        locality: form.locality,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        location: toEwktPoint(form.location),
        delivery_radius_km: form.deliveryRadiusKm,
        min_order_value: form.minOrderValue,
        avg_prep_minutes: form.avgPrepMinutes,
        opening_hours: form.openingHours,
      };
      if (id) return unwrap(await supabase.from('stores').update(values).eq('id', id).select('id').single()).id;
      return unwrap(await supabase.from('stores').insert({ ...values, vendor_id: uid! }).select('id').single()).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-store'] }),
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: { is_accepting_orders?: boolean; logo_path?: string; cover_path?: string } }) =>
      unwrap(await supabase.from('stores').update(values).eq('id', id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-store'] }),
  });
}

// ───────────────────────── documents ─────────────────────────

export function useVendorDocuments() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['vendor-documents', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('vendor_documents')
          .select('id, doc_type, status, review_note, storage_path, created_at')
          .order('created_at', { ascending: false }),
      ),
  });
}

export function useAddVendorDocument() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docType, path }: { docType: string; path: string }) =>
      unwrap(await supabase.from('vendor_documents').insert({ vendor_id: uid!, doc_type: docType, storage_path: path }).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-documents'] }),
  });
}

export function useDeleteVendorDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('vendor_documents').delete().eq('id', id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-documents'] }),
  });
}

// ───────────────────────── products ─────────────────────────

const VENDOR_PRODUCT_SELECT = `
  id, name, name_te, description, category_id, is_available, is_active, created_at,
  images:product_images(id, storage_path, sort_order),
  variants:product_variants(id, label, unit, unit_quantity, price, sale_price, is_default, is_active,
    inventory(quantity, track_inventory, low_stock_threshold))
` as const;

export function useVendorProducts(storeId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-products', storeId],
    enabled: !!storeId,
    queryFn: async () =>
      unwrap(
        await supabase.from('products').select(VENDOR_PRODUCT_SELECT).eq('store_id', storeId!).eq('is_active', true).order('name'),
      ),
  });
}

export type VendorProduct = NonNullable<ReturnType<typeof useVendorProducts>['data']>[number];

export interface VariantForm {
  id?: string;
  label: string;
  unit: string;
  unitQuantity: number;
  price: number;
  salePrice: number | null;
  stock: number;
  trackInventory: boolean;
}

export function useSaveProduct(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      productId: string | null;
      product: { name: string; nameTe: string; description: string; categoryId: string; isAvailable: boolean };
      variants: VariantForm[];
    }) =>
      unwrap(
        await supabase.rpc('vendor_save_product', {
          p_store_id: storeId,
          // null creates a new product (the SQL parameter is nullable; the generated type can't express that).
          p_product_id: a.productId as string,
          p_product: {
            name: a.product.name,
            name_te: a.product.nameTe,
            description: a.product.description,
            category_id: a.product.categoryId,
            is_available: a.product.isAvailable,
          },
          p_variants: a.variants.map((v) => ({
            id: v.id ?? null,
            label: v.label,
            unit: v.unit,
            unit_quantity: v.unitQuantity,
            price: v.price,
            sale_price: v.salePrice,
            stock: v.stock,
            track_inventory: v.trackInventory,
            is_active: true,
          })),
        }),
      ) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-products', storeId] }),
  });
}

export function useSetProductAvailability(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) =>
      unwrap(await supabase.from('products').update({ is_available: available }).eq('id', id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-products', storeId] }),
  });
}

/** Removes from the shop; order history keeps its own copy of names and prices. */
export function useArchiveProduct(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('products').update({ is_active: false }).eq('id', id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-products', storeId] }),
  });
}

export function useAddProductImage(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, path, sortOrder }: { productId: string; path: string; sortOrder: number }) =>
      unwrap(await supabase.from('product_images').insert({ product_id: productId, storage_path: path, sort_order: sortOrder }).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-products', storeId] }),
  });
}

export function useRemoveProductImage(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('product_images').delete().eq('id', id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-products', storeId] }),
  });
}

// ───────────────────────── orders ─────────────────────────

export type OrderBucket = 'new' | 'active' | 'done';
const BUCKET_STATUSES: Record<OrderBucket, Tables<'orders'>['status'][]> = {
  new: ['placed'],
  active: ['accepted', 'preparing', 'ready_for_pickup', 'picked_up'],
  done: ['delivered', 'rejected', 'cancelled'],
};

export function useVendorOrders(storeId: string | undefined, bucket: OrderBucket) {
  return useQuery({
    queryKey: ['vendor-orders', storeId, bucket],
    enabled: !!storeId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('orders')
          .select('id, order_number, status, total, payment_method, placed_at, prep_time_minutes, accepted_at, delivery_address, items:order_items(quantity)')
          .eq('store_id', storeId!)
          .in('status', BUCKET_STATUSES[bucket])
          .order('placed_at', { ascending: bucket !== 'done' })
          .limit(bucket === 'done' ? 50 : 100),
      ),
  });
}

/** New orders and status changes arrive live; unsubscribes when the screen closes. */
export function useVendorOrdersRealtime(storeId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!storeId) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['vendor-orders', storeId] });
      void qc.invalidateQueries({ queryKey: ['vendor-dashboard', storeId] });
      void qc.invalidateQueries({ queryKey: ['vendor-order'] });
    };
    const channel = supabase
      .channel(`store-orders:${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, qc]);
}

export function useVendorOrder(orderId: string) {
  return useQuery({
    queryKey: ['vendor-order', orderId],
    queryFn: async () => {
      const order = unwrap(
        await supabase
          .from('orders')
          .select(
            `id, order_number, status, placed_at, accepted_at, ready_at, prep_time_minutes, subtotal, delivery_fee, discount, tax, total,
             payment_method, payment_status, delivery_address, delivery_instructions, rejection_reason, cancel_reason, store_id,
             items:order_items(id, product_name, variant_label, unit_price, quantity, line_total)`,
          )
          .eq('id', orderId)
          .single(),
      );
      const assignment = unwrap(
        await supabase
          .from('delivery_assignments')
          .select('id, status, picked_up_at')
          .eq('order_id', orderId)
          .in('status', ['accepted', 'picked_up', 'delivered'])
          .maybeSingle(),
      );
      return { ...order, assignment };
    },
  });
}

type Action =
  | { kind: 'accept'; prepMinutes: number }
  | { kind: 'reject'; reason: string }
  | { kind: 'preparing' }
  | { kind: 'ready' }
  | { kind: 'cancel'; reason: string }
  | { kind: 'request_delivery' };

export function useVendorOrderAction(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Action) => {
      const p = { p_order_id: orderId };
      switch (a.kind) {
        case 'accept':
          return unwrap(await supabase.rpc('vendor_accept_order', { ...p, p_prep_minutes: a.prepMinutes }));
        case 'reject':
          return unwrap(await supabase.rpc('vendor_reject_order', { ...p, p_reason: a.reason }));
        case 'preparing':
          return unwrap(await supabase.rpc('vendor_mark_preparing', p));
        case 'ready':
          return unwrap(await supabase.rpc('vendor_mark_ready', p));
        case 'cancel':
          return unwrap(await supabase.rpc('vendor_cancel_order', { ...p, p_reason: a.reason }));
        case 'request_delivery':
          return unwrap(await supabase.rpc('vendor_request_delivery', p));
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['vendor-order', orderId] });
      void qc.invalidateQueries({ queryKey: ['vendor-orders'] });
      void qc.invalidateQueries({ queryKey: ['vendor-dashboard'] });
    },
  });
}

// ───────────────────────── dashboard ─────────────────────────

export interface VendorDashboard {
  new_orders: number;
  in_progress: number;
  ready: number;
  out_for_delivery: number;
  orders_today: number;
  delivered_today: number;
  sales_today: number;
  sales_7d: number;
  payout_pending: number;
  low_stock: number;
  top_products_7d: { name: string; quantity: number }[];
  rating_avg: number;
  rating_count: number;
}

export function useVendorDashboard(storeId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-dashboard', storeId],
    enabled: !!storeId,
    refetchInterval: 60_000,
    queryFn: async () => unwrap(await supabase.rpc('vendor_dashboard', { p_store_id: storeId! })) as unknown as VendorDashboard,
  });
}
