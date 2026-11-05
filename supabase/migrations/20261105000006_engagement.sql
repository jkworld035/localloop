-- LocalLoop · 0006 · reviews, notifications, support, audit

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  target public.review_target not null,
  store_id uuid references public.stores (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  partner_id uuid references public.delivery_partners (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  -- Reviews can only be created by submit_review(), which requires a delivered
  -- order owned by the author, so every review is a verified purchase.
  is_verified_purchase boolean not null default true,
  status public.review_status not null default 'published',
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint target_matches check (
    (target = 'store' and store_id is not null and product_id is null and partner_id is null) or
    (target = 'product' and product_id is not null and partner_id is null) or
    (target = 'delivery_partner' and partner_id is not null and product_id is null)
  )
);
create unique index reviews_one_store_per_order on public.reviews (order_id) where target = 'store';
create unique index reviews_one_partner_per_order on public.reviews (order_id) where target = 'delivery_partner';
create unique index reviews_one_product_per_order on public.reviews (order_id, product_id) where target = 'product';
create index reviews_store_idx on public.reviews (store_id, created_at desc) where status = 'published';
create index reviews_product_idx on public.reviews (product_id, created_at desc) where status = 'published';
create trigger reviews_updated before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.review_reports (
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300),
  created_at timestamptz not null default now(),
  primary key (review_id, reporter_id)
);

-- In-app notifications. Text is rendered client-side from `type` + `data` in
-- the user's language; the push sender renders the same templates server-side.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type ~ '^[a-z_]+$'),
  data jsonb not null default '{}',
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  category text not null check (category in ('order', 'payment', 'delivery', 'account', 'store', 'refund', 'other')),
  subject text not null check (char_length(subject) between 3 and 140),
  status public.ticket_status not null default 'open',
  priority public.ticket_priority not null default 'normal',
  assigned_admin uuid references public.admin_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_queue_idx on public.support_tickets (status, priority, created_at);
create trigger support_tickets_updated before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_entity_idx on public.admin_audit_logs (entity_type, entity_id, created_at desc);
create index admin_audit_logs_admin_idx on public.admin_audit_logs (admin_id, created_at desc);
