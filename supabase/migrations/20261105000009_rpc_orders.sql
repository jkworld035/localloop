-- LocalLoop · 0009 · notifications helper, cart pricing, order placement, vendor order actions

-- ───────────────────────── notifications ─────────────────────────
create or replace function public.notify(p_user uuid, p_type text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, data) values (p_user, p_type, coalesce(p_data, '{}'))
$$;

-- ───────────────────────── pricing ─────────────────────────
-- Prices are GST-inclusive (Indian retail MRP convention), so `tax` is 0 unless
-- app_settings.delivery_fee_gst_rate is set, in which case GST on the delivery
-- fee is itemised. Delivery fee distance is the store→address straight line
-- scaled by listing_road_factor — a pricing approximation, never an ETA.
create or replace function public._cart_quote(p_customer uuid, p_address_id uuid, p_coupon_code text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_cart public.carts;
  v_store public.stores;
  v_addr public.addresses;
  v_items jsonb := '[]'::jsonb;
  v_issues text[] := '{}';
  v_subtotal numeric(10,2) := 0;
  v_fee numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_dist double precision;
  v_road_km numeric;
  v_coupon public.coupons;
  v_used int;
  r record;
begin
  select * into v_cart from public.carts where customer_id = p_customer;
  if v_cart.id is null or not exists (select 1 from public.cart_items where cart_id = v_cart.id) then
    raise exception 'cart_empty' using errcode = 'P0001';
  end if;
  select * into v_store from public.stores where id = v_cart.store_id;

  if not public.store_is_public(v_store.id) then v_issues := array_append(v_issues, 'store_unavailable'::text); end if;
  if not v_store.is_accepting_orders then v_issues := array_append(v_issues, 'store_paused'::text); end if;
  if not public.is_open_at(v_store.opening_hours, v_store.timezone, now()) then v_issues := array_append(v_issues, 'store_closed'::text); end if;

  for r in
    select ci.variant_id, ci.quantity, pv.label, coalesce(pv.sale_price, pv.price) as unit_price,
           pv.is_active as variant_active, p.id as product_id, p.name, p.is_available, p.is_active as product_active,
           i.track_inventory, i.quantity as stock
      from public.cart_items ci
      join public.product_variants pv on pv.id = ci.variant_id
      join public.products p on p.id = pv.product_id
      join public.inventory i on i.variant_id = pv.id
     where ci.cart_id = v_cart.id
     order by ci.created_at
  loop
    v_items := v_items || jsonb_build_object(
      'variant_id', r.variant_id, 'product_id', r.product_id, 'product_name', r.name, 'variant_label', r.label,
      'unit_price', r.unit_price, 'quantity', r.quantity, 'line_total', r.unit_price * r.quantity,
      'available', r.variant_active and r.product_active and r.is_available,
      'stock', case when r.track_inventory then r.stock end
    );
    if not (r.variant_active and r.product_active and r.is_available) then
      v_issues := array_append(v_issues, ('item_unavailable:' || r.variant_id)::text);
    elsif r.track_inventory and r.stock < r.quantity then
      v_issues := array_append(v_issues, ('insufficient_stock:' || r.variant_id)::text);
    end if;
    v_subtotal := v_subtotal + r.unit_price * r.quantity;
  end loop;

  if v_subtotal < v_store.min_order_value then v_issues := array_append(v_issues, 'below_min_order'::text); end if;

  if p_address_id is not null then
    select * into v_addr from public.addresses where id = p_address_id and user_id = p_customer and deleted_at is null;
    if v_addr.id is null then raise exception 'address_not_found' using errcode = 'P0001'; end if;
    v_dist := st_distance(v_store.location, v_addr.location);
    if v_dist > v_store.delivery_radius_km * 1000 then v_issues := array_append(v_issues, 'address_outside_delivery_radius'::text); end if;
    v_road_km := round((v_dist * coalesce(public.setting_num('listing_road_factor'), 1.4) / 1000.0)::numeric, 2);
    v_fee := coalesce(public.setting_num('delivery_fee_base'), 0)
             + greatest(0, v_road_km - coalesce(public.setting_num('delivery_fee_base_km'), 0))
               * coalesce(public.setting_num('delivery_fee_per_km'), 0);
    if public.setting_num('free_delivery_min_subtotal') is not null
       and v_subtotal >= public.setting_num('free_delivery_min_subtotal') then
      v_fee := 0;
    end if;
    v_fee := round(v_fee, 0);
    v_tax := round(v_fee * coalesce(public.setting_num('delivery_fee_gst_rate'), 0), 2);
  end if;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_coupon from public.coupons
     where code = upper(trim(p_coupon_code)) and is_active
       and starts_at <= now() and (ends_at is null or ends_at > now())
       and (store_id is null or store_id = v_store.id);
    if v_coupon.id is null then
      v_issues := array_append(v_issues, 'coupon_invalid'::text);
    elsif v_subtotal < v_coupon.min_order_value then
      v_issues := array_append(v_issues, 'coupon_min_order'::text);
    elsif v_coupon.usage_limit is not null and v_coupon.times_used >= v_coupon.usage_limit then
      v_issues := array_append(v_issues, 'coupon_exhausted'::text);
    else
      select count(*) into v_used from public.coupon_redemptions
       where coupon_id = v_coupon.id and customer_id = p_customer;
      if v_used >= v_coupon.per_customer_limit then
        v_issues := array_append(v_issues, 'coupon_already_used'::text);
      else
        v_discount := case v_coupon.discount_type
          when 'flat' then v_coupon.discount_value
          else round(v_subtotal * v_coupon.discount_value / 100, 2) end;
        if v_coupon.max_discount is not null then v_discount := least(v_discount, v_coupon.max_discount); end if;
        v_discount := least(v_discount, v_subtotal);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'store_id', v_store.id, 'store_name', v_store.name, 'items', v_items,
    'subtotal', v_subtotal, 'delivery_fee', v_fee, 'tax', v_tax, 'discount', v_discount,
    'total', v_subtotal + v_fee + v_tax - v_discount,
    'distance_m', round(v_dist), 'min_order_value', v_store.min_order_value,
    'coupon_id', v_coupon.id, 'issues', to_jsonb(v_issues)
  );
end $$;

create or replace function public.quote_cart(p_address_id uuid default null, p_coupon_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return public._cart_quote(public._require_role('customer'), p_address_id, p_coupon_code);
end $$;

-- Replace the cart's store (customer confirmed "start a new cart from this shop").
create or replace function public.start_cart(p_store_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('customer');
  v_cart uuid;
begin
  if not public.store_is_public(p_store_id) then
    raise exception 'store_unavailable' using errcode = 'P0001';
  end if;
  insert into public.carts (customer_id, store_id) values (v_uid, p_store_id)
  on conflict (customer_id) do update set store_id = excluded.store_id
  returning id into v_cart;
  delete from public.cart_items where cart_id = v_cart
    and variant_id not in (select pv.id from public.product_variants pv join public.products p on p.id = pv.product_id
                            where p.store_id = p_store_id);
  return v_cart;
end $$;

-- ───────────────────────── order placement ─────────────────────────
create or replace function public.place_order(
  p_address_id uuid,
  p_payment_method public.payment_method,
  p_idempotency_key uuid,
  p_coupon_code text default null,
  p_instructions text default ''
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public._require_role('customer');
  v_existing public.orders;
  v_cart public.carts;
  v_quote jsonb;
  v_issue text;
  v_addr public.addresses;
  v_order_id uuid;
  v_order_number text;
  v_bytes bytea;
  v_recent int;
  v_vendor uuid;
  item jsonb;
begin
  if p_idempotency_key is null then raise exception 'idempotency_key_required' using errcode = 'P0001'; end if;

  -- Duplicate submit (double tap, retry after timeout) returns the original order.
  select * into v_existing from public.orders where customer_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number,
                              'total', v_existing.total, 'duplicate', true);
  end if;

  select count(*) into v_recent from public.orders where customer_id = v_uid and placed_at > now() - interval '10 minutes';
  if v_recent >= coalesce(public.setting_num('max_orders_per_10min'), 5) then
    raise exception 'too_many_orders' using errcode = 'P0001';
  end if;

  if p_payment_method = 'razorpay' then
    raise exception 'payment_method_unavailable' using errcode = 'P0001';
  end if;
  if p_payment_method = 'test' and not coalesce((public.setting('test_payments_enabled') #>> '{}')::boolean, false) then
    raise exception 'payment_method_unavailable' using errcode = 'P0001';
  end if;

  select * into v_cart from public.carts where customer_id = v_uid for update;
  if v_cart.id is null then raise exception 'cart_empty' using errcode = 'P0001'; end if;

  -- Lock stock rows in a stable order so concurrent checkouts cannot oversell or deadlock.
  perform 1 from public.inventory i
   where i.variant_id in (select variant_id from public.cart_items where cart_id = v_cart.id)
   order by i.variant_id for update;

  v_quote := public._cart_quote(v_uid, p_address_id, p_coupon_code);
  v_issue := v_quote -> 'issues' ->> 0;
  if v_issue is not null then
    raise exception '%', split_part(v_issue, ':', 1) using errcode = 'P0001', detail = v_issue;
  end if;

  select * into v_addr from public.addresses where id = p_address_id;
  v_order_number := 'LL' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-'
                    || lpad((nextval('public.order_number_seq') % 1000000)::text, 6, '0');

  insert into public.orders (
    order_number, customer_id, store_id, address_id, delivery_address, delivery_location, delivery_instructions,
    subtotal, delivery_fee, discount, tax, total, coupon_id, payment_method, payment_status, idempotency_key,
    is_demo
  ) values (
    v_order_number, v_uid, (v_quote ->> 'store_id')::uuid, v_addr.id,
    jsonb_build_object('label', v_addr.label, 'contact_name', v_addr.contact_name, 'contact_phone', v_addr.contact_phone,
                       'line1', v_addr.line1, 'line2', v_addr.line2, 'landmark', v_addr.landmark,
                       'locality', v_addr.locality, 'city', v_addr.city, 'state', v_addr.state, 'pincode', v_addr.pincode),
    v_addr.location, left(coalesce(p_instructions, ''), 300),
    (v_quote ->> 'subtotal')::numeric, (v_quote ->> 'delivery_fee')::numeric, (v_quote ->> 'discount')::numeric,
    (v_quote ->> 'tax')::numeric, (v_quote ->> 'total')::numeric, (v_quote ->> 'coupon_id')::uuid,
    p_payment_method, case when p_payment_method = 'test' then 'paid' else 'pending' end::public.payment_status,
    p_idempotency_key,
    (select is_demo from public.stores where id = (v_quote ->> 'store_id')::uuid)
  ) returning id into v_order_id;

  for item in select * from jsonb_array_elements(v_quote -> 'items') loop
    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_label, unit_price, quantity, line_total)
    values (v_order_id, (item ->> 'product_id')::uuid, (item ->> 'variant_id')::uuid, item ->> 'product_name',
            item ->> 'variant_label', (item ->> 'unit_price')::numeric, (item ->> 'quantity')::int,
            (item ->> 'line_total')::numeric);
    update public.inventory set quantity = quantity - (item ->> 'quantity')::int
     where variant_id = (item ->> 'variant_id')::uuid and track_inventory;
  end loop;

  v_bytes := extensions.gen_random_bytes(2);
  insert into public.order_secrets (order_id, delivery_otp)
  values (v_order_id, lpad((((get_byte(v_bytes, 0) << 8) | get_byte(v_bytes, 1)) % 10000)::text, 4, '0'));

  insert into public.payments (order_id, method, amount, status, provider_payment_id, paid_at)
  values (v_order_id, p_payment_method, (v_quote ->> 'total')::numeric,
          case when p_payment_method = 'test' then 'paid' else 'pending' end::public.payment_status,
          case when p_payment_method = 'test' then 'test_' || replace(v_order_id::text, '-', '') end,
          case when p_payment_method = 'test' then now() end);

  if (v_quote ->> 'coupon_id') is not null then
    insert into public.coupon_redemptions (coupon_id, customer_id, order_id, amount)
    values ((v_quote ->> 'coupon_id')::uuid, v_uid, v_order_id, (v_quote ->> 'discount')::numeric);
    update public.coupons set times_used = times_used + 1 where id = (v_quote ->> 'coupon_id')::uuid;
  end if;

  delete from public.cart_items where cart_id = v_cart.id;

  select vendor_id into v_vendor from public.stores where id = (v_quote ->> 'store_id')::uuid;
  perform public.notify(v_uid, 'order_placed', jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number));
  perform public.notify(v_vendor, 'new_order', jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                                                                'total', v_quote ->> 'total'));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                            'total', (v_quote ->> 'total')::numeric, 'duplicate', false);
end $$;

-- ───────────────────────── shared order helpers ─────────────────────────
create or replace function public._restock_order(p_order_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.inventory i set quantity = i.quantity + oi.quantity
    from public.order_items oi
   where oi.order_id = p_order_id and oi.variant_id = i.variant_id and i.track_inventory
$$;

create or replace function public._close_payment_on_cancel(p_order_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.payments
     set status = case when status = 'paid' then 'refunded'::public.payment_status else 'failed'::public.payment_status end,
         failure_reason = coalesce(failure_reason, 'order_closed')
   where order_id = p_order_id and status in ('pending', 'paid');
  update public.orders o
     set payment_status = case when o.payment_status = 'paid' then 'refunded'::public.payment_status
                               else 'failed'::public.payment_status end
   where o.id = p_order_id and o.payment_status in ('pending', 'paid');
$$;

create or replace function public._cancel_open_assignments(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in update public.delivery_assignments set status = 'cancelled', responded_at = coalesce(responded_at, now())
            where order_id = p_order_id and status in ('offered', 'accepted', 'picked_up')
            returning partner_id, status
  loop
    perform public.notify(r.partner_id, 'assignment_cancelled', jsonb_build_object('order_id', p_order_id));
  end loop;
end $$;

create or replace function public._vendor_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('vendor');
  v_order public.orders;
begin
  select o.* into v_order from public.orders o join public.stores s on s.id = o.store_id
   where o.id = p_order_id and s.vendor_id = v_uid
   for update of o;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  return v_order;
end $$;

-- ───────────────────────── customer cancellation ─────────────────────────
create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('customer');
  v_order public.orders;
  v_vendor uuid;
begin
  select * into v_order from public.orders where id = p_order_id and customer_id = v_uid for update;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  -- Customers can cancel freely only before the shop accepts; afterwards via support.
  if v_order.status <> 'placed' then raise exception 'cancel_not_allowed' using errcode = 'P0001'; end if;
  update public.orders set status = 'cancelled', cancel_reason = left(coalesce(p_reason, ''), 300), cancelled_by = v_uid
   where id = p_order_id;
  perform public._restock_order(p_order_id);
  perform public._close_payment_on_cancel(p_order_id);
  select vendor_id into v_vendor from public.stores where id = v_order.store_id;
  perform public.notify(v_vendor, 'order_cancelled', jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number));
end $$;

-- ───────────────────────── vendor order actions ─────────────────────────
create or replace function public.vendor_accept_order(p_order_id uuid, p_prep_minutes integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders := public._vendor_order(p_order_id);
begin
  if p_prep_minutes is null or p_prep_minutes not between 1 and 240 then
    raise exception 'invalid_prep_time' using errcode = 'P0001';
  end if;
  update public.orders set status = 'accepted', prep_time_minutes = p_prep_minutes where id = v_order.id;
  perform public.notify(v_order.customer_id, 'order_accepted',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'prep_minutes', p_prep_minutes));
  -- Start looking for a partner now so they arrive as the order is ready.
  perform public.dispatch_order_internal(v_order.id);
end $$;

create or replace function public.vendor_reject_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders := public._vendor_order(p_order_id);
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.orders set status = 'rejected', rejection_reason = left(trim(p_reason), 300) where id = v_order.id;
  perform public._restock_order(v_order.id);
  perform public._close_payment_on_cancel(v_order.id);
  perform public.notify(v_order.customer_id, 'order_rejected',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'reason', left(trim(p_reason), 300)));
end $$;

create or replace function public.vendor_mark_preparing(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders := public._vendor_order(p_order_id);
begin
  update public.orders set status = 'preparing' where id = v_order.id;
  perform public.notify(v_order.customer_id, 'order_preparing',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
end $$;

create or replace function public.vendor_mark_ready(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders := public._vendor_order(p_order_id);
begin
  update public.orders set status = 'ready_for_pickup' where id = v_order.id;
  perform public.notify(v_order.customer_id, 'order_ready',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
  if not exists (select 1 from public.delivery_assignments
                  where order_id = v_order.id and status in ('offered', 'accepted')) then
    perform public.dispatch_order_internal(v_order.id);
  end if;
end $$;

-- After acceptance (e.g. an item turned out to be unavailable).
create or replace function public.vendor_cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders := public._vendor_order(p_order_id);
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if v_order.status not in ('accepted', 'preparing', 'ready_for_pickup') then
    raise exception 'cancel_not_allowed' using errcode = 'P0001';
  end if;
  update public.orders set status = 'cancelled', cancel_reason = left(trim(p_reason), 300), cancelled_by = auth.uid()
   where id = v_order.id;
  perform public._restock_order(v_order.id);
  perform public._close_payment_on_cancel(v_order.id);
  perform public._cancel_open_assignments(v_order.id);
  perform public.notify(v_order.customer_id, 'order_cancelled',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'reason', left(trim(p_reason), 300)));
end $$;

-- Vendor asks for a partner manually (e.g. offers expired with nobody accepting).
create or replace function public.vendor_request_delivery(p_order_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_order public.orders := public._vendor_order(p_order_id);
begin
  if v_order.status not in ('accepted', 'preparing', 'ready_for_pickup') then
    raise exception 'dispatch_not_allowed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.delivery_assignments where order_id = v_order.id and status in ('accepted', 'picked_up')) then
    raise exception 'already_assigned' using errcode = 'P0001';
  end if;
  return public.dispatch_order_internal(v_order.id);
end $$;
