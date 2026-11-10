import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export type StoreSort = 'distance' | 'rating' | 'fastest';

export interface NearbyParams {
  latitude: number;
  longitude: number;
  radiusKm: number;
  sort: StoreSort;
  openNow: boolean;
  categoryId?: string | null;
}

export function useNearbyStores(p: NearbyParams | null) {
  return useQuery({
    queryKey: ['nearby-stores', p],
    enabled: !!p,
    queryFn: async () =>
      unwrap(
        await supabase.rpc('nearby_stores', {
          p_lat: p!.latitude,
          p_lng: p!.longitude,
          p_radius_km: p!.radiusKm,
          p_sort: p!.sort,
          p_open_now: p!.openNow,
          p_category_id: p!.categoryId ?? undefined,
          p_limit: 50,
        }),
      ),
  });
}

export function useAreaStatus(point: { latitude: number; longitude: number } | null) {
  return useQuery({
    queryKey: ['area-status', point?.latitude.toFixed(4), point?.longitude.toFixed(4)],
    enabled: !!point,
    staleTime: 10 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.rpc('area_status', { p_lat: point!.latitude, p_lng: point!.longitude })) as {
        serviceable: boolean;
        area_name?: string;
        city?: string;
      },
  });
}

export function useCategories(kind: 'store' | 'product') {
  return useQuery({
    queryKey: ['categories', kind],
    staleTime: 60 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('categories')
          .select('id, slug, name_en, name_te, icon')
          .eq('kind', kind)
          .eq('is_active', true)
          .order('sort_order'),
      ),
  });
}

/** Public URL for an image in a public bucket (store-media, product-media, avatars). */
export function publicImageUrl(bucket: 'store-media' | 'product-media' | 'avatars', path: string | null | undefined) {
  if (!path) return null;
  // Plain public URL. Supabase's resizing (`transform`) needs the Pro plan and fails on Free,
  // so photos are compressed on upload instead (phone ≤1600 px JPEG, admin ≤1200 px).
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Products matching a search across shops near the selected location (server: search_products). */
export function useProductSearch(point: { latitude: number; longitude: number } | null, query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['product-search', point?.latitude, point?.longitude, q],
    enabled: !!point && q.length >= 2,
    placeholderData: (prev) => prev,
    queryFn: async () =>
      unwrap(
        await supabase.rpc('search_products', {
          p_lat: point!.latitude,
          p_lng: point!.longitude,
          p_query: q,
          p_radius_km: 10,
          p_in_stock_only: false,
          p_limit: 40,
        }),
      ),
  });
}
