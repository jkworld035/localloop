import type { VehicleType } from '@localloop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';
import { detectCurrentLocation } from '@/services/location';
import { PARTNER_LOCATION_TASK, startPartnerTracking, stopPartnerTracking } from '@/services/partner-tracking';

// ───────────────────────── profile & registration ─────────────────────────

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

// ───────────────────────── online / tracking ─────────────────────────

/**
 * Going online needs a real GPS fix (the server refuses otherwise) and starts
 * the tracking task in idle mode; going offline stops it.
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['partner'] });
      void qc.invalidateQueries({ queryKey: ['partner-dashboard'] });
    },
  });
}

/**
 * Keeps the OS tracking task matched to reality: navigation-grade fixes during
 * a delivery, battery-saving fixes while waiting, nothing while offline.
 */
export async function reconcileTracking(isOnline: boolean, hasActiveJob: boolean) {
  const running = await Location.hasStartedLocationUpdatesAsync(PARTNER_LOCATION_TASK).catch(() => false);
  if (hasActiveJob) await startPartnerTracking('active').catch(() => undefined);
  else if (isOnline) await startPartnerTracking('idle').catch(() => undefined);
  else if (running) await stopPartnerTracking();
}

// ───────────────────────── dashboard & offers ─────────────────────────

export interface PartnerDashboard {
  deliveries_today: number;
  earnings_today: number;
  deliveries_7d: number;
  earnings_7d: number;
  cash_in_hand: number;
  rating_avg: number;
  rating_count: number;
  active_assignment_id: string | null;
}

export function usePartnerDashboard(enabled: boolean) {
  const uid = useUserId();
  return useQuery({
    queryKey: ['partner-dashboard', uid],
    enabled: enabled && !!uid,
    queryFn: async () => unwrap(await supabase.rpc('partner_dashboard')) as unknown as PartnerDashboard,
  });
}

export function useOffers(enabled: boolean) {
  const uid = useUserId();
  return useQuery({
    queryKey: ['partner-offers', uid],
    enabled: enabled && !!uid,
    // Offers expire on the server; refetch periodically so expired ones disappear even without an event.
    refetchInterval: 15_000,
    queryFn: async () => unwrap(await supabase.rpc('partner_offers')),
  });
}

export type Offer = NonNullable<ReturnType<typeof useOffers>['data']>[number];

/** New offers, cancellations and status changes for this partner arrive live. */
export function usePartnerRealtime(onNewOffer?: () => void) {
  const uid = useUserId();
  const qc = useQueryClient();
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`partner:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments', filter: `partner_id=eq.${uid}` }, (payload) => {
        void qc.invalidateQueries({ queryKey: ['partner-offers'] });
        void qc.invalidateQueries({ queryKey: ['partner-dashboard'] });
        void qc.invalidateQueries({ queryKey: ['partner-job'] });
        if (payload.eventType === 'INSERT' && (payload.new as { status?: string }).status === 'offered') onNewOffer?.();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, qc, onNewOffer]);
}

export function useRespondToOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, accept }: { assignmentId: string; accept: boolean }) => {
      if (!accept) {
        unwrap(await supabase.rpc('partner_reject_assignment', { p_assignment_id: assignmentId }));
        return { ok: true as const, error: null };
      }
      return unwrap(await supabase.rpc('partner_accept_assignment', { p_assignment_id: assignmentId })) as unknown as
        | { ok: true; assignment_id: string; order_id: string }
        | { ok: false; error: string };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['partner-offers'] });
      void qc.invalidateQueries({ queryKey: ['partner-dashboard'] });
    },
  });
}

// ───────────────────────── active job ─────────────────────────

export interface ActiveJob {
  assignment_id: string;
  status: 'accepted' | 'picked_up';
  order_id: string;
  order_number: string;
  order_status: string;
  store: { name: string; address: string; phone: string; latitude: number; longitude: number };
  drop: {
    label: string;
    contact_name: string;
    contact_phone: string;
    line1: string;
    line2: string;
    landmark: string;
    locality: string;
    city: string;
    pincode: string;
    latitude: number;
    longitude: number;
    instructions: string;
  };
  items: { name: string; variant: string; quantity: number }[];
  payment_method: string;
  cash_to_collect: number;
  route_polyline: string | null;
  remaining_distance_m: number | null;
  eta_seconds: number | null;
  eta_computed_at: string | null;
}

export function useActiveJob(assignmentId: string) {
  return useQuery({
    queryKey: ['partner-job', assignmentId],
    queryFn: async () => unwrap(await supabase.rpc('partner_active_job', { p_assignment_id: assignmentId })) as unknown as ActiveJob,
    retry: false,
  });
}

/** Order status (shop marks ready) and route/ETA updates reach the job screen live. */
export function useActiveJobRealtime(job: Pick<ActiveJob, 'assignment_id' | 'order_id'> | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!job) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: ['partner-job', job.assignment_id] });
    const channel = supabase
      .channel(`job:${job.assignment_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${job.order_id}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'delivery_assignments', filter: `id=eq.${job.assignment_id}` }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [job?.assignment_id, job?.order_id, qc]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Sends a fresh fix right before a geofenced action so the server checks where the partner is now. */
async function pushCurrentFix() {
  try {
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await supabase.rpc('update_driver_location', {
      p_lat: fix.coords.latitude,
      p_lng: fix.coords.longitude,
      p_accuracy_m: fix.coords.accuracy ?? undefined,
      p_recorded_at: new Date(fix.timestamp).toISOString(),
    });
  } catch {
    /* the server falls back to the last known fix */
  }
}

export function useConfirmPickup(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await pushCurrentFix();
      unwrap(await supabase.rpc('partner_confirm_pickup', { p_assignment_id: assignmentId }));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['partner-job', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['partner-dashboard'] });
    },
  });
}

export function useCompleteDelivery(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otp: string) => {
      await pushCurrentFix();
      return unwrap(await supabase.rpc('partner_complete_delivery', { p_assignment_id: assignmentId, p_otp: otp })) as unknown as
        | { ok: true; earning: number }
        | { ok: false; error: string; attempts_left?: number };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['partner-dashboard'] });
      void qc.invalidateQueries({ queryKey: ['partner-history'] });
    },
  });
}

// ───────────────────────── history & documents ─────────────────────────

export function usePartnerHistory() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['partner-history', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('delivery_assignments')
          .select('id, delivered_at, earning, order:orders(order_number, total, payment_method, store:stores(name), delivery_address)')
          .eq('partner_id', uid!)
          .eq('status', 'delivered')
          .order('delivered_at', { ascending: false })
          .limit(100),
      ),
  });
}

export function usePartnerDocuments() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['partner-documents', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('delivery_documents')
          .select('id, doc_type, status, review_note, storage_path, created_at')
          .order('created_at', { ascending: false }),
      ),
  });
}

export function useAddPartnerDocument() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docType, path }: { docType: string; path: string }) =>
      unwrap(await supabase.from('delivery_documents').insert({ partner_id: uid!, doc_type: docType, storage_path: path }).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-documents'] }),
  });
}

export function useDeletePartnerDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('delivery_documents').delete().eq('id', id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-documents'] }),
  });
}

/** The photo customers see on the tracking screen. */
export function useSetAvatar() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => unwrap(await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid!).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}
