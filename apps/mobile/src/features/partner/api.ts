import type { VehicleType } from '@localloop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';
import { detectCurrentLocation } from '@/services/location';
import { startPartnerTracking, stopPartnerTracking } from '@/services/partner-tracking';

export function usePartner() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['partner', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('delivery_partners')
          .select('id, vehicle_type, vehicle_registration, driving_licence, status, status_reason, is_online, rating_avg, rating_count')
          .eq('id', uid!)
          .maybeSingle(),
      ) ?? null,
  });
}

export interface PartnerRegistration {
  fullName: string;
  email: string | null;
  vehicleType: VehicleType;
  vehicleRegistration: string | null;
  drivingLicence: string | null;
}

export function useRegisterPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: PartnerRegistration) =>
      unwrap(
        await supabase.rpc('register_delivery_partner', {
          p_full_name: v.fullName,
          p_vehicle_type: v.vehicleType,
          p_vehicle_registration: v.vehicleRegistration ?? undefined,
          p_driving_licence: v.drivingLicence ?? undefined,
          p_email: v.email ?? undefined,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['partner'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/**
 * Going online needs a real GPS fix (the server refuses otherwise) and starts
 * the tracking task in idle mode; going offline stops it. If the server
 * refuses (active delivery, not approved) tracking state is left unchanged.
 */
export function useSetOnline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (online: boolean) => {
      if (online) {
        const here = await detectCurrentLocation();
        unwrap(
          await supabase.rpc('partner_set_online', {
            p_online: true,
            p_lat: here.latitude,
            p_lng: here.longitude,
            p_accuracy_m: here.accuracyM ?? undefined,
          }),
        );
        await startPartnerTracking('idle');
      } else {
        unwrap(await supabase.rpc('partner_set_online', { p_online: false }));
        await stopPartnerTracking();
      }
      return online;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['partner'] }),
  });
}

/** Keeps the OS tracking task consistent with the server's online flag (e.g. after an app restart). */
export async function reconcileTracking(isOnline: boolean) {
  const running = await Location.hasStartedLocationUpdatesAsync('localloop-partner-location').catch(() => false);
  if (isOnline && !running) await startPartnerTracking('idle').catch(() => undefined);
  if (!isOnline && running) await stopPartnerTracking();
}
