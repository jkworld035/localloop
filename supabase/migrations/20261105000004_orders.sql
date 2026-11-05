-- LocalLoop · 0004 · carts, coupons, orders, payments, commissions

-- ───────────────────────── carts ─────────────────────────
-- One active cart per customer, bound to a single store (single-vendor
-- checkout for the initial release; the order model already carries store_id
-- per order so multi-store baskets can later split into several orders).
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger carts_updated before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);
create index cart_items_cart_idx on public.cart_items (cart_id);
create trigger cart_items_updated before update on public.cart_items
  for each row execute function public.set_updated_at();

create or replace function public.cart_items_same_store() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.carts c
      join public.product_variants v on v.id = new.variant_id
      join public.products p on p.id = v.product_id
     where c.id = new.cart_id and p.store_id = c.store_id
  ) then
    raise exception 'Cart items must come from the cart''s store' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger cart_items_same_store before insert or update of variant_id, cart_id on public.cart_items
  for each row execute function public.cart_items_same_store();

-- ───────────────────────── coupons ─────────────────────────
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
  description text not null default '',
  discount_type public.discount_type not null,
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_discount numeric(10,2) check (max_discount is null or max_discount > 0),
  min_order_value numeric(10,2) not null default 0 check (min_order_value >= 0),
  store_id uuid references public.stores (id) on delete cascade, -- null = platform-wide
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  times_used integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint percent_max check (discount_type <> 'percent' or discount_value <= 100),
  constraint window_valid check (ends_at is null or ends_at > starts_at)
);
create trigger coupons_updated before update on public.coupons
  for each row execute function public.set_updated_at();

-- ───────────────────────── orders ─────────────────────────
create sequence public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers (id),
  store_id uuid not null references public.stores (id),
  address_id uuid references public.addresses (id) on delete set null,
  -- Snapshot so later address edits/deletes never change a placed order.
  delivery_address jsonb not null,
  delivery_location extensions.geography(Point, 4326) not null,
  delivery_instructions text not null default '' check (char_length(delivery_instructions) <= 300),
  status public.order_status not null default 'placed',
  subtotal numeric(10,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  tax numeric(10,2) not null default 0 check (tax >= 0),
  total numeric(10,2) not null check (total >= 0),
  coupon_id uuid references public.coupons (id),
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  prep_time_minutes integer check (prep_time_minutes between 1 and 240),
  rejection_reason text,
  cancel_reason text,
  cancelled_by uuid references public.profiles (id),
  idempotency_key uuid not null,
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz, -- rejected / cancelled
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key),
  constraint total_consistent check (total = subtotal + delivery_fee + tax - discount)
);
create index orders_customer_idx on public.orders (customer_id, placed_at desc);
create index orders_store_status_idx on public.orders (store_id, status, placed_at desc);
create index orders_active_idx on public.orders (status) where status not in ('delivered', 'rejected', 'cancelled');
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- The delivery OTP lives apart from orders so only the customer can read it
-- (delivery partners can read the order row while delivering).
create table public.order_secrets (
  order_id uuid primary key references public.orders (id) on delete cascade,
  delivery_otp text not null check (delivery_otp ~ '^[0-9]{4}$'),
  failed_attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  variant_label text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null,
  constraint line_total_consistent check (line_total = unit_price * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ───────────────────────── status machine ─────────────────────────
-- Mirrors packages/shared/src/constants/order.ts.
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select case p_from
    when 'placed' then p_to in ('accepted', 'rejected', 'cancelled')
    when 'accepted' then p_to in ('preparing', 'ready_for_pickup', 'cancelled')
    when 'preparing' then p_to in ('ready_for_pickup', 'cancelled')
    when 'ready_for_pickup' then p_to in ('picked_up', 'cancelled')
    when 'picked_up' then p_to = 'delivered'
    else false
  end
$$;

create or replace function public.orders_enforce_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'placed' then
      raise exception 'Orders must start as placed' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.order_transition_allowed(old.status, new.status) then
      raise exception 'invalid_transition' using errcode = 'P0001',
        detail = format('%s → %s', old.status, new.status);
    end if;
    case new.status
      when 'accepted' then new.accepted_at := now();
      when 'ready_for_pickup' then new.ready_at := now();
      when 'picked_up' then new.picked_up_at := now();
      when 'delivered' then new.delivered_at := now();
      when 'rejected', 'cancelled' then new.closed_at := now();
      else null;
    end case;
  end if;
  return new;
end $$;
create trigger orders_enforce_transition before insert or update of status on public.orders
  for each row execute function public.orders_enforce_transition();

-- History is written after the row exists (FK) and only for real changes.
create or replace function public.orders_record_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, actor_id)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (new.id, old.status, new.status, auth.uid(),
            case new.status when 'cancelled' then new.cancel_reason when 'rejected' then new.rejection_reason end);
  end if;
  return null;
end $$;
create trigger orders_record_history after insert or update of status on public.orders
  for each row execute function public.orders_record_history();

-- ───────────────────────── payments ─────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method public.payment_method not null,
  amount numeric(10,2) not null check (amount >= 0),
  status public.payment_status not null default 'pending',
  -- Gateway references (Razorpay). Card/UPI credentials never touch our servers.
  provider_order_id text unique,
  provider_payment_id text unique,
  failure_reason text,
  collected_by uuid references public.profiles (id), -- COD: the delivery partner
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create trigger payments_updated before update on public.payments
  for each row execute function public.set_updated_at();

-- Raw, signature-verified gateway webhooks — append-only audit trail.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ───────────────────────── commissions ─────────────────────────
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  store_id uuid not null references public.stores (id),
  vendor_id uuid not null references public.vendors (id),
  base_amount numeric(10,2) not null check (base_amount >= 0), -- item subtotal after store-funded discount
  rate numeric(5,4) not null check (rate between 0 and 1),
  commission_amount numeric(10,2) not null check (commission_amount >= 0),
  vendor_payout numeric(10,2) not null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index commissions_vendor_idx on public.commissions (vendor_id, created_at desc);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_customer_idx on public.coupon_redemptions (coupon_id, customer_id);
