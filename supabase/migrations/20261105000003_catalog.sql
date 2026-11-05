-- LocalLoop · 0003 · categories, stores, products, inventory, verification documents

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  kind public.category_kind not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en text not null,
  name_te text not null,
  icon text, -- icon key resolved by the apps
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_kind_idx on public.categories (kind, sort_order) where is_active;
create trigger categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.vendors
  add constraint vendors_business_category_fk foreign key (business_category_id)
  references public.categories (id) on delete set null;

-- ───────────────────────── opening hours ─────────────────────────
-- Shape: {"mon":[{"open":"09:00","close":"21:00"}], ..., "sun":[]}
-- A range whose close is earlier than open runs past midnight.
create or replace function public.valid_opening_hours(h jsonb) returns boolean
language plpgsql immutable as $$
declare
  d text;
  r jsonb;
begin
  if jsonb_typeof(h) <> 'object' then return false; end if;
  foreach d in array array['mon','tue','wed','thu','fri','sat','sun'] loop
    if not (h ? d) or jsonb_typeof(h -> d) <> 'array' or jsonb_array_length(h -> d) > 3 then
      return false;
    end if;
    for r in select * from jsonb_array_elements(h -> d) loop
      if coalesce(r ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(r ->> 'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or r ->> 'open' = r ->> 'close' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.is_open_at(h jsonb, tz text, at timestamptz) returns boolean
language plpgsql stable as $$
declare
  local_ts timestamp := at at time zone tz;
  today text := lower(to_char(local_ts, 'Dy'));
  yesterday text := lower(to_char(local_ts - interval '1 day', 'Dy'));
  t time := local_ts::time;
  r jsonb;
begin
  -- today's ranges
  for r in select * from jsonb_array_elements(coalesce(h -> today, '[]'::jsonb)) loop
    if (r->>'open')::time < (r->>'close')::time then
      if t >= (r->>'open')::time and t < (r->>'close')::time then return true; end if;
    elsif t >= (r->>'open')::time then -- overnight range, before midnight part
      return true;
    end if;
  end loop;
  -- yesterday's overnight ranges spilling past midnight
  for r in select * from jsonb_array_elements(coalesce(h -> yesterday, '[]'::jsonb)) loop
    if (r->>'open')::time > (r->>'close')::time and t < (r->>'close')::time then return true; end if;
  end loop;
  return false;
end $$;

-- ───────────────────────── stores ─────────────────────────
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  name_te text not null default '',
  description text not null default '' check (char_length(description) <= 1000),
  category_id uuid not null references public.categories (id),
  phone text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  address_line text not null,
  locality text not null,
  city text not null,
  state text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  location extensions.geography(Point, 4326) not null,
  serviceable_area_id uuid references public.serviceable_areas (id),
  timezone text not null default 'Asia/Kolkata',
  opening_hours jsonb not null check (public.valid_opening_hours(opening_hours)),
  delivery_radius_km numeric(4,1) not null default 5 check (delivery_radius_km between 0.5 and 25),
  min_order_value numeric(10,2) not null default 0 check (min_order_value >= 0),
  avg_prep_minutes integer not null default 15 check (avg_prep_minutes between 5 and 180),
  is_accepting_orders boolean not null default true, -- vendor's own pause switch
  status public.verification_status not null default 'pending',
  status_reason text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  logo_path text,
  cover_path text,
  is_featured boolean not null default false,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  is_demo boolean not null default false, -- demo rows are never visible in production queries
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stores_location_gix on public.stores using gist (location);
create index stores_vendor_idx on public.stores (vendor_id);
create index stores_status_idx on public.stores (status);
create index stores_name_trgm on public.stores using gin (name extensions.gin_trgm_ops);
create index stores_name_te_trgm on public.stores using gin (name_te extensions.gin_trgm_ops);
create trigger stores_updated before update on public.stores
  for each row execute function public.set_updated_at();

-- Attach a store to the serviceable area that contains it.
create or replace function public.area_for_point(p extensions.geography) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select a.id from public.serviceable_areas a
   where (a.boundary is not null and st_covers(a.boundary, p))
      or (a.boundary is null and st_dwithin(a.center, p, a.radius_km * 1000))
   order by st_distance(a.center, p)
   limit 1
$$;

create or replace function public.stores_assign_area() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.location is distinct from old.location then
    new.serviceable_area_id := public.area_for_point(new.location);
  end if;
  return new;
end $$;
create trigger stores_assign_area before insert or update of location on public.stores
  for each row execute function public.stores_assign_area();

-- Vendors may edit their store, but moderation fields are admin-only and a
-- material change (location) sends the store back to review.
create or replace function public.stores_guard_vendor_update() returns trigger
language plpgsql as $$
begin
  -- Direct client writes run as the `authenticated` role; trusted SECURITY
  -- DEFINER functions (admin RPCs, rating triggers) run as the owner.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status is distinct from old.status or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at or new.is_featured is distinct from old.is_featured
     or new.rating_avg is distinct from old.rating_avg or new.rating_count is distinct from old.rating_count
     or new.vendor_id is distinct from old.vendor_id or new.is_demo is distinct from old.is_demo
     or new.status_reason is distinct from old.status_reason then
    raise exception 'Only administrators can change moderation fields' using errcode = '42501';
  end if;
  if old.status = 'approved' and new.location is distinct from old.location then
    new.status := 'pending';
    new.status_reason := 'Location changed — awaiting re-verification';
  end if;
  return new;
end $$;
create trigger stores_guard_vendor_update before update on public.stores
  for each row execute function public.stores_guard_vendor_update();

-- ───────────────────────── products ─────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  name text not null check (char_length(name) between 2 and 120),
  name_te text not null default '',
  description text not null default '' check (char_length(description) <= 2000),
  is_available boolean not null default true, -- vendor toggle ("out of stock" for untracked items)
  is_active boolean not null default true, -- soft delete (order history keeps references)
  search tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(name_te, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_store_idx on public.products (store_id) where is_active;
create index products_category_idx on public.products (category_id) where is_active;
create index products_search_idx on public.products using gin (search);
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create index products_name_te_trgm on public.products using gin (name_te extensions.gin_trgm_ops);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40), -- "500 g", "1 L", "Pack of 6"
  unit public.product_unit not null,
  unit_quantity numeric(10,3) not null check (unit_quantity > 0),
  price numeric(10,2) not null check (price > 0),
  sale_price numeric(10,2) check (sale_price is null or (sale_price > 0 and sale_price < price)),
  sku text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, label)
);
create index product_variants_product_idx on public.product_variants (product_id) where is_active;
create unique index product_variants_one_default on public.product_variants (product_id) where is_default and is_active;
create trigger product_variants_updated before update on public.product_variants
  for each row execute function public.set_updated_at();

create table public.inventory (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  track_inventory boolean not null default true, -- false: made-to-order / unlimited
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);
create index inventory_store_idx on public.inventory (store_id);
create index inventory_low_stock_idx on public.inventory (store_id) where track_inventory and quantity <= low_stock_threshold;
create trigger inventory_updated before update on public.inventory
  for each row execute function public.set_updated_at();

-- inventory.store_id must match the variant's product's store.
create or replace function public.inventory_check_store() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.product_variants v join public.products p on p.id = v.product_id
     where v.id = new.variant_id and p.store_id = new.store_id
  ) then
    raise exception 'Inventory store does not match product store' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger inventory_check_store before insert or update of store_id, variant_id on public.inventory
  for each row execute function public.inventory_check_store();

-- Every new variant gets an inventory row.
create or replace function public.variant_create_inventory() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory (variant_id, store_id)
  select new.id, p.store_id from public.products p where p.id = new.product_id
  on conflict (variant_id) do nothing;
  return new;
end $$;
create trigger variant_create_inventory after insert on public.product_variants
  for each row execute function public.variant_create_inventory();

-- ───────────────────────── verification documents ─────────────────────────
create table public.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'gst_certificate', 'trade_licence', 'fssai_licence', 'shop_establishment', 'pan_card', 'udyam_certificate', 'other'
  )),
  storage_path text not null, -- private bucket `vendor-documents`
  status public.document_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index vendor_documents_vendor_idx on public.vendor_documents (vendor_id);

create table public.delivery_documents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.delivery_partners (id) on delete cascade,
  doc_type text not null check (doc_type in ('driving_licence', 'vehicle_rc', 'id_proof', 'profile_photo')),
  storage_path text not null, -- private bucket `partner-documents`
  status public.document_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index delivery_documents_partner_idx on public.delivery_documents (partner_id);
