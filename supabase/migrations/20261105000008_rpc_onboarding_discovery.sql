-- LocalLoop · 0008 · onboarding and discovery RPCs
--
-- Error convention: functions raise SQLSTATE P0001 with a snake_case message
-- code (e.g. 'out_of_stock'). Apps translate `errors.<code>` in the user's
-- language; anything unrecognised falls back to a generic message.

create or replace function public._point(p_lat double precision, p_lng double precision)
returns extensions.geography language plpgsql immutable set search_path = public, extensions as $$
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_coordinates' using errcode = 'P0001';
  end if;
  return st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
end $$;

create or replace function public._require_user() returns uuid
language plpgsql stable set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = v and is_active) then
    raise exception 'account_inactive' using errcode = 'P0001';
  end if;
  return v;
end $$;

create or replace function public._require_role(p_role public.app_role) returns uuid
language plpgsql stable set search_path = public as $$
declare v uuid := public._require_user();
begin
  if public.current_app_role() is distinct from p_role then
    raise exception 'wrong_role' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- ───────────────────────── onboarding ─────────────────────────

-- One-time role selection right after the first OTP sign-in. Admin can never
-- be self-selected.
create or replace function public.choose_role(p_role public.app_role)
returns public.app_role language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_user();
  v_current public.app_role;
begin
  if p_role = 'admin' then
    raise exception 'role_not_allowed' using errcode = 'P0001';
  end if;
  select role into v_current from public.profiles where id = v_uid for update;
  if v_current is not null and v_current <> p_role then
    raise exception 'role_already_set' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = v_uid;
  if p_role = 'customer' then
    insert into public.customers (id) values (v_uid) on conflict do nothing;
  end if;
  return p_role;
end $$;

create or replace function public.register_vendor(
  p_owner_name text, p_business_name text, p_business_category_id uuid,
  p_gstin text default null, p_email text default null
) returns public.vendors language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('vendor');
  v_row public.vendors;
begin
  if p_business_category_id is not null and not exists (
    select 1 from public.categories where id = p_business_category_id and kind = 'store' and is_active) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;
  update public.profiles
     set full_name = coalesce(nullif(trim(p_owner_name), ''), full_name),
         email = coalesce(nullif(lower(trim(p_email)), ''), email)
   where id = v_uid;

  insert into public.vendors (id, owner_name, business_name, business_category_id, gstin)
  values (v_uid, trim(p_owner_name), trim(p_business_name), p_business_category_id, nullif(upper(trim(p_gstin)), ''))
  on conflict (id) do update
    set owner_name = excluded.owner_name,
        business_name = excluded.business_name,
        business_category_id = excluded.business_category_id,
        gstin = excluded.gstin,
        -- resubmission after rejection goes back to the review queue
        status = case when public.vendors.status = 'rejected' then 'pending' else public.vendors.status end
    where public.vendors.status in ('pending', 'rejected')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'vendor_locked' using errcode = 'P0001',
      detail = 'Approved or suspended vendors change details from the profile screen';
  end if;
  return v_row;
end $$;

create or replace function public.register_delivery_partner(
  p_full_name text, p_vehicle_type public.vehicle_type,
  p_vehicle_registration text default null, p_driving_licence text default null, p_email text default null
) returns public.delivery_partners language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('delivery_partner');
  v_row public.delivery_partners;
begin
  update public.profiles
     set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
         email = coalesce(nullif(lower(trim(p_email)), ''), email)
   where id = v_uid;

  insert into public.delivery_partners (id, vehicle_type, vehicle_registration, driving_licence)
  values (v_uid, p_vehicle_type,
          nullif(regexp_replace(upper(coalesce(p_vehicle_registration, '')), '[\s-]', '', 'g'), ''),
          nullif(regexp_replace(upper(coalesce(p_driving_licence, '')), '[\s-]', '', 'g'), ''))
  on conflict (id) do update
    set vehicle_type = excluded.vehicle_type,
        vehicle_registration = excluded.vehicle_registration,
        driving_licence = excluded.driving_licence,
        status = case when public.delivery_partners.status = 'rejected' then 'pending' else public.delivery_partners.status end
    where public.delivery_partners.status in ('pending', 'rejected')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'partner_locked' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

-- ───────────────────────── store discovery ─────────────────────────

-- Approximate delivery window for listings: prep time + road-adjusted travel.
-- This is a listing estimate only (labelled "approx." in the UI). Live
-- tracking ETA always comes from the routing provider.
create or replace function public.estimate_delivery_minutes(p_distance_m double precision, p_prep_minutes integer)
returns int4range language sql stable security definer set search_path = public as $$
  with p as (
    select coalesce(public.setting_num('listing_road_factor'), 1.4) as road_factor,
           coalesce(public.setting_num('listing_avg_speed_kmph'), 18) as speed
  ), t as (
    select p_prep_minutes + ceil((p_distance_m * road_factor / 1000.0) / speed * 60)::int as mid from p
  )
  select int4range(greatest(mid - 3, 5), mid + 7, '[]') from t
$$;

create or replace function public.nearby_stores(
  p_lat double precision,
  p_lng double precision,
  p_radius_km numeric default 5,
  p_category_id uuid default null,
  p_open_now boolean default false,
  p_sort text default 'distance', -- distance | rating | fastest
  p_query text default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  id uuid, name text, name_te text, category_id uuid, category_name_en text, category_name_te text,
  logo_path text, cover_path text, locality text, latitude double precision, longitude double precision,
  distance_m integer, is_open boolean, is_accepting_orders boolean, delivers_here boolean,
  rating_avg numeric, rating_count integer, min_order_value numeric,
  est_minutes_min integer, est_minutes_max integer, opening_hours jsonb, is_featured boolean
) language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_here geography := public._point(p_lat, p_lng);
  v_radius_m double precision := least(greatest(coalesce(p_radius_km, 5), 0.5), 50) * 1000;
begin
  return query
  with candidates as (
    select s.*, st_distance(s.location, v_here) as dist,
           public.is_open_at(s.opening_hours, s.timezone, now()) as open_now
      from public.stores s
      join public.vendors v on v.id = s.vendor_id and v.status = 'approved'
      join public.serviceable_areas a on a.id = s.serviceable_area_id and a.is_active
     where s.status = 'approved'
       and (not s.is_demo or public.demo_data_visible())
       and st_dwithin(s.location, v_here, v_radius_m)
       and (p_category_id is null or s.category_id = p_category_id)
       and (p_query is null or s.name ilike '%' || p_query || '%' or s.name_te ilike '%' || p_query || '%')
  )
  select c.id, c.name, c.name_te, c.category_id, cat.name_en, cat.name_te,
         c.logo_path, c.cover_path, c.locality,
         st_y(c.location::geometry), st_x(c.location::geometry),
         round(c.dist)::int, c.open_now, c.is_accepting_orders,
         c.dist <= c.delivery_radius_km * 1000,
         c.rating_avg, c.rating_count, c.min_order_value,
         lower(r.est), upper(r.est) - 1, c.opening_hours, c.is_featured
    from candidates c
    join public.categories cat on cat.id = c.category_id
    cross join lateral (select public.estimate_delivery_minutes(c.dist, c.avg_prep_minutes) as est) r
   where (not p_open_now or (c.open_now and c.is_accepting_orders))
   order by
     case when p_sort = 'rating' then c.rating_avg end desc nulls last,
     case when p_sort = 'fastest' then lower(r.est) end asc,
     c.dist asc
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

-- Product search across nearby public stores (English or Telugu names).
create or replace function public.search_products(
  p_lat double precision,
  p_lng double precision,
  p_query text,
  p_radius_km numeric default 10,
  p_category_id uuid default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_in_stock_only boolean default true,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  product_id uuid, product_name text, product_name_te text, store_id uuid, store_name text,
  distance_m integer, variant_id uuid, variant_label text, price numeric, sale_price numeric,
  in_stock boolean, image_path text, store_is_open boolean
) language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_here geography := public._point(p_lat, p_lng);
  v_q text := nullif(trim(p_query), '');
begin
  if v_q is null or char_length(v_q) < 2 then
    raise exception 'query_too_short' using errcode = 'P0001';
  end if;
  return query
  select p.id, p.name, p.name_te, s.id, s.name, round(st_distance(s.location, v_here))::int,
         pv.id, pv.label, pv.price, pv.sale_price,
         (p.is_available and (not i.track_inventory or i.quantity > 0)),
         (select pi.storage_path from public.product_images pi where pi.product_id = p.id order by pi.sort_order limit 1),
         public.is_open_at(s.opening_hours, s.timezone, now())
    from public.products p
    join public.stores s on s.id = p.store_id and s.status = 'approved'
    join public.vendors v on v.id = s.vendor_id and v.status = 'approved'
    join public.serviceable_areas a on a.id = s.serviceable_area_id and a.is_active
    join lateral (
      select * from public.product_variants x
       where x.product_id = p.id and x.is_active
       order by x.is_default desc, coalesce(x.sale_price, x.price) asc limit 1
    ) pv on true
    join public.inventory i on i.variant_id = pv.id
   where p.is_active
     and (not s.is_demo or public.demo_data_visible())
     and st_dwithin(s.location, v_here, least(greatest(coalesce(p_radius_km, 10), 0.5), 50) * 1000)
     and (p.name ilike '%' || v_q || '%' or p.name_te ilike '%' || v_q || '%'
          or p.search @@ plainto_tsquery('simple', v_q)
          or similarity(p.name, v_q) > 0.3)
     and (p_category_id is null or p.category_id = p_category_id)
     and (p_min_price is null or coalesce(pv.sale_price, pv.price) >= p_min_price)
     and (p_max_price is null or coalesce(pv.sale_price, pv.price) <= p_max_price)
     and (not p_in_stock_only or (p.is_available and (not i.track_inventory or i.quantity > 0)))
   order by greatest(similarity(p.name, v_q), similarity(p.name_te, v_q)) desc, st_distance(s.location, v_here)
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

-- Which serviceable area (if any) covers a point — used by the location
-- screen to tell customers whether LocalLoop delivers there yet.
create or replace function public.area_status(p_lat double precision, p_lng double precision)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select jsonb_build_object('serviceable', a.is_active, 'area_id', a.id, 'area_name', a.name, 'city', a.city)
       from public.serviceable_areas a
      where a.id = public.area_for_point(public._point(p_lat, p_lng))),
    jsonb_build_object('serviceable', false)
  )
$$;
