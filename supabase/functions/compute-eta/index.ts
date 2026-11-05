// compute-eta — route-based delivery ETA via the Google Routes API.
//
// Called by the partner app when update_driver_location() reports eta_due,
// and by the customer tracking screen when it opens (force). The function
// decides itself whether a provider call is warranted (eta-policy.ts), so a
// buggy or hostile client cannot run up the routing bill.
//
// Secrets: GOOGLE_ROUTES_API_KEY (server-side key restricted to the Routes API).
// Without it the function answers 503 routing_not_configured — the apps then
// show distance/time as unavailable rather than inventing an estimate.
import {
  buildRoutesRequest,
  decideEtaRecompute,
  parseRoutesResponse,
  ROUTES_FIELD_MASK,
  travelModeFor,
} from '../_shared/eta-policy.ts';
import { adminClient, callerId, json } from '../_shared/supabase.ts';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const uid = await callerId(req);
  if (!uid) return json({ error: 'not_authenticated' }, 401);

  let body: { assignment_id?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!body.assignment_id) return json({ error: 'assignment_id_required' }, 400);

  const db = adminClient();
  const { data: ctx, error } = await db.rpc('eta_context', { p_assignment_id: body.assignment_id });
  if (error) return json({ error: 'lookup_failed' }, 500);
  if (!ctx) return json({ error: 'assignment_not_found' }, 404);

  // Only the assigned partner, or the customer while the order is out for delivery.
  const isPartner = ctx.partner_id === uid;
  const isCustomer = ctx.customer_id === uid && ctx.order_status === 'picked_up';
  if (!isPartner && !isCustomer) return json({ error: 'forbidden' }, 403);

  const decision = decideEtaRecompute({
    assignmentStatus: ctx.status,
    partner: ctx.partner,
    etaOrigin: ctx.eta_origin,
    etaComputedAt: ctx.eta_computed_at,
    pickedUpAt: ctx.picked_up_at,
    policy: { intervalSeconds: Number(ctx.policy.interval_s), distanceMeters: Number(ctx.policy.distance_m) },
    force: body.force === true,
  });
  if (!decision.recompute) return json({ recomputed: false, reason: decision.reason });

  const apiKey = Deno.env.get('GOOGLE_ROUTES_API_KEY');
  if (!apiKey) return json({ error: 'routing_not_configured' }, 503);

  const destination = decision.leg === 'to_store' ? ctx.store : ctx.destination;
  const request = buildRoutesRequest(ctx.partner, destination, ctx.vehicle_type);

  let route;
  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': ROUTES_FIELD_MASK },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('routes_api_error', res.status, await res.text());
      return json({ error: 'routing_failed' }, 502);
    }
    route = parseRoutesResponse(await res.json());
  } catch (e) {
    console.error('routes_api_exception', String(e));
    return json({ error: 'routing_failed' }, 502);
  }

  const { error: writeErr } = await db.rpc('record_route', {
    p_assignment_id: ctx.assignment_id,
    p_leg: decision.leg,
    p_origin_lat: ctx.partner.latitude,
    p_origin_lng: ctx.partner.longitude,
    p_dest_lat: destination.latitude,
    p_dest_lng: destination.longitude,
    p_distance_m: route.distanceMeters,
    p_duration_s: route.durationSeconds,
    p_polyline: route.polyline,
    p_traffic_aware: 'routingPreference' in request,
    p_travel_mode: travelModeFor(ctx.vehicle_type),
    p_provider: 'google_routes',
    p_reason: decision.reason,
  });
  if (writeErr) return json({ error: 'record_failed' }, 500);

  // Clients receive the new values through Realtime on delivery_assignments;
  // the response is for the caller's convenience.
  return json({
    recomputed: true,
    leg: decision.leg,
    distance_m: route.distanceMeters,
    duration_s: route.durationSeconds,
    polyline: route.polyline,
  });
});
