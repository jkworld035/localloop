import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

export function useWishlist() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['wishlist', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('wishlist_items')
          .select('id, product_id, store_id, created_at, product:products(id, name, name_te, store_id), store:stores(id, name, name_te, locality)')
          .order('created_at', { ascending: false }),
      ),
  });
}

type Target = { productId: string } | { storeId: string };

export function useSavedEntry(target: Target) {
  const { data } = useWishlist();
  return data?.find((w) => ('productId' in target ? w.product_id === target.productId : w.store_id === target.storeId));
}

export function useToggleSaved(target: Target) {
  const uid = useUserId();
  const qc = useQueryClient();
  const entry = useSavedEntry(target);
  return useMutation({
    mutationFn: async () => {
      if (entry) {
        unwrap(await supabase.from('wishlist_items').delete().eq('id', entry.id).select('id'));
      } else {
        unwrap(
          await supabase
            .from('wishlist_items')
            .insert({
              customer_id: uid!,
              product_id: 'productId' in target ? target.productId : null,
              store_id: 'storeId' in target ? target.storeId : null,
            })
            .select('id'),
        );
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
  });
}
