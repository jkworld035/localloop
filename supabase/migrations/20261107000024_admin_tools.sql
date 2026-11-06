-- LocalLoop · 0024 · delivery-area editor and admin team management

-- ───────────────────────── delivery areas ─────────────────────────
-- Areas with plain coordinates and GeoJSON for the map editor, plus how many
-- shops each one covers.
create or replace function public.admin_areas()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public._require_admin('areas');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'city', a.city, 'state', a.state, 'is_active', a.is_active,
      'latitude', st_y(a.center::geometry), 'longitude', st_x(a.center::geometry), 'radius_km', a.radius_km,
      'boundary', case when a.boundary is null then null else st_asgeojson(a.boundary::geometry, 6)::jsonb end,
      'area_km2', round((coalesce(st_area(a.boundary), pi() * (a.radius_km * 1000) ^ 2) / 1e6)::numeric, 1),
      'stores_total', (select count(*) from public.stores s where s.serviceable_area_id = a.id),
      'stores_live', (select count(*) from public.stores s where s.serviceable_area_id = a.id and s.status = 'approved'),
      'updated_at', a.updated_at
    ) order by a.name)
    from public.serviceable_areas a), '[]');
end $$;

-- Shops to show on the editor map (all statuses), with their current area.
create or replace function public.admin_store_points()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public._require_admin('areas');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status, 'area_id', s.serviceable_area_id,
                                        'latitude', st_y(s.location::geometry), 'longitude', st_x(s.location::geometry)))
    from public.stores s where not s.is_demo), '[]');
end $$;

-- Creates or updates an area. A drawn boundary (GeoJSON Polygon or
-- MultiPolygon) takes precedence over centre + radius. Shops are re-assigned
-- to whichever area now contains them. Returns the area id and how many shops
-- moved in or out.
create or replace function public.admin_save_area(
  p_id uuid, p_name text, p_city text, p_state text,
  p_lat double precision, p_lng double precision, p_radius_km numeric,
  p_boundary jsonb default null, p_is_active boolean default false
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := p_id;
  v_geom geometry;
  v_boundary geography;
  v_before jsonb;
  v_moved integer;
begin
  perform public._require_admin('areas');
  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(trim(coalesce(p_city, ''))) < 2 then
    raise exception 'invalid_area' using errcode = 'P0001', detail = 'name';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 6 and 38 or p_lng not between 68 and 98 then
    raise exception 'invalid_area' using errcode = 'P0001', detail = 'centre must be in India';
  end if;
  if p_radius_km is null or p_radius_km <= 0 or p_radius_km > 100 then
    raise exception 'invalid_area' using errcode = 'P0001', detail = 'radius';
  end if;

  if p_boundary is not null and p_boundary <> 'null'::jsonb then
    begin
      v_geom := st_setsrid(st_geomfromgeojson(p_boundary::text), 4326);
    exception when others then
      raise exception 'invalid_area' using errcode = 'P0001', detail = 'boundary is not valid GeoJSON';
    end;
    if geometrytype(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
      raise exception 'invalid_area' using errcode = 'P0001', detail = 'boundary must be a polygon';
    end if;
    if not st_isvalid(v_geom) then
      raise exception 'invalid_area' using errcode = 'P0001', detail = 'boundary lines cross each other';
    end if;
    v_boundary := st_multi(v_geom)::geography;
    if st_area(v_boundary) > 5000e6 then
      raise exception 'invalid_area' using errcode = 'P0001', detail = 'boundary is larger than 5,000 km²';
    end if;
  end if;

  if v_id is null then
    insert into public.serviceable_areas (name, city, state, center, radius_km, boundary, is_active)
    values (trim(p_name), trim(p_city), trim(coalesce(nullif(p_state, ''), 'Telangana')), public._point(p_lat, p_lng),
            p_radius_km, v_boundary, coalesce(p_is_active, false))
    returning id into v_id;
  else
    select to_jsonb(a) - 'center' - 'boundary' into v_before from public.serviceable_areas a where id = v_id for update;
    if v_before is null then raise exception 'invalid_area' using errcode = 'P0001', detail = 'not found'; end if;
    update public.serviceable_areas
       set name = trim(p_name), city = trim(p_city), state = trim(coalesce(nullif(p_state, ''), 'Telangana')),
           center = public._point(p_lat, p_lng), radius_km = p_radius_km, boundary = v_boundary,
           is_active = coalesce(p_is_active, false)
     where id = v_id;
  end if;

  -- Shops follow the new shape.
  with moved as (
    update public.stores s set serviceable_area_id = public.area_for_point(s.location)
     where s.serviceable_area_id is distinct from public.area_for_point(s.location)
    returning 1)
  select count(*) into v_moved from moved;

  perform public._audit(case when p_id is null then 'create_area' else 'update_area' end, 'serviceable_areas', v_id::text, v_before,
    jsonb_build_object('name', p_name, 'radius_km', p_radius_km, 'has_boundary', v_boundary is not null,
                       'is_active', p_is_active, 'stores_moved', v_moved));
  return jsonb_build_object('id', v_id, 'stores_moved', v_moved,
    'stores_inside', (select count(*) from public.stores where serviceable_area_id = v_id));
end $$;

-- ───────────────────────── admin team ─────────────────────────
alter table public.admin_users add column must_change_password boolean not null default false;

create or replace function public.admin_team()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin('admins');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', au.id, 'admin_role', au.admin_role, 'name', p.full_name, 'email', p.email, 'is_active', p.is_active,
      'must_change_password', au.must_change_password, 'granted_by', g.full_name, 'created_at', au.created_at,
      'is_me', au.id = auth.uid()
    ) order by au.created_at)
    from public.admin_users au join public.profiles p on p.id = au.id
    left join public.profiles g on g.id = au.granted_by), '[]');
end $$;

-- Gives an existing account admin access (or changes the role). Vendors and
-- partners can't be turned into admins — their shop or deliveries would break —
-- and neither can customers who already have orders; use a separate email.
-- p_role null removes admin access. Nobody can change their own role, so at
-- least one super admin always remains.
create or replace function public.admin_grant_role(p_user_id uuid, p_role public.admin_role, p_name text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles;
begin
  perform public._require_admin('admins');
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile.id is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if p_role is not null and v_profile.role in ('vendor', 'delivery_partner') then
    raise exception 'role_conflict' using errcode = 'P0001';
  end if;
  if p_role is not null and v_profile.role = 'customer' and exists (select 1 from public.orders where customer_id = p_user_id) then
    raise exception 'role_conflict' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_name, ''))) >= 2 and v_profile.full_name is null then
    update public.profiles set full_name = left(trim(p_name), 80) where id = p_user_id;
  end if;
  perform public.admin_set_admin_role(p_user_id, p_role);
end $$;

-- Signed-in admin: first-login password change done.
create or replace function public.admin_password_changed()
returns void language sql security definer set search_path = public as $$
  update public.admin_users set must_change_password = false where id = auth.uid();
$$;

-- ───────────────────────── privileges ─────────────────────────
revoke execute on function public.admin_areas(), public.admin_store_points(),
  public.admin_save_area(uuid, text, text, text, double precision, double precision, numeric, jsonb, boolean),
  public.admin_team(), public.admin_grant_role(uuid, public.admin_role, text), public.admin_password_changed()
  from public, anon;
grant execute on function public.admin_areas(), public.admin_store_points(),
  public.admin_save_area(uuid, text, text, text, double precision, double precision, numeric, jsonb, boolean),
  public.admin_team(), public.admin_grant_role(uuid, public.admin_role, text), public.admin_password_changed()
  to authenticated;
