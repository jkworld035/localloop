import { useQuery } from '@tanstack/react-query';
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
          .select('id, order_number, status, total, placed_at, store:stores(name, name_te)')
          .eq('customer_id', uid!)
          .order('placed_at', { ascending: false })
          .limit(50),
      ),
  });
}

export function useWishlist() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['wishlist', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('wishlist_items')
          .select('id, created_at, product:products(id, name, name_te), store:stores(id, name, name_te, locality)')
          .order('created_at', { ascending: false }),
      ),
  });
}
