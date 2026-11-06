import { parseEwkbPoint } from '@localloop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export interface TrackingPartner {
  name: string;
  avatar_path: string | null;
  vehicle_type: string;
  vehicle_registration_tail: string | null;
  rating_avg: number;
  rating_count: number;
}

export interface Tracking {
  order_id: string;
  order_number: string;
  status: string;
  store: { id: string; name: string; latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  prep_time_minutes: number | null;
  accepted_at: string | null;
  assignment: {
    id: string;
    status: string;
    partner: TrackingPartner | null;
    live: boolean;
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    heading: number | null;
    location_at: string | null;
    route_polyline: string | null;
    remaining_distance_m: number | null;
    eta_seconds: number | null;
    eta_computed_at: string | null;
    eta_traffic_aware: boolean | null;
  } | null;
}

export function useTracking(orderId: string) {
  return useQuery({
    queryKey: ['tracking', orderId],
    queryFn: async () => unwrap(await supabase.rpc('get_order_tracking', { p_order_id: orderId })) as unknown as Tracking,
  });
}

/**
 * Live updates: each partner fix updates the assignment row, which RLS shows
 * to the customer only while the order is out for delivery. Fixes are merged
 * straight into the cache (no refetch per fix); order status changes refetch.
 */
export function useTrackingRealtime(orderId: string, assignmentId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    const refetch = () => {
      void qc.invalidateQueries({ queryKey: ['tracking', orderId] });
      void qc.invalidateQueries({ queryKey: ['order', orderId] });
    };
    let channel = supabase
      .channel(`track:${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, refetch);
    if (assignmentId) {
      channel = channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_assignments', filter: `id=eq.${assignmentId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const point = parseEwkbPoint(row.last_location);
          qc.setQueryData<Tracking>(['tracking', orderId], (prev) =>
            prev?.assignment
              ? {
                  ...prev,
                  assignment: {
                    ...prev.assignment,
                    status: (row.status as string) ?? prev.assignment.status,
                    latitude: point?.latitude ?? prev.assignment.latitude,
                    longitude: point?.longitude ?? prev.assignment.longitude,
                    accuracy_m: (row.last_location_accuracy_m as number | null) ?? prev.assignment.accuracy_m,
                    heading: (row.last_heading as number | null) ?? prev.assignment.heading,
                    location_at: (row.last_location_at as string | null) ?? prev.assignment.location_at,
                    route_polyline: (row.route_polyline as string | null) ?? prev.assignment.route_polyline,
                    remaining_distance_m: (row.remaining_distance_m as number | null) ?? prev.assignment.remaining_distance_m,
                    eta_seconds: (row.eta_seconds as number | null) ?? prev.assignment.eta_seconds,
                    eta_computed_at: (row.eta_computed_at as string | null) ?? prev.assignment.eta_computed_at,
                    eta_traffic_aware: (row.eta_traffic_aware as boolean | null) ?? prev.assignment.eta_traffic_aware,
                  },
                }
              : prev,
          );
          if (row.status && row.status !== 'picked_up') refetch();
        },
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, assignmentId, qc]);
}

export type EtaRequestResult = 'ok' | 'not_configured' | 'failed';

/**
 * Asks the server for a routed ETA. The edge function decides whether a
 * Routes API call is warranted; results arrive through Realtime.
 */
export async function requestEta(assignmentId: string, force = false): Promise<EtaRequestResult> {
  const { error } = await supabase.functions.invoke('compute-eta', { body: { assignment_id: assignmentId, force } });
  if (!error) return 'ok';
  const status = (error as { context?: { status?: number } }).context?.status;
  return status === 503 ? 'not_configured' : 'failed';
}
