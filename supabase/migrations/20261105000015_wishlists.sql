-- LocalLoop · 0015 · wishlists (saved products and shops)

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_target check ((product_id is null) <> (store_id is null))
);
create unique index wishlist_items_product on public.wishlist_items (customer_id, product_id) where product_id is not null;
create unique index wishlist_items_store on public.wishlist_items (customer_id, store_id) where store_id is not null;

alter table public.wishlist_items enable row level security;
grant select, insert, delete on public.wishlist_items to authenticated;
create policy wishlist_owner on public.wishlist_items for all to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid() and (
    (product_id is not null and public.product_is_public(product_id)) or
    (store_id is not null and public.store_is_public(store_id))));
