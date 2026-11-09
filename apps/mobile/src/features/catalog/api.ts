import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { SelectedLocation } from '@/stores/location';

export interface StoreSummary {
  id: string;
  name: string;
  name_te: string;
  description: string;
  locality: string;
  city: string;
  logo_path: string | null;
  cover_path: string | null;
  category: { name_en: string; name_te: string } | null;
  is_open: boolean;
  is_accepting_orders: boolean;
  today_hours: { open: string; close: string }[];
  rating_avg: number;
  rating_count: number;
  min_order_value: number;
  distance_m: number | null;
  delivers_here: boolean | null;
  est_minutes_min: number | null;
  est_minutes_max: number | null;
}

export function useStoreSummary(storeId: string, location: SelectedLocation | null) {
  return useQuery({
    queryKey: ['store-summary', storeId, location?.latitude, location?.longitude],
    queryFn: async () =>
      unwrap(
        await supabase.rpc('store_summary', {
          p_store_id: storeId,
          p_lat: location?.latitude,
          p_lng: location?.longitude,
        }),
      ) as unknown as StoreSummary,
  });
}

const PRODUCT_SELECT = `
  id, name, name_te, description, description_te, highlights, highlights_te, is_available, category_id,
  category:categories(id, name_en, name_te, sort_order),
  images:product_images(storage_path, sort_order),
  variants:product_variants(id, label, unit, unit_quantity, price, sale_price, is_default, is_active,
    inventory(quantity, track_inventory))
` as const;

export function useStoreProducts(storeId: string) {
  return useQuery({
    queryKey: ['store-products', storeId],
    queryFn: async () =>
      unwrap(
        await supabase.from('products').select(PRODUCT_SELECT).eq('store_id', storeId).eq('is_active', true).order('name'),
      ),
  });
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('products')
          .select(`${PRODUCT_SELECT}, store_id, store:stores(id, name, name_te)`)
          .eq('id', productId)
          .single(),
      ),
  });
}

export type CatalogProduct = NonNullable<ReturnType<typeof useStoreProducts>['data']>[number];
export type CatalogVariant = CatalogProduct['variants'][number];

/** Active variants, default first, then cheapest. */
export function sellableVariants(p: Pick<CatalogProduct, 'variants'>): CatalogVariant[] {
  return p.variants
    .filter((v) => v.is_active)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || effectivePrice(a) - effectivePrice(b));
}

export function effectivePrice(v: Pick<CatalogVariant, 'price' | 'sale_price'>): number {
  return v.sale_price ?? v.price;
}

/** null = untracked (made to order / unlimited). */
export function stockOf(v: CatalogVariant): number | null {
  if (!v.inventory || !v.inventory.track_inventory) return null;
  return v.inventory.quantity;
}

export function isPurchasable(p: Pick<CatalogProduct, 'is_available'>, v: CatalogVariant): boolean {
  const stock = stockOf(v);
  return p.is_available && v.is_active && (stock === null || stock > 0);
}
