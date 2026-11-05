import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

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

/** Today's order counts across the vendor's stores ("today" = Asia/Kolkata calendar day). */
export function useVendorToday() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['vendor-today', uid],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const ist = new Date(Date.now() + 5.5 * 3600_000);
      const startUtc = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000);
      const rows = unwrap(
        await supabase.from('orders').select('status').gte('placed_at', startUtc.toISOString()),
      );
      const count = (pred: (s: string) => boolean) => rows.filter((r) => pred(r.status)).length;
      return {
        total: rows.length,
        pending: count((s) => s === 'placed'),
        inProgress: count((s) => ['accepted', 'preparing', 'ready_for_pickup', 'picked_up'].includes(s)),
        completed: count((s) => s === 'delivered'),
      };
    },
  });
}
