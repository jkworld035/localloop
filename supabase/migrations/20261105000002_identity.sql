-- LocalLoop · 0002 · identity, roles, areas, settings

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── serviceable areas ─────────────────────────
-- Admin-managed launch markets. A store is listable only inside an active area.
create table public.serviceable_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null,
  center extensions.geography(Point, 4326) not null,
  radius_km numeric(5,2) not null check (radius_km > 0 and radius_km <= 100),
  -- Optional precise boundary; when present it overrides center+radius.
  boundary extensions.geography(MultiPolygon, 4326),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, state)
);
create index serviceable_areas_center_gix on public.serviceable_areas using gist (center);
create index serviceable_areas_boundary_gix on public.serviceable_areas using gist (boundary);
create trigger serviceable_areas_updated before update on public.serviceable_areas
  for each row execute function public.set_updated_at();

-- ───────────────────────── app settings ─────────────────────────
-- Commercial and operational parameters. Nothing commercial is hardcoded in
-- application code; it is read from here.
create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text not null default '',
  is_public boolean not null default false, -- readable by apps (e.g. fee rules shown at checkout)
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated before update on public.app_settings
  for each row execute function public.set_updated_at();

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function public.setting_num(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::numeric from public.app_settings where key = p_key
$$;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role, -- null until the user picks a role in onboarding (choose_role RPC)
  full_name text check (char_length(full_name) between 2 and 80),
  phone text unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  avatar_path text,
  preferred_language public.app_language not null default 'en',
  is_active boolean not null default true,
  location_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile when Supabase Auth creates a user (phone OTP sign-up).
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
begin
  v_phone := case
    when new.phone is null or new.phone = '' then null
    when new.phone like '+%' then new.phone
    else '+' || new.phone
  end;
  insert into public.profiles (id, phone, email)
  values (new.id, v_phone, nullif(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ───────────────────────── role tables ─────────────────────────
create table public.customers (
  id uuid primary key references public.profiles (id) on delete cascade,
  default_address_id uuid, -- FK added after addresses exists
  created_at timestamptz not null default now()
);

create table public.admin_users (
  id uuid primary key references public.profiles (id) on delete cascade,
  admin_role public.admin_role not null,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key references public.profiles (id) on delete cascade,
  owner_name text not null check (char_length(owner_name) between 2 and 80),
  business_name text not null check (char_length(business_name) between 2 and 120),
  business_category_id uuid, -- FK added in catalog migration
  -- GSTIN is optional: many small shops are below the registration threshold.
  gstin text unique check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  status public.verification_status not null default 'pending',
  status_reason text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  plan public.vendor_plan not null default 'free',
  -- null → platform default from app_settings.commission_rate_default
  commission_rate_override numeric(5,4) check (commission_rate_override between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendors_status_idx on public.vendors (status);
create trigger vendors_updated before update on public.vendors
  for each row execute function public.set_updated_at();

create table public.delivery_partners (
  id uuid primary key references public.profiles (id) on delete cascade,
  vehicle_type public.vehicle_type not null,
  vehicle_registration text check (vehicle_registration is null or vehicle_registration ~ '^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$'),
  driving_licence text check (driving_licence is null or driving_licence ~ '^[A-Z]{2}[0-9]{13}$'),
  status public.verification_status not null default 'pending',
  status_reason text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  is_online boolean not null default false,
  current_location extensions.geography(Point, 4326),
  current_location_accuracy_m real,
  current_location_at timestamptz,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  -- Reference to a record held by the payout provider (e.g. RazorpayX fund
  -- account id). Raw bank account numbers are never stored here.
  payout_account_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motorised_needs_documents check (
    vehicle_type = 'bicycle' or (vehicle_registration is not null and driving_licence is not null)
  ),
  constraint online_requires_approval check (not is_online or status = 'approved')
);
create index delivery_partners_location_gix on public.delivery_partners using gist (current_location)
  where is_online;
create trigger delivery_partners_updated before update on public.delivery_partners
  for each row execute function public.set_updated_at();

-- ───────────────────────── addresses ─────────────────────────
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 30),
  contact_name text not null check (char_length(contact_name) between 2 and 80),
  contact_phone text not null check (contact_phone ~ '^\+91[6-9][0-9]{9}$'),
  line1 text not null check (char_length(line1) between 3 and 160),
  line2 text not null default '',
  landmark text not null default '',
  locality text not null,
  city text not null,
  state text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  location extensions.geography(Point, 4326) not null,
  is_default boolean not null default false,
  deleted_at timestamptz, -- soft delete: old orders keep their snapshot, list hides it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id) where deleted_at is null;
create unique index addresses_one_default on public.addresses (user_id) where is_default and deleted_at is null;
create trigger addresses_updated before update on public.addresses
  for each row execute function public.set_updated_at();

-- Keep exactly one default when the user marks a new one.
create or replace function public.addresses_single_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_default and new.deleted_at is null then
    update public.addresses set is_default = false
     where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end $$;
create trigger addresses_single_default before insert or update of is_default on public.addresses
  for each row execute function public.addresses_single_default();

alter table public.customers
  add constraint customers_default_address_fk foreign key (default_address_id)
  references public.addresses (id) on delete set null;

-- ───────────────────────── push tokens ─────────────────────────
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
