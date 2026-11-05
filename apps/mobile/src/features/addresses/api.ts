import type { Address } from '@localloop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

export function useAddresses() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['addresses', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('addresses')
          .select('id, label, contact_name, contact_phone, line1, line2, landmark, locality, city, state, pincode, is_default')
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false }),
      ),
  });
}

export type SavedAddress = NonNullable<ReturnType<typeof useAddresses>['data']>[number];

export function formatAddress(a: Pick<SavedAddress, 'line1' | 'line2' | 'landmark' | 'locality' | 'city' | 'pincode'>) {
  return [a.line1, a.line2, a.landmark, a.locality, `${a.city} ${a.pincode}`].filter(Boolean).join(', ');
}

/** PostGIS accepts EWKT text for geography columns: longitude first. */
const toEwkt = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`;

export function useSaveAddress() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Address) => {
      const row = unwrap(
        await supabase
          .from('addresses')
          .insert({
            user_id: uid!,
            label: a.label,
            contact_name: a.contactName,
            contact_phone: a.contactPhone,
            line1: a.line1,
            line2: a.line2,
            landmark: a.landmark,
            locality: a.locality,
            city: a.city,
            state: a.state,
            pincode: a.pincode,
            location: toEwkt(a.location.latitude, a.location.longitude),
          })
          .select('id')
          .single(),
      );
      if (a.isDefault) unwrap(await supabase.rpc('set_default_address', { p_address_id: row.id }));
      return row.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });
}

export function useSetDefaultAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('set_default_address', { p_address_id: id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });
}

/** Soft delete: past orders keep their own address snapshot. */
export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await supabase
          .from('addresses')
          .update({ deleted_at: new Date().toISOString(), is_default: false })
          .eq('id', id)
          .select('id'),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });
}
