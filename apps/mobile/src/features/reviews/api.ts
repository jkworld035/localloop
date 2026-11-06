import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export interface ReviewState {
  can_review: boolean;
  store: { rating: number; body: string } | null;
  partner: { rating: number } | null;
  has_partner: boolean;
  partner_name: string | null;
  products: { product_id: string; name: string; rating: number | null }[];
}

export function useReviewState(orderId: string, enabled = true) {
  return useQuery({
    queryKey: ['review-state', orderId],
    enabled,
    queryFn: async () => unwrap(await supabase.rpc('order_review_state', { p_order_id: orderId })) as unknown as ReviewState,
  });
}

export interface ReviewInput {
  target: 'store' | 'product' | 'delivery_partner';
  rating: number;
  body?: string;
  productId?: string;
}

/** Submits each new rating; ones already given are skipped by the caller. */
export function useSubmitReviews(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: ReviewInput[]) => {
      for (const r of items) {
        const { error } = await supabase.rpc('submit_review', {
          p_order_id: orderId,
          p_target: r.target,
          p_rating: r.rating,
          p_body: r.body ?? '',
          p_product_id: r.productId,
        });
        // A second tap after a slow network is harmless.
        if (error && error.message !== 'already_reviewed') throw error;
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['review-state', orderId] });
      void qc.invalidateQueries({ queryKey: ['store-reviews'] });
    },
  });
}

export function useStoreReviews(storeId: string) {
  return useQuery({
    queryKey: ['store-reviews', storeId],
    queryFn: async () => unwrap(await supabase.rpc('store_reviews', { p_store_id: storeId, p_limit: 10 })),
  });
}

export function useReportReview() {
  return useMutation({
    mutationFn: async ({ reviewId, reason, reporterId }: { reviewId: string; reason: string; reporterId: string }) => {
      const { error } = await supabase.from('review_reports').insert({ review_id: reviewId, reporter_id: reporterId, reason });
      // Reporting twice is fine — the first report counts.
      if (error && error.code !== '23505') throw error;
    },
  });
}
