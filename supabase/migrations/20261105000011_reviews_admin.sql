-- LocalLoop · 0011 · reviews, ratings, inventory alerts, admin functions

-- ───────────────────────── reviews ─────────────────────────
create or replace function public.submit_review(
  p_order_id uuid, p_target public.review_target, p_rating smallint,
  p_body text default '', p_product_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('customer');
  v_order public.orders;
  v_partner uuid;
  v_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id and customer_id = v_uid;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status <> 'delivered' then raise exception 'review_requires_delivery' using errcode = 'P0001'; end if;
  if v_order.delivered_at < now() - make_interval(days => coalesce(public.setting_num('review_window_days'), 30)::int) then
    raise exception 'review_window_closed' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid_rating' using errcode = 'P0001'; end if;

  if p_target = 'product' and not exists (
       select 1 from public.order_items where order_id = p_order_id and product_id = p_product_id) then
    raise exception 'product_not_in_order' using errcode = 'P0001';
  end if;
  if p_target = 'delivery_partner' then
    select partner_id into v_partner from public.delivery_assignments where order_id = p_order_id and status = 'delivered';
    if v_partner is null then raise exception 'no_partner_to_review' using errcode = 'P0001'; end if;
  end if;

  insert into public.reviews (order_id, author_id, target, store_id, product_id, partner_id, rating, body)
  values (p_order_id, v_uid, p_target,
          case when p_target in ('store', 'product') then v_order.store_id end,
          case when p_target = 'product' then p_product_id end,
          v_partner, p_rating, left(coalesce(trim(p_body), ''), 1000))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'already_reviewed' using errcode = 'P0001';
end $$;

create or replace function public.refresh_ratings() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.reviews := coalesce(new, old);
begin
  if r.target = 'store' then
    update public.stores s set (rating_avg, rating_count) = (
      select coalesce(round(avg(rating), 2), 0), count(*) from public.reviews
       where store_id = r.store_id and target = 'store' and status = 'published')
     where s.id = r.store_id;
    if tg_op = 'INSERT' then
      perform public.notify(s.vendor_id, 'new_review', jsonb_build_object('store_id', s.id, 'rating', r.rating))
         from public.stores s where s.id = r.store_id;
    end if;
  elsif r.target = 'delivery_partner' then
    update public.delivery_partners d set (rating_avg, rating_count) = (
      select coalesce(round(avg(rating), 2), 0), count(*) from public.reviews
       where partner_id = r.partner_id and target = 'delivery_partner' and status = 'published')
     where d.id = r.partner_id;
  end if;
  return null;
end $$;
create trigger reviews_refresh_ratings after insert or update of status, rating or delete on public.reviews
  for each row execute function public.refresh_ratings();

create or replace function public.review_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.reviews
     set report_count = report_count + 1,
         status = case when report_count + 1 >= coalesce(public.setting_num('review_report_threshold'), 3)
                         and status = 'published' then 'under_review'::public.review_status else status end
   where id = new.review_id;
  return new;
end $$;
create trigger review_reports_count after insert on public.review_reports
  for each row execute function public.review_reported();

-- ───────────────────────── low stock alert ─────────────────────────
create or replace function public.inventory_low_stock_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.track_inventory and new.quantity <= new.low_stock_threshold
     and (old.quantity > old.low_stock_threshold or not old.track_inventory) then
    perform public.notify(s.vendor_id, 'low_stock',
      jsonb_build_object('variant_id', new.variant_id, 'product_name', p.name, 'variant_label', v.label,
                         'quantity', new.quantity))
       from public.product_variants v join public.products p on p.id = v.product_id
       join public.stores s on s.id = p.store_id
      where v.id = new.variant_id;
  end if;
  return new;
end $$;
create trigger inventory_low_stock_alert after update of quantity, track_inventory on public.inventory
  for each row execute function public.inventory_low_stock_alert();

-- ───────────────────────── account status notifications ─────────────────────────
create or replace function public.verification_status_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'suspended') then
    perform public.notify(
      case when tg_table_name = 'stores' then (to_jsonb(new) ->> 'vendor_id')::uuid else new.id end,
      tg_table_name || '_' || new.status::text,
      jsonb_build_object('id', new.id, 'reason', new.status_reason));
  end if;
  return new;
end $$;
create trigger vendors_status_notify after update of status on public.vendors
  for each row execute function public.verification_status_notify();
create trigger partners_status_notify after update of status on public.delivery_partners
  for each row execute function public.verification_status_notify();
create trigger stores_status_notify after update of status on public.stores
  for each row execute function public.verification_status_notify();

-- ───────────────────────── admin ─────────────────────────
-- Grant or revoke admin access. Only super admins; every change is audited.
create or replace function public.admin_set_admin_role(p_user_id uuid, p_admin_role public.admin_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('admins') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_change_own_role' using errcode = 'P0001'; end if;
  if p_admin_role is null then
    delete from public.admin_users where id = p_user_id;
    update public.profiles set role = 'customer' where id = p_user_id and role = 'admin';
    insert into public.customers (id) values (p_user_id) on conflict do nothing;
  else
    update public.profiles set role = 'admin' where id = p_user_id;
    insert into public.admin_users (id, admin_role, granted_by) values (p_user_id, p_admin_role, auth.uid())
    on conflict (id) do update set admin_role = excluded.admin_role, granted_by = excluded.granted_by;
  end if;
  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, after_state)
  values (auth.uid(), 'set_admin_role', 'admin_users', p_user_id::text, jsonb_build_object('admin_role', p_admin_role));
end $$;

-- Overview tiles for the admin dashboard. "Today" is the Asia/Kolkata day.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if not public.admin_can('orders') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'customers', (select count(*) from public.customers),
    'vendors', (select count(*) from public.vendors where status = 'approved'),
    'vendors_pending', (select count(*) from public.vendors where status = 'pending'),
    'partners', (select count(*) from public.delivery_partners where status = 'approved'),
    'partners_pending', (select count(*) from public.delivery_partners where status = 'pending'),
    'partners_online', (select count(*) from public.delivery_partners where is_online),
    'active_stores', (select count(*) from public.stores where status = 'approved' and not is_demo),
    'stores_pending', (select count(*) from public.stores where status = 'pending'),
    'orders_today', (select count(*) from public.orders where placed_at >= v_today_start and not is_demo),
    'orders_in_progress', (select count(*) from public.orders
                            where status in ('placed','accepted','preparing','ready_for_pickup','picked_up') and not is_demo),
    'delivered_today', (select count(*) from public.orders where status = 'delivered' and delivered_at >= v_today_start and not is_demo),
    'cancelled_today', (select count(*) from public.orders where status in ('cancelled','rejected')
                         and closed_at >= v_today_start and not is_demo),
    'gmv_today', (select coalesce(sum(total), 0) from public.orders
                   where status = 'delivered' and delivered_at >= v_today_start and not is_demo),
    'commission_today', (select coalesce(sum(c.commission_amount), 0) from public.commissions c
                          join public.orders o on o.id = c.order_id
                          where c.created_at >= v_today_start and not o.is_demo),
    'avg_delivery_minutes_7d', (select round(avg(extract(epoch from (delivered_at - placed_at)) / 60)::numeric, 1)
                                  from public.orders where status = 'delivered' and not is_demo
                                   and delivered_at >= now() - interval '7 days'),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open', 'in_progress'))
  );
end $$;
