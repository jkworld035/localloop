-- LocalLoop · 0010 · dispatch engine, partner actions, live location, tracking

-- ───────────────────────── dispatch ─────────────────────────
-- Offers the order to the nearest eligible partners. Eligibility: approved,
-- online, active account, fresh GPS fix, within dispatch radius of the store,
-- below the concurrent-delivery cap, vehicle suited to the trip, and not a
-- partner who already declined this order. Returns the number of offers sent.
create or replace function public.dispatch_order_internal(p_order_id uuid)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
  v_order public.orders;
  v_store public.stores;
  v_trip_m double precision;
  v_sent integer := 0;
  v_timeout int := coalesce(public.setting_num('offer_timeout_seconds'), 45)::int;
  r record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.status not in ('accepted', 'preparing', 'ready_for_pickup') then return 0; end if;
  if exists (select 1 from public.delivery_assignments where order_id = p_order_id and status in ('accepted', 'picked_up')) then
    return 0;
  end if;
  select * into v_store from public.stores where id = v_order.store_id;
  v_trip_m := st_distance(v_store.location, v_order.delivery_location);

  update public.delivery_assignments set status = 'expired'
   where order_id = p_order_id and status = 'offered' and expires_at <= now();

  for r in
    select dp.id, round(st_distance(dp.current_location, v_store.location))::int as dist
      from public.delivery_partners dp
      join public.profiles pr on pr.id = dp.id and pr.is_active
     where dp.status = 'approved' and dp.is_online
       and dp.current_location_at > now() - make_interval(secs => coalesce(public.setting_num('partner_location_fresh_seconds'), 120))
       and st_dwithin(dp.current_location, v_store.location, coalesce(public.setting_num('dispatch_radius_km'), 5) * 1000)
       and (dp.vehicle_type <> 'bicycle' or v_trip_m <= coalesce(public.setting_num('bicycle_max_trip_km'), 3) * 1000)
       and not exists (select 1 from public.delivery_assignments x
                        where x.order_id = p_order_id and x.partner_id = dp.id and x.status in ('offered', 'rejected'))
       and (select count(*) from public.delivery_assignments a
             where a.partner_id = dp.id and a.status in ('accepted', 'picked_up'))
           < coalesce(public.setting_num('max_active_deliveries_per_partner'), 1)
     order by dp.current_location <-> v_store.location
     limit coalesce(public.setting_num('offers_per_round'), 3)::int
  loop
    insert into public.delivery_assignments (order_id, partner_id, status, expires_at, offer_distance_m)
    values (p_order_id, r.id, 'offered', now() + make_interval(secs => v_timeout), r.dist);
    perform public.notify(r.id, 'delivery_request', jsonb_build_object(
      'order_id', p_order_id, 'store_name', v_store.name, 'distance_to_store_m', r.dist,
      'expires_in_s', v_timeout));
    v_sent := v_sent + 1;
  end loop;

  if v_sent = 0 and not exists (select 1 from public.delivery_assignments where order_id = p_order_id and status = 'offered') then
    perform public.notify(v_store.vendor_id, 'no_partner_available',
      jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number));
  end if;
  return v_sent;
end $$;

-- Scheduled every ~30 s (pg_cron, see 0012): expire unanswered offers and
-- re-dispatch orders that still have no partner.
create or replace function public.expire_offers_and_redispatch()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
begin
  update public.delivery_assignments set status = 'expired' where status = 'offered' and expires_at <= now();
  for r in
    select o.id from public.orders o
     where o.status in ('accepted', 'preparing', 'ready_for_pickup')
       and not exists (select 1 from public.delivery_assignments a
                        where a.order_id = o.id and a.status in ('offered', 'accepted', 'picked_up'))
  loop
    v_count := v_count + public.dispatch_order_internal(r.id);
  end loop;
  return v_count;
end $$;

-- ───────────────────────── partner helpers ─────────────────────────
create or replace function public._require_approved_partner() returns public.delivery_partners
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('delivery_partner');
  v_p public.delivery_partners;
begin
  select * into v_p from public.delivery_partners where id = v_uid;
  if v_p.id is null then raise exception 'partner_not_registered' using errcode = 'P0001'; end if;
  if v_p.status <> 'approved' then raise exception 'partner_not_approved' using errcode = 'P0001'; end if;
  return v_p;
end $$;

create or replace function public._my_assignment(p_assignment_id uuid) returns public.delivery_assignments
language plpgsql security definer set search_path = public as $$
declare v_a public.delivery_assignments;
begin
  select * into v_a from public.delivery_assignments where id = p_assignment_id and partner_id = auth.uid() for update;
  if v_a.id is null then raise exception 'assignment_not_found' using errcode = 'P0001'; end if;
  return v_a;
end $$;

-- ───────────────────────── availability ─────────────────────────
create or replace function public.partner_set_online(
  p_online boolean, p_lat double precision default null, p_lng double precision default null, p_accuracy_m real default null
) returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_p public.delivery_partners := public._require_approved_partner();
begin
  if p_online then
    if p_lat is null or p_lng is null then raise exception 'location_required' using errcode = 'P0001'; end if;
    update public.delivery_partners
       set is_online = true, current_location = public._point(p_lat, p_lng),
           current_location_accuracy_m = p_accuracy_m, current_location_at = now()
     where id = v_p.id;
  else
    if exists (select 1 from public.delivery_assignments where partner_id = v_p.id and status in ('accepted', 'picked_up')) then
      raise exception 'active_delivery_in_progress' using errcode = 'P0001';
    end if;
    update public.delivery_partners set is_online = false where id = v_p.id;
    update public.delivery_assignments set status = 'expired' where partner_id = v_p.id and status = 'offered';
  end if;
  return p_online;
end $$;

-- ───────────────────────── live location ─────────────────────────
create or replace function public._eta_due(a public.delivery_assignments, p_here extensions.geography)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select a.status in ('accepted', 'picked_up') and (
    a.eta_computed_at is null
    or a.eta_origin is null
    or (a.status = 'picked_up' and a.picked_up_at > a.eta_computed_at) -- leg changed: now heading to customer
    or a.eta_computed_at < now() - make_interval(secs => coalesce(public.setting_num('eta_refresh_interval_seconds'), 60))
    or st_distance(a.eta_origin, p_here) >= coalesce(public.setting_num('eta_refresh_distance_m'), 250)
  )
$$;

create or replace function public.update_driver_location(
  p_lat double precision, p_lng double precision, p_accuracy_m real default null,
  p_heading real default null, p_speed_mps real default null, p_recorded_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_p public.delivery_partners := public._require_approved_partner();
  v_here geography := public._point(p_lat, p_lng);
  v_at timestamptz := coalesce(p_recorded_at, now());
  v_is_latest boolean;
  v_last record;
  v_active jsonb := '[]'::jsonb;
  a public.delivery_assignments;
begin
  if v_at > now() + interval '1 minute' then raise exception 'invalid_timestamp' using errcode = 'P0001'; end if;
  if v_at < now() - interval '15 minutes' then
    return jsonb_build_object('accepted', false, 'reason', 'too_old');
  end if;
  if p_accuracy_m is not null and p_accuracy_m > coalesce(public.setting_num('max_location_accuracy_m'), 500) then
    return jsonb_build_object('accepted', false, 'reason', 'low_accuracy');
  end if;
  if not v_p.is_online and not exists (
       select 1 from public.delivery_assignments where partner_id = v_p.id and status in ('accepted', 'picked_up')) then
    return jsonb_build_object('accepted', false, 'reason', 'offline');
  end if;

  -- Fixes queued offline may arrive out of order; only the newest becomes "current".
  v_is_latest := v_p.current_location_at is null or v_at >= v_p.current_location_at;
  if v_is_latest then
    update public.delivery_partners
       set current_location = v_here, current_location_accuracy_m = p_accuracy_m, current_location_at = v_at
     where id = v_p.id;
  end if;

  for a in select * from public.delivery_assignments
            where partner_id = v_p.id and status in ('accepted', 'picked_up') for update
  loop
    if v_is_latest then
      update public.delivery_assignments
         set last_location = v_here, last_location_accuracy_m = p_accuracy_m,
             last_heading = p_heading, last_location_at = v_at
       where id = a.id;
    end if;

    -- History: keep a point every ≥10 s or ≥15 m to bound storage.
    select recorded_at, location into v_last from public.driver_locations
     where assignment_id = a.id order by recorded_at desc limit 1;
    if v_last.recorded_at is null or abs(extract(epoch from (v_at - v_last.recorded_at))) >= 10
       or st_distance(v_last.location, v_here) >= 15 then
      insert into public.driver_locations (partner_id, assignment_id, location, accuracy_m, heading, speed_mps, recorded_at)
      values (v_p.id, a.id, v_here, p_accuracy_m, p_heading, p_speed_mps, v_at);
    end if;

    v_active := v_active || jsonb_build_object('assignment_id', a.id, 'status', a.status,
                                               'eta_due', v_is_latest and public._eta_due(a, v_here));
  end loop;

  return jsonb_build_object('accepted', true, 'latest', v_is_latest, 'assignments', v_active);
end $$;

-- ───────────────────────── offers ─────────────────────────
create or replace function public.partner_offers()
returns table (
  assignment_id uuid, order_id uuid, order_number text, expires_at timestamptz,
  store_name text, store_locality text, store_latitude double precision, store_longitude double precision,
  distance_to_store_m integer, delivery_locality text, trip_distance_m integer, item_count integer,
  payment_method public.payment_method, cash_to_collect numeric
) language plpgsql stable security definer set search_path = public, extensions as $$
declare v_p public.delivery_partners := public._require_approved_partner();
begin
  -- Before acceptance the partner sees only the drop locality, not the full address or customer contact.
  return query
  select a.id, o.id, o.order_number, a.expires_at,
         s.name, s.locality, st_y(s.location::geometry), st_x(s.location::geometry),
         round(st_distance(v_p.current_location, s.location))::int,
         o.delivery_address ->> 'locality',
         round(st_distance(s.location, o.delivery_location))::int,
         (select sum(quantity)::int from public.order_items oi where oi.order_id = o.id),
         o.payment_method,
         case when o.payment_method = 'cod' then o.total else 0 end
    from public.delivery_assignments a
    join public.orders o on o.id = a.order_id
    join public.stores s on s.id = o.store_id
   where a.partner_id = v_p.id and a.status = 'offered' and a.expires_at > now()
   order by a.expires_at;
end $$;

create or replace function public.partner_accept_assignment(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p public.delivery_partners := public._require_approved_partner();
  v_a public.delivery_assignments := public._my_assignment(p_assignment_id);
  v_order public.orders;
  v_vendor uuid;
begin
  if v_a.status <> 'offered' then raise exception 'offer_not_open' using errcode = 'P0001'; end if;
  if v_a.expires_at <= now() then
    update public.delivery_assignments set status = 'expired' where id = v_a.id;
    return jsonb_build_object('ok', false, 'error', 'offer_expired');
  end if;
  if not v_p.is_online then raise exception 'partner_offline' using errcode = 'P0001'; end if;

  -- Serialise competing acceptances on the order row; the partial unique index
  -- delivery_assignments_one_active_per_order is the final backstop.
  select * into v_order from public.orders where id = v_a.order_id for update;
  if v_order.status not in ('accepted', 'preparing', 'ready_for_pickup') then
    update public.delivery_assignments set status = 'cancelled', responded_at = now() where id = v_a.id;
    return jsonb_build_object('ok', false, 'error', 'order_unavailable');
  end if;
  if exists (select 1 from public.delivery_assignments
              where order_id = v_a.order_id and status in ('accepted', 'picked_up')) then
    update public.delivery_assignments set status = 'cancelled', responded_at = now() where id = v_a.id;
    return jsonb_build_object('ok', false, 'error', 'already_assigned');
  end if;
  if (select count(*) from public.delivery_assignments where partner_id = v_p.id and status in ('accepted', 'picked_up'))
     >= coalesce(public.setting_num('max_active_deliveries_per_partner'), 1) then
    raise exception 'too_many_active_deliveries' using errcode = 'P0001';
  end if;

  update public.delivery_assignments set status = 'accepted', responded_at = now() where id = v_a.id;
  update public.delivery_assignments set status = 'cancelled', responded_at = now()
   where order_id = v_a.order_id and status = 'offered' and id <> v_a.id;

  select vendor_id into v_vendor from public.stores where id = v_order.store_id;
  perform public.notify(v_order.customer_id, 'partner_assigned',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
  perform public.notify(v_vendor, 'partner_assigned',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
  return jsonb_build_object('ok', true, 'assignment_id', v_a.id, 'order_id', v_order.id);
end $$;

create or replace function public.partner_reject_assignment(p_assignment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.delivery_partners := public._require_approved_partner();
  v_a public.delivery_assignments := public._my_assignment(p_assignment_id);
begin
  if v_a.status <> 'offered' then raise exception 'offer_not_open' using errcode = 'P0001'; end if;
  update public.delivery_assignments set status = 'rejected', responded_at = now() where id = v_a.id;
  if not exists (select 1 from public.delivery_assignments
                  where order_id = v_a.order_id and status in ('offered', 'accepted', 'picked_up')) then
    perform public.dispatch_order_internal(v_a.order_id);
  end if;
end $$;

-- ───────────────────────── pickup & completion ─────────────────────────
create or replace function public.partner_confirm_pickup(p_assignment_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_p public.delivery_partners := public._require_approved_partner();
  v_a public.delivery_assignments := public._my_assignment(p_assignment_id);
  v_order public.orders;
  v_store public.stores;
  v_fence numeric := public.setting_num('pickup_geofence_m');
begin
  if v_a.status <> 'accepted' then raise exception 'assignment_not_active' using errcode = 'P0001'; end if;
  select * into v_order from public.orders where id = v_a.order_id for update;
  if v_order.status <> 'ready_for_pickup' then raise exception 'order_not_ready' using errcode = 'P0001'; end if;
  select * into v_store from public.stores where id = v_order.store_id;
  if v_fence is not null and (
       v_p.current_location is null
       or v_p.current_location_at < now() - interval '2 minutes'
       or st_distance(v_p.current_location, v_store.location) > v_fence) then
    raise exception 'not_at_store' using errcode = 'P0001';
  end if;

  update public.delivery_assignments set status = 'picked_up', picked_up_at = now() where id = v_a.id;
  update public.orders set status = 'picked_up' where id = v_order.id;
  perform public.notify(v_order.customer_id, 'order_picked_up',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
end $$;

-- Returns {ok:false,...} rather than raising on a wrong OTP so the failed
-- attempt counter is committed.
create or replace function public.partner_complete_delivery(p_assignment_id uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_p public.delivery_partners := public._require_approved_partner();
  v_a public.delivery_assignments := public._my_assignment(p_assignment_id);
  v_order public.orders;
  v_secret public.order_secrets;
  v_max int := coalesce(public.setting_num('delivery_otp_max_attempts'), 5)::int;
  v_fence numeric := public.setting_num('delivery_geofence_m');
  v_vendor public.vendors;
  v_coupon public.coupons;
  v_rate numeric;
  v_base numeric;
  v_trip_km numeric;
  v_earning numeric;
begin
  if v_a.status <> 'picked_up' then raise exception 'assignment_not_active' using errcode = 'P0001'; end if;
  select * into v_order from public.orders where id = v_a.order_id for update;
  select * into v_secret from public.order_secrets where order_id = v_order.id for update;

  if v_secret.failed_attempts >= v_max then
    return jsonb_build_object('ok', false, 'error', 'otp_locked');
  end if;
  if coalesce(trim(p_otp), '') <> v_secret.delivery_otp then
    update public.order_secrets set failed_attempts = failed_attempts + 1 where order_id = v_order.id;
    return jsonb_build_object('ok', false, 'error', 'otp_incorrect', 'attempts_left', v_max - v_secret.failed_attempts - 1);
  end if;
  if v_fence is not null and (
       v_p.current_location is null
       or st_distance(v_p.current_location, v_order.delivery_location) > v_fence) then
    return jsonb_build_object('ok', false, 'error', 'not_at_destination');
  end if;

  -- Partner earning: base + per road-km of the delivery leg (first routed
  -- distance when available, else the pricing approximation).
  select distance_m / 1000.0 into v_trip_km from public.delivery_routes
   where assignment_id = v_a.id and leg = 'to_customer' order by computed_at asc limit 1;
  if v_trip_km is null then
    select st_distance(s.location, v_order.delivery_location) * coalesce(public.setting_num('listing_road_factor'), 1.4) / 1000.0
      into v_trip_km from public.stores s where s.id = v_order.store_id;
  end if;
  v_earning := round(coalesce(public.setting_num('partner_pay_base'), 0)
                     + v_trip_km * coalesce(public.setting_num('partner_pay_per_km'), 0), 2);

  update public.delivery_assignments
     set status = 'delivered', delivered_at = now(), delivered_location = v_p.current_location, earning = v_earning
   where id = v_a.id;
  update public.orders set status = 'delivered' where id = v_order.id;

  if v_order.payment_method = 'cod' then
    update public.payments set status = 'paid', paid_at = now(), collected_by = v_p.id
     where order_id = v_order.id and status = 'pending';
    update public.orders set payment_status = 'paid' where id = v_order.id;
  end if;

  select v.* into v_vendor from public.vendors v join public.stores s on s.vendor_id = v.id where s.id = v_order.store_id;
  select * into v_coupon from public.coupons where id = v_order.coupon_id;
  v_rate := coalesce(v_vendor.commission_rate_override, public.setting_num('commission_rate_default'), 0);
  -- Store-specific coupons are funded by the store; platform-wide coupons by LocalLoop.
  v_base := v_order.subtotal - case when v_coupon.store_id is not null then v_order.discount else 0 end;
  insert into public.commissions (order_id, store_id, vendor_id, base_amount, rate, commission_amount, vendor_payout)
  values (v_order.id, v_order.store_id, v_vendor.id, v_base, v_rate, round(v_base * v_rate, 2),
          v_base - round(v_base * v_rate, 2));

  perform public.notify(v_order.customer_id, 'order_delivered',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
  perform public.notify(v_vendor.id, 'order_delivered',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
  return jsonb_build_object('ok', true, 'earning', v_earning);
end $$;

-- ───────────────────────── customer tracking ─────────────────────────
-- Everything the live tracking screen needs in one call; the screen then
-- subscribes to Realtime changes on the assignment row. The partner's
-- position is included only while the order is out for delivery.
create or replace function public.get_order_tracking(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public._require_user();
  v_order public.orders;
  v_store public.stores;
  v_a public.delivery_assignments;
  v_partner jsonb;
  v_live boolean;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or (v_order.customer_id <> v_uid and not public.admin_can('deliveries')) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  select * into v_store from public.stores where id = v_order.store_id;
  select * into v_a from public.delivery_assignments
   where order_id = v_order.id and status in ('accepted', 'picked_up', 'delivered')
   order by created_at desc limit 1;
  v_live := v_a.status = 'picked_up' and v_order.status = 'picked_up';

  if v_a.id is not null then
    select jsonb_build_object(
             'name', split_part(pr.full_name, ' ', 1),
             'avatar_path', pr.avatar_path,
             'vehicle_type', dp.vehicle_type,
             'vehicle_registration_tail', right(dp.vehicle_registration, 4),
             'rating_avg', dp.rating_avg,
             'rating_count', dp.rating_count)
      into v_partner
      from public.delivery_partners dp join public.profiles pr on pr.id = dp.id
     where dp.id = v_a.partner_id;
  end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status,
    'store', jsonb_build_object('id', v_store.id, 'name', v_store.name,
                                'latitude', st_y(v_store.location::geometry), 'longitude', st_x(v_store.location::geometry)),
    'destination', jsonb_build_object('latitude', st_y(v_order.delivery_location::geometry),
                                      'longitude', st_x(v_order.delivery_location::geometry)),
    'prep_time_minutes', v_order.prep_time_minutes, 'accepted_at', v_order.accepted_at,
    'assignment', case when v_a.id is null then null else jsonb_build_object(
        'id', v_a.id, 'status', v_a.status, 'partner', v_partner,
        'live', v_live,
        'latitude', case when v_live then st_y(v_a.last_location::geometry) end,
        'longitude', case when v_live then st_x(v_a.last_location::geometry) end,
        'accuracy_m', case when v_live then v_a.last_location_accuracy_m end,
        'heading', case when v_live then v_a.last_heading end,
        'location_at', case when v_live then v_a.last_location_at end,
        'route_polyline', case when v_live then v_a.route_polyline end,
        'remaining_distance_m', case when v_live then v_a.remaining_distance_m end,
        'eta_seconds', case when v_live then v_a.eta_seconds end,
        'eta_computed_at', case when v_live then v_a.eta_computed_at end,
        'eta_traffic_aware', case when v_live then v_a.eta_traffic_aware end) end
  );
end $$;

-- Delivery partner's own view of an accepted job (full address, contact).
create or replace function public.partner_active_job(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_p public.delivery_partners := public._require_approved_partner();
  v_a public.delivery_assignments;
  v_order public.orders;
  v_store public.stores;
begin
  select * into v_a from public.delivery_assignments
   where id = p_assignment_id and partner_id = v_p.id and status in ('accepted', 'picked_up');
  if v_a.id is null then raise exception 'assignment_not_found' using errcode = 'P0001'; end if;
  select * into v_order from public.orders where id = v_a.order_id;
  select * into v_store from public.stores where id = v_order.store_id;
  return jsonb_build_object(
    'assignment_id', v_a.id, 'status', v_a.status, 'order_id', v_order.id, 'order_number', v_order.order_number,
    'order_status', v_order.status,
    'store', jsonb_build_object('name', v_store.name, 'address', v_store.address_line, 'phone', v_store.phone,
                                'latitude', st_y(v_store.location::geometry), 'longitude', st_x(v_store.location::geometry)),
    'drop', v_order.delivery_address || jsonb_build_object(
              'latitude', st_y(v_order.delivery_location::geometry),
              'longitude', st_x(v_order.delivery_location::geometry),
              'instructions', v_order.delivery_instructions),
    'items', (select jsonb_agg(jsonb_build_object('name', product_name, 'variant', variant_label, 'quantity', quantity))
                from public.order_items where order_id = v_order.id),
    'payment_method', v_order.payment_method,
    'cash_to_collect', case when v_order.payment_method = 'cod' and v_order.payment_status = 'pending' then v_order.total else 0 end,
    'route_polyline', v_a.route_polyline, 'remaining_distance_m', v_a.remaining_distance_m,
    'eta_seconds', v_a.eta_seconds, 'eta_computed_at', v_a.eta_computed_at
  );
end $$;

-- ───────────────────────── routing results (edge function only) ─────────────────────────
create or replace function public.record_route(
  p_assignment_id uuid, p_leg public.route_leg,
  p_origin_lat double precision, p_origin_lng double precision,
  p_dest_lat double precision, p_dest_lng double precision,
  p_distance_m integer, p_duration_s integer, p_polyline text,
  p_traffic_aware boolean, p_travel_mode text, p_provider text, p_reason text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_a public.delivery_assignments;
  v_order public.orders;
begin
  select * into v_a from public.delivery_assignments where id = p_assignment_id for update;
  if v_a.id is null or v_a.status not in ('accepted', 'picked_up') then return; end if;

  insert into public.delivery_routes (assignment_id, leg, origin, destination, distance_m, duration_s, polyline,
                                      traffic_aware, travel_mode, provider, reason)
  values (p_assignment_id, p_leg, public._point(p_origin_lat, p_origin_lng), public._point(p_dest_lat, p_dest_lng),
          p_distance_m, p_duration_s, p_polyline, p_traffic_aware, p_travel_mode, p_provider, p_reason);

  update public.delivery_assignments
     set route_polyline = p_polyline, remaining_distance_m = p_distance_m, eta_seconds = p_duration_s,
         eta_computed_at = now(), eta_traffic_aware = p_traffic_aware,
         eta_origin = public._point(p_origin_lat, p_origin_lng)
   where id = p_assignment_id;

  if p_leg = 'to_customer' and v_a.approaching_notified_at is null
     and p_duration_s <= coalesce(public.setting_num('approaching_threshold_seconds'), 180) then
    select * into v_order from public.orders where id = v_a.order_id;
    perform public.notify(v_order.customer_id, 'partner_approaching',
      jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
                         'minutes', greatest(1, ceil(p_duration_s / 60.0))));
    update public.delivery_assignments set approaching_notified_at = now() where id = p_assignment_id;
  end if;
end $$;

-- Coordinates and bookkeeping the compute-eta edge function needs, as plain
-- numbers (PostgREST would otherwise return geography as EWKB hex).
create or replace function public.eta_context(p_assignment_id uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'assignment_id', a.id, 'status', a.status, 'partner_id', a.partner_id, 'customer_id', o.customer_id,
    'order_status', o.status, 'vehicle_type', dp.vehicle_type,
    'partner', case when a.last_location is not null then jsonb_build_object(
                 'latitude', st_y(a.last_location::geometry), 'longitude', st_x(a.last_location::geometry),
                 'at', a.last_location_at) end,
    'store', jsonb_build_object('latitude', st_y(s.location::geometry), 'longitude', st_x(s.location::geometry)),
    'destination', jsonb_build_object('latitude', st_y(o.delivery_location::geometry),
                                      'longitude', st_x(o.delivery_location::geometry)),
    'eta_origin', case when a.eta_origin is not null then jsonb_build_object(
                    'latitude', st_y(a.eta_origin::geometry), 'longitude', st_x(a.eta_origin::geometry)) end,
    'eta_computed_at', a.eta_computed_at, 'picked_up_at', a.picked_up_at,
    'policy', jsonb_build_object(
      'interval_s', coalesce(public.setting_num('eta_refresh_interval_seconds'), 60),
      'distance_m', coalesce(public.setting_num('eta_refresh_distance_m'), 250))
  )
  from public.delivery_assignments a
  join public.orders o on o.id = a.order_id
  join public.stores s on s.id = o.store_id
  join public.delivery_partners dp on dp.id = a.partner_id
  where a.id = p_assignment_id
$$;

-- ───────────────────────── retention ─────────────────────────
create or replace function public.purge_old_locations() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from public.driver_locations dl
   where dl.received_at < now() - make_interval(days => coalesce(public.setting_num('location_retention_days'), 30)::int);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
