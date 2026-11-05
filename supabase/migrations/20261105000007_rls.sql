-- LocalLoop · 0007 · privileges and Row Level Security
--
-- Model: deny by default. Every table has RLS enabled. The `anon` and
-- `authenticated` roles get only the table/column privileges listed here,
-- and RLS narrows rows. Order lifecycle, payments, assignments, reviews and
-- location writes have NO direct write grants — they happen only through the
-- SECURITY DEFINER functions in 0008, which validate the caller.

-- ───────────────────────── baseline: revoke everything ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- ENABLE (not FORCE): the table owner — which owns the SECURITY DEFINER
    -- functions in 0008 — must bypass RLS so those functions can do their own,
    -- stricter checks.
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ───────────────────────── helper functions ─────────────────────────
-- SECURITY DEFINER so policies can consult other tables without recursive RLS.

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.admin_can(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users a join public.profiles p on p.id = a.id
     where a.id = auth.uid() and p.is_active and p.role = 'admin'
       and (
         a.admin_role = 'super_admin'
         or (a.admin_role = 'operations' and p_perm = any (array[
               'users','vendors','partners','stores','catalog','orders','deliveries','areas','reviews','notifications','tickets']))
         or (a.admin_role = 'support' and p_perm = any (array['users','orders','deliveries','tickets','reviews']))
         or (a.admin_role = 'finance' and p_perm = any (array['orders','payments','commissions','coupons','reports']))
       )
  )
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users a join public.profiles p on p.id = a.id
     where a.id = auth.uid() and p.is_active and p.role = 'admin'
  )
$$;

create or replace function public.owns_store(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stores where id = p_store_id and vendor_id = auth.uid())
$$;

create or replace function public.owns_product(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p join public.stores s on s.id = p.store_id
     where p.id = p_product_id and s.vendor_id = auth.uid()
  )
$$;

create or replace function public.demo_data_visible() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.setting('show_demo_data') #>> '{}')::boolean, false)
$$;

-- A store is visible to the public only when the store and its vendor are
-- approved, it sits inside an active serviceable area, and (in production)
-- it is not demo data.
create or replace function public.store_is_public(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stores s
      join public.vendors v on v.id = s.vendor_id
      join public.serviceable_areas a on a.id = s.serviceable_area_id
     where s.id = p_store_id
       and s.status = 'approved' and v.status = 'approved' and a.is_active
       and (not s.is_demo or public.demo_data_visible())
  )
$$;

create or replace function public.product_is_public(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p where p.id = p_product_id and p.is_active and public.store_is_public(p.store_id)
  )
$$;

-- Order visibility for each participant.
create or replace function public.can_view_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and (
         o.customer_id = auth.uid()
         or exists (select 1 from public.stores s where s.id = o.store_id and s.vendor_id = auth.uid())
         or exists (select 1 from public.delivery_assignments da
                     where da.order_id = o.id and da.partner_id = auth.uid()
                       and da.status in ('accepted', 'picked_up', 'delivered'))
         or public.admin_can('orders')
       )
  )
$$;


-- ───────────────────────── generic admin audit trigger ─────────────────────────
create or replace function public.audit_admin_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, before_state, after_state)
    values (
      auth.uid(), lower(tg_op), tg_table_name,
      coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
               (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'key'),
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      case when tg_op = 'DELETE' then null else to_jsonb(new) end
    );
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['serviceable_areas','app_settings','categories','stores','products','product_variants',
                           'vendors','delivery_partners','coupons','reviews','admin_users','profiles',
                           'vendor_documents','delivery_documents','support_tickets'] loop
    execute format('create trigger audit_admin_write after insert or update or delete on public.%I
                    for each row execute function public.audit_admin_write()', t);
  end loop;
end $$;

-- ───────────────────────── serviceable_areas ─────────────────────────
grant select on public.serviceable_areas to anon, authenticated;
grant insert, update, delete on public.serviceable_areas to authenticated;
create policy areas_read_active on public.serviceable_areas for select using (is_active or public.admin_can('areas'));
create policy areas_admin_write on public.serviceable_areas for all to authenticated
  using (public.admin_can('areas')) with check (public.admin_can('areas'));

-- ───────────────────────── app_settings ─────────────────────────
grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;
create policy settings_read on public.app_settings for select using (is_public or public.is_admin());
create policy settings_admin_insert on public.app_settings for insert to authenticated
  with check (public.admin_can('settings'));
create policy settings_admin_update on public.app_settings for update to authenticated
  using (public.admin_can('settings')) with check (public.admin_can('settings'));

-- ───────────────────────── profiles ─────────────────────────
grant select on public.profiles to authenticated;
grant update (full_name, email, avatar_path, preferred_language, location_consent_at) on public.profiles to authenticated;
grant update (is_active) on public.profiles to authenticated; -- admin only, enforced by policy below
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.admin_can('users'));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.admin_can('users')) with check (id = auth.uid() or public.admin_can('users'));

-- A user may not deactivate themselves or reactivate via the self policy.
create or replace function public.profiles_guard_update() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and new.is_active is distinct from old.is_active
     and not public.admin_can('users') then
    raise exception 'Only administrators can change account status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.profiles_guard_update();

-- ───────────────────────── customers / admin_users ─────────────────────────
grant select on public.customers to authenticated;
grant update (default_address_id) on public.customers to authenticated;
create policy customers_self on public.customers for select to authenticated
  using (id = auth.uid() or public.admin_can('users'));
create policy customers_self_update on public.customers for update to authenticated
  using (id = auth.uid()) with check (
    id = auth.uid() and (default_address_id is null or exists (
      select 1 from public.addresses a where a.id = default_address_id and a.user_id = auth.uid()))
  );

grant select on public.admin_users to authenticated;
create policy admin_users_read on public.admin_users for select to authenticated
  using (id = auth.uid() or public.admin_can('admins'));

-- ───────────────────────── vendors ─────────────────────────
grant select on public.vendors to authenticated;
grant update (owner_name, business_name, business_category_id, gstin) on public.vendors to authenticated;
grant update (status, status_reason, reviewed_by, reviewed_at, plan, commission_rate_override) on public.vendors to authenticated;
create policy vendors_self_read on public.vendors for select to authenticated
  using (id = auth.uid() or public.admin_can('vendors'));
create policy vendors_self_update on public.vendors for update to authenticated
  using (id = auth.uid() or public.admin_can('vendors')) with check (id = auth.uid() or public.admin_can('vendors'));

create or replace function public.vendors_guard_update() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') or public.admin_can('vendors') then
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.status_reason is distinct from old.status_reason
     or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
     or new.plan is distinct from old.plan or new.commission_rate_override is distinct from old.commission_rate_override then
    raise exception 'Only administrators can change verification or commercial fields' using errcode = '42501';
  end if;
  -- Identity changes after approval need re-verification.
  if old.status = 'approved' and (new.gstin is distinct from old.gstin or new.business_name is distinct from old.business_name) then
    new.status := 'pending';
    new.status_reason := 'Business details changed — awaiting re-verification';
  end if;
  return new;
end $$;
create trigger vendors_guard_update before update on public.vendors
  for each row execute function public.vendors_guard_update();

-- ───────────────────────── delivery_partners ─────────────────────────
grant select on public.delivery_partners to authenticated;
grant update (vehicle_type, vehicle_registration, driving_licence) on public.delivery_partners to authenticated;
grant update (status, status_reason) on public.delivery_partners to authenticated;
create policy partners_self_read on public.delivery_partners for select to authenticated
  using (id = auth.uid() or public.admin_can('partners'));
create policy partners_self_update on public.delivery_partners for update to authenticated
  using (id = auth.uid() or public.admin_can('partners')) with check (id = auth.uid() or public.admin_can('partners'));

create or replace function public.partners_guard_update() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') or public.admin_can('partners') then
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      if new.status <> 'approved' then new.is_online := false; end if;
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.status_reason is distinct from old.status_reason then
    raise exception 'Only administrators can change verification status' using errcode = '42501';
  end if;
  if old.status = 'approved' and (new.vehicle_type is distinct from old.vehicle_type
       or new.vehicle_registration is distinct from old.vehicle_registration
       or new.driving_licence is distinct from old.driving_licence) then
    new.status := 'pending';
    new.status_reason := 'Vehicle details changed — awaiting re-verification';
    new.is_online := false;
  end if;
  return new;
end $$;
create trigger partners_guard_update before update on public.delivery_partners
  for each row execute function public.partners_guard_update();

-- ───────────────────────── addresses / push tokens ─────────────────────────
grant select, insert, update, delete on public.addresses to authenticated;
create policy addresses_owner on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;
create policy push_tokens_owner on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── categories ─────────────────────────
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
create policy categories_read on public.categories for select using (is_active or public.admin_can('catalog'));
create policy categories_admin on public.categories for all to authenticated
  using (public.admin_can('catalog')) with check (public.admin_can('catalog'));

-- ───────────────────────── stores ─────────────────────────
grant select on public.stores to anon, authenticated;
grant insert (vendor_id, name, name_te, description, category_id, phone, address_line, locality, city, state,
              pincode, location, timezone, opening_hours, delivery_radius_km, min_order_value, avg_prep_minutes,
              is_accepting_orders, logo_path, cover_path)
  on public.stores to authenticated;
grant update (name, name_te, description, category_id, phone, address_line, locality, city, state, pincode,
              location, opening_hours, delivery_radius_km, min_order_value, avg_prep_minutes,
              is_accepting_orders, logo_path, cover_path,
              status, status_reason, is_featured)
  on public.stores to authenticated;
create policy stores_public_read on public.stores for select
  using (public.store_is_public(id) or vendor_id = auth.uid() or public.admin_can('stores'));
create policy stores_vendor_insert on public.stores for insert to authenticated
  with check (vendor_id = auth.uid() and public.current_app_role() = 'vendor');
create policy stores_vendor_update on public.stores for update to authenticated
  using (vendor_id = auth.uid() or public.admin_can('stores'))
  with check (vendor_id = auth.uid() or public.admin_can('stores'));

-- The vendor guard (0003) blocks moderation fields for vendors; let admins through.
create or replace function public.stores_guard_vendor_update() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') or public.admin_can('stores') then
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at or new.is_featured is distinct from old.is_featured
     or new.status_reason is distinct from old.status_reason then
    raise exception 'Only administrators can change moderation fields' using errcode = '42501';
  end if;
  if old.status = 'approved' and new.location is distinct from old.location then
    new.status := 'pending';
    new.status_reason := 'Location changed — awaiting re-verification';
  end if;
  return new;
end $$;

-- ───────────────────────── products, images, variants, inventory ─────────────────────────
grant select on public.products, public.product_images, public.product_variants, public.inventory to anon, authenticated;
grant insert (store_id, category_id, name, name_te, description, is_available),
      update (category_id, name, name_te, description, is_available, is_active)
  on public.products to authenticated;
grant delete on public.products to authenticated;
grant insert (product_id, storage_path, sort_order), update (sort_order), delete on public.product_images to authenticated;
grant insert (product_id, label, unit, unit_quantity, price, sale_price, sku, is_default, is_active),
      update (label, unit, unit_quantity, price, sale_price, sku, is_default, is_active),
      delete
  on public.product_variants to authenticated;
grant update (quantity, track_inventory, low_stock_threshold) on public.inventory to authenticated;

create policy products_read on public.products for select
  using ((is_active and public.store_is_public(store_id)) or public.owns_store(store_id) or public.admin_can('catalog'));
create policy products_vendor_write on public.products for insert to authenticated
  with check (public.owns_store(store_id));
create policy products_vendor_update on public.products for update to authenticated
  using (public.owns_store(store_id) or public.admin_can('catalog'))
  with check (public.owns_store(store_id) or public.admin_can('catalog'));
create policy products_vendor_delete on public.products for delete to authenticated
  using (public.owns_store(store_id));

create policy product_images_read on public.product_images for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.admin_can('catalog'));
create policy product_images_vendor on public.product_images for all to authenticated
  using (public.owns_product(product_id)) with check (public.owns_product(product_id));

create policy variants_read on public.product_variants for select
  using ((is_active and public.product_is_public(product_id)) or public.owns_product(product_id) or public.admin_can('catalog'));
create policy variants_vendor on public.product_variants for all to authenticated
  using (public.owns_product(product_id)) with check (public.owns_product(product_id));

create policy inventory_read on public.inventory for select
  using (public.store_is_public(store_id) or public.owns_store(store_id) or public.admin_can('catalog'));
create policy inventory_vendor_update on public.inventory for update to authenticated
  using (public.owns_store(store_id)) with check (public.owns_store(store_id));

-- ───────────────────────── verification documents ─────────────────────────
grant select, delete on public.vendor_documents, public.delivery_documents to authenticated;
grant insert (vendor_id, doc_type, storage_path) on public.vendor_documents to authenticated;
grant insert (partner_id, doc_type, storage_path) on public.delivery_documents to authenticated;
grant update (status, review_note) on public.vendor_documents, public.delivery_documents to authenticated;

create policy vendor_docs_read on public.vendor_documents for select to authenticated
  using (vendor_id = auth.uid() or public.admin_can('vendors'));
create policy vendor_docs_insert on public.vendor_documents for insert to authenticated
  with check (vendor_id = auth.uid() and storage_path like auth.uid()::text || '/%');
create policy vendor_docs_delete on public.vendor_documents for delete to authenticated
  using (vendor_id = auth.uid() and status = 'pending');
create policy vendor_docs_review on public.vendor_documents for update to authenticated
  using (public.admin_can('vendors')) with check (public.admin_can('vendors'));

create policy partner_docs_read on public.delivery_documents for select to authenticated
  using (partner_id = auth.uid() or public.admin_can('partners'));
create policy partner_docs_insert on public.delivery_documents for insert to authenticated
  with check (partner_id = auth.uid() and storage_path like auth.uid()::text || '/%');
create policy partner_docs_delete on public.delivery_documents for delete to authenticated
  using (partner_id = auth.uid() and status = 'pending');
create policy partner_docs_review on public.delivery_documents for update to authenticated
  using (public.admin_can('partners')) with check (public.admin_can('partners'));

create or replace function public.documents_stamp_review() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger vendor_documents_review before update on public.vendor_documents
  for each row execute function public.documents_stamp_review();
create trigger delivery_documents_review before update on public.delivery_documents
  for each row execute function public.documents_stamp_review();

-- ───────────────────────── carts ─────────────────────────
grant select, insert, delete on public.carts to authenticated;
grant update (store_id) on public.carts to authenticated;
grant select, insert, delete on public.cart_items to authenticated;
grant update (quantity) on public.cart_items to authenticated;
create policy carts_owner on public.carts for all to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid() and public.store_is_public(store_id));
create policy cart_items_owner on public.cart_items for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid()));

-- ───────────────────────── coupons ─────────────────────────
grant select on public.coupons to authenticated;
grant insert, update, delete on public.coupons to authenticated;
create policy coupons_read on public.coupons for select to authenticated
  using ((is_active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.admin_can('coupons'));
create policy coupons_admin on public.coupons for all to authenticated
  using (public.admin_can('coupons')) with check (public.admin_can('coupons'));

-- ───────────────────────── orders and children (read-only for clients) ─────────────────────────
grant select on public.orders, public.order_items, public.order_status_history to authenticated;
create policy orders_participants on public.orders for select to authenticated
  using (public.can_view_order(id));
create policy order_items_participants on public.order_items for select to authenticated
  using (public.can_view_order(order_id));
create policy order_history_participants on public.order_status_history for select to authenticated
  using (public.can_view_order(order_id));

grant select on public.order_secrets to authenticated;
create policy order_secrets_customer on public.order_secrets for select to authenticated
  using (exists (
    select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()
       and o.status not in ('delivered', 'rejected', 'cancelled')
  ));

grant select on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or exists (select 1 from public.orders o join public.stores s on s.id = o.store_id
                where o.id = order_id and s.vendor_id = auth.uid())
    or public.admin_can('payments')
  );

grant select on public.payment_events to authenticated;
create policy payment_events_admin on public.payment_events for select to authenticated
  using (public.admin_can('payments'));

grant select on public.commissions to authenticated;
create policy commissions_read on public.commissions for select to authenticated
  using (vendor_id = auth.uid() or public.admin_can('commissions'));

grant select on public.coupon_redemptions to authenticated;
create policy coupon_redemptions_read on public.coupon_redemptions for select to authenticated
  using (customer_id = auth.uid() or public.admin_can('coupons'));

-- ───────────────────────── delivery ─────────────────────────
grant select on public.delivery_assignments to authenticated;
create policy assignments_partner on public.delivery_assignments for select to authenticated
  using (partner_id = auth.uid());
-- Customer sees the live tracking row only while the order is out for delivery.
create policy assignments_customer_live on public.delivery_assignments for select to authenticated
  using (status = 'picked_up' and exists (
    select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'picked_up'
  ));
-- Vendor sees the partner heading to the store until pickup.
create policy assignments_vendor on public.delivery_assignments for select to authenticated
  using (status in ('accepted', 'picked_up', 'delivered') and exists (
    select 1 from public.orders o join public.stores s on s.id = o.store_id
     where o.id = order_id and s.vendor_id = auth.uid()
  ));
create policy assignments_admin on public.delivery_assignments for select to authenticated
  using (public.admin_can('deliveries'));

grant select on public.driver_locations, public.delivery_routes to authenticated;
create policy driver_locations_read on public.driver_locations for select to authenticated
  using (partner_id = auth.uid() or public.admin_can('deliveries'));
create policy delivery_routes_read on public.delivery_routes for select to authenticated
  using (public.admin_can('deliveries') or exists (
    select 1 from public.delivery_assignments da where da.id = assignment_id and da.partner_id = auth.uid()
  ));

-- ───────────────────────── reviews ─────────────────────────
grant select on public.reviews to anon, authenticated;
grant update (status) on public.reviews to authenticated;
create policy reviews_read on public.reviews for select
  using (status = 'published' or author_id = auth.uid() or public.admin_can('reviews'));
create policy reviews_moderate on public.reviews for update to authenticated
  using (public.admin_can('reviews')) with check (public.admin_can('reviews'));

grant select, insert on public.review_reports to authenticated;
create policy review_reports_insert on public.review_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy review_reports_read on public.review_reports for select to authenticated
  using (reporter_id = auth.uid() or public.admin_can('reviews'));

-- ───────────────────────── notifications ─────────────────────────
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_owner_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_owner_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── support ─────────────────────────
grant select on public.support_tickets, public.support_messages to authenticated;
grant insert (user_id, order_id, category, subject) on public.support_tickets to authenticated;
grant update (status, priority, assigned_admin) on public.support_tickets to authenticated;
grant insert (ticket_id, author_id, body, is_staff) on public.support_messages to authenticated;

create policy tickets_read on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.admin_can('tickets'));
create policy tickets_insert on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid() and (order_id is null or public.can_view_order(order_id)));
create policy tickets_staff_update on public.support_tickets for update to authenticated
  using (public.admin_can('tickets')) with check (public.admin_can('tickets'));

create policy support_messages_read on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id
                  and (t.user_id = auth.uid() or public.admin_can('tickets'))));
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    author_id = auth.uid() and (
      (not is_staff and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()
                                  and t.status <> 'closed'))
      or (is_staff and public.admin_can('tickets'))
    )
  );

-- ───────────────────────── audit log ─────────────────────────
grant select on public.admin_audit_logs to authenticated;
create policy audit_read on public.admin_audit_logs for select to authenticated
  using (public.admin_can('audit'));
