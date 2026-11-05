-- LocalLoop · 0005 · delivery assignments, live locations, routes

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  partner_id uuid not null references public.delivery_partners (id),
  status public.assignment_status not null default 'offered',
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  offer_distance_m integer, -- straight-line partner→store at offer time (dispatch ranking only)
  -- Live tracking snapshot, written by update_driver_location() and the
  -- compute-eta edge function. Customers read this row (via RLS) only while
  -- their order is picked_up; the row stops being visible once delivered.
  last_location extensions.geography(Point, 4326),
  last_location_accuracy_m real,
  last_heading real,
  last_location_at timestamptz,
  route_polyline text,
  remaining_distance_m integer, -- road distance from the routing provider
  eta_seconds integer, -- duration from the routing provider at eta_computed_at
  eta_computed_at timestamptz,
  eta_traffic_aware boolean,
  eta_origin extensions.geography(Point, 4326), -- partner position the route was computed from
  delivered_location extensions.geography(Point, 4326),
  earning numeric(10,2), -- partner payout for this delivery (from app_settings at completion)
  approaching_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A partner holds at most one open offer per order (an expired offer may be re-sent).
create unique index delivery_assignments_one_open_offer
  on public.delivery_assignments (order_id, partner_id) where status = 'offered';
-- The hard guarantee against double assignment: at most one live assignment per order.
create unique index delivery_assignments_one_active_per_order
  on public.delivery_assignments (order_id) where status in ('accepted', 'picked_up', 'delivered');
create index delivery_assignments_partner_idx on public.delivery_assignments (partner_id, status);
create index delivery_assignments_open_offers_idx on public.delivery_assignments (expires_at) where status = 'offered';
create trigger delivery_assignments_updated before update on public.delivery_assignments
  for each row execute function public.set_updated_at();

-- Location history for active deliveries (support/dispute evidence, admin
-- replay). Retention is bounded by app_settings.location_retention_days.
create table public.driver_locations (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.delivery_partners (id) on delete cascade,
  assignment_id uuid references public.delivery_assignments (id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  heading real check (heading is null or heading between 0 and 360),
  speed_mps real check (speed_mps is null or speed_mps >= 0),
  recorded_at timestamptz not null, -- device fix time
  received_at timestamptz not null default now()
);
create index driver_locations_assignment_idx on public.driver_locations (assignment_id, recorded_at);
create index driver_locations_partner_time_idx on public.driver_locations (partner_id, recorded_at desc);
create index driver_locations_received_brin on public.driver_locations using brin (received_at);

-- Every routing API call we pay for, kept for cost monitoring and debugging.
create table public.delivery_routes (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references public.delivery_assignments (id) on delete cascade,
  leg public.route_leg not null,
  origin extensions.geography(Point, 4326) not null,
  destination extensions.geography(Point, 4326) not null,
  distance_m integer not null check (distance_m >= 0),
  duration_s integer not null check (duration_s >= 0),
  polyline text,
  traffic_aware boolean not null,
  travel_mode text not null,
  provider text not null,
  reason text not null, -- why we recomputed: initial | moved | interval | status_change | off_route
  computed_at timestamptz not null default now()
);
create index delivery_routes_assignment_idx on public.delivery_routes (assignment_id, computed_at desc);
