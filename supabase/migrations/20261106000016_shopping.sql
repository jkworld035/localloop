-- LocalLoop · 0016 · shopping flow helpers (Phase 2)

-- Everything the shop page header needs in one call, relative to the
-- customer's location when given. Visible only for public shops (or to the
-- owning vendor / admins).
create or replace function public.store_summary(
  p_store_id uuid, p_lat double precision default null, p_lng double precision default null
) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s public.stores;
  v_here geography;
  v_dist double precision;
  v_est int4range;
  v_today text := lower(to_char(now() at time zone 'Asia/Kolkata', 'Dy'));
begin
  select * into s from public.stores where id = p_store_id;
  if s.id is null or not (public.store_is_public(s.id) or coalesce(s.vendor_id = auth.uid(), false) or public.admin_can('stores')) then
    raise exception 'store_unavailable' using errcode = 'P0001';
  end if;
  if p_lat is not null and p_lng is not null then
    v_here := public._point(p_lat, p_lng);
    v_dist := st_distance(s.location, v_here);
    v_est := public.estimate_delivery_minutes(v_dist, s.avg_prep_minutes);
  end if;
  return jsonb_build_object(
    'id', s.id, 'name', s.name, 'name_te', s.name_te, 'description', s.description,
    'locality', s.locality, 'city', s.city, 'logo_path', s.logo_path, 'cover_path', s.cover_path,
    'category', (select jsonb_build_object('name_en', c.name_en, 'name_te', c.name_te) from public.categories c where c.id = s.category_id),
    'is_open', public.is_open_at(s.opening_hours, s.timezone, now()),
    'is_accepting_orders', s.is_accepting_orders,
    'today_hours', coalesce(s.opening_hours -> v_today, '[]'::jsonb),
    'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
    'min_order_value', s.min_order_value,
    'distance_m', case when v_dist is not null then round(v_dist)::int end,
    'delivers_here', case when v_dist is not null then v_dist <= s.delivery_radius_km * 1000 end,
    'est_minutes_min', lower(v_est), 'est_minutes_max', upper(v_est) - 1
  );
end $$;

grant execute on function public.store_summary(uuid, double precision, double precision) to anon, authenticated;

-- Set one address as default and record it on the customer row in one step.
create or replace function public.set_default_address(p_address_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_role('customer');
begin
  update public.addresses set is_default = true
   where id = p_address_id and user_id = v_uid and deleted_at is null;
  if not found then raise exception 'address_not_found' using errcode = 'P0001'; end if;
  update public.customers set default_address_id = p_address_id where id = v_uid;
end $$;

grant execute on function public.set_default_address(uuid) to authenticated;
