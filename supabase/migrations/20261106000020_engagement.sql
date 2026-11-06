-- LocalLoop · 0020 · help & support, ratings, account closure (Phase 6)

-- ───────────────────────── help & support ─────────────────────────
-- Opens a ticket with its first message in one step. Any signed-in role can
-- ask for help; an order (if given) must be one the user is part of.
create or replace function public.create_support_ticket(
  p_category text, p_subject text, p_body text, p_order_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_user();
  v_subject text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if p_category not in ('order', 'payment', 'delivery', 'account', 'store', 'refund', 'other') then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;
  if char_length(v_subject) < 3 or char_length(v_body) < 10 then
    raise exception 'ticket_too_short' using errcode = 'P0001';
  end if;
  if p_order_id is not null and not public.can_view_order(p_order_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.support_tickets where user_id = v_uid and status in ('open', 'in_progress')) >= 5 then
    raise exception 'too_many_open_tickets' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (user_id, order_id, category, subject, priority)
  values (v_uid, p_order_id, p_category, left(v_subject, 140),
          case when p_category in ('payment', 'refund') then 'high'::public.ticket_priority else 'normal' end)
  returning id into v_id;
  insert into public.support_messages (ticket_id, author_id, body) values (v_id, v_uid, left(v_body, 4000));
  return v_id;
end $$;

-- The user's reply. Replying to a resolved ticket reopens it; closed tickets stay closed.
create or replace function public.reply_support_ticket(p_ticket_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_user();
  v_ticket public.support_tickets;
  v_body text := trim(coalesce(p_body, ''));
begin
  select * into v_ticket from public.support_tickets where id = p_ticket_id and user_id = v_uid for update;
  if v_ticket.id is null then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  if v_ticket.status = 'closed' then raise exception 'ticket_closed' using errcode = 'P0001'; end if;
  if v_body = '' then raise exception 'ticket_too_short' using errcode = 'P0001'; end if;
  insert into public.support_messages (ticket_id, author_id, body) values (p_ticket_id, v_uid, left(v_body, 4000));
  update public.support_tickets
     set status = case when status = 'resolved' then 'open'::public.ticket_status else status end, updated_at = now()
   where id = p_ticket_id;
end $$;

-- ───────────────────────── ratings ─────────────────────────
-- What the customer can still rate for a delivered order.
create or replace function public.order_review_state(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('customer');
  v_order public.orders;
  v_window int := coalesce(public.setting_num('review_window_days'), 30)::int;
begin
  select * into v_order from public.orders where id = p_order_id and customer_id = v_uid;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'can_review', v_order.status = 'delivered' and v_order.delivered_at >= now() - make_interval(days => v_window),
    'store', (select jsonb_build_object('rating', rating, 'body', body) from public.reviews
               where order_id = p_order_id and author_id = v_uid and target = 'store'),
    'partner', (select jsonb_build_object('rating', rating) from public.reviews
                 where order_id = p_order_id and author_id = v_uid and target = 'delivery_partner'),
    'has_partner', exists (select 1 from public.delivery_assignments where order_id = p_order_id and status = 'delivered'),
    'partner_name', (select split_part(coalesce(p.full_name, ''), ' ', 1) from public.delivery_assignments a
                      join public.profiles p on p.id = a.partner_id
                      where a.order_id = p_order_id and a.status = 'delivered'),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', i.product_name,
               'rating', (select r.rating from public.reviews r where r.order_id = p_order_id and r.author_id = v_uid
                           and r.target = 'product' and r.product_id = i.product_id)) order by i.product_name)
        from (select distinct on (product_id) product_id, product_name from public.order_items
               where order_id = p_order_id and product_id is not null) i), '[]')
  );
end $$;

-- Published reviews for a shop page. Authors are shown by first name only.
create or replace function public.store_reviews(p_store_id uuid, p_limit int default 20, p_offset int default 0)
returns table (id uuid, rating smallint, body text, author text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.rating, r.body, nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''), r.created_at
    from public.reviews r join public.profiles p on p.id = r.author_id
   where r.store_id = p_store_id and r.target = 'store' and r.status = 'published'
     and public.store_is_public(p_store_id)
   order by (r.body <> '') desc, r.created_at desc
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- ───────────────────────── account closure ─────────────────────────
-- Removes personal data and blocks the account. Order, payment and tax
-- records stay (they are needed for accounts and disputes) but no longer
-- carry the person's name or phone number. The delete-account edge function
-- calls this, then removes the sign-in itself.
create or replace function public.close_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_user();
  v_role public.app_role := (select role from public.profiles where id = v_uid);
begin
  if v_role = 'admin' then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if exists (select 1 from public.orders where customer_id = v_uid
              and status in ('placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up')) then
    raise exception 'open_orders' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders o join public.stores s on s.id = o.store_id
              where s.vendor_id = v_uid and o.status in ('placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up')) then
    raise exception 'open_orders' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.delivery_assignments where partner_id = v_uid and status in ('accepted', 'picked_up')) then
    raise exception 'active_delivery_in_progress' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where collected_by = v_uid and method = 'cod' and status = 'paid'
              and cash_settlement_id is null) then
    raise exception 'cash_not_settled' using errcode = 'P0001';
  end if;

  -- Shops leave the app; partners go offline.
  update public.stores set status = 'suspended', status_reason = 'Owner closed their account', is_accepting_orders = false
   where vendor_id = v_uid and status <> 'suspended';
  update public.delivery_partners set is_online = false, current_location = null, current_location_at = null,
         vehicle_registration = case when vehicle_type = 'bicycle' then null else vehicle_registration end
   where id = v_uid;

  -- Personal data.
  delete from public.push_tokens where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;
  delete from public.wishlist_items where customer_id = v_uid;
  delete from public.carts where customer_id = v_uid;
  update public.customers set default_address_id = null where id = v_uid;
  delete from public.addresses where user_id = v_uid;
  delete from public.driver_locations where partner_id = v_uid;
  update public.orders
     set delivery_address = delivery_address - 'contact_name' - 'contact_phone' - 'line1' - 'line2' - 'landmark'
                            || jsonb_build_object('contact_name', 'Closed account'),
         delivery_instructions = ''
   where customer_id = v_uid;
  update public.profiles
     set full_name = null, phone = null, email = null, avatar_path = null, is_active = false, location_consent_at = null
   where id = v_uid;
  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, after_state)
  values (null, 'account_closed_by_user', 'profiles', v_uid::text, jsonb_build_object('role', v_role));
end $$;

-- ───────────────────────── privileges ─────────────────────────
revoke execute on function public.create_support_ticket(text, text, text, uuid), public.reply_support_ticket(uuid, text),
  public.order_review_state(uuid), public.close_my_account() from public, anon;
grant execute on function public.create_support_ticket(text, text, text, uuid), public.reply_support_ticket(uuid, text),
  public.order_review_state(uuid), public.close_my_account() to authenticated;
grant execute on function public.store_reviews(uuid, int, int) to anon, authenticated;
