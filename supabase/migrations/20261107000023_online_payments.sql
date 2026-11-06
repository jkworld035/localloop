-- LocalLoop · 0023 · online payments with Razorpay (Phase 7b)
--
-- Flow: place_order(..., 'razorpay') creates the order in awaiting_payment
-- (stock reserved, shop not told) → the razorpay-pay function creates a
-- Razorpay payment link → the customer pays (UPI/card/netbanking) → Razorpay's
-- signed webhook calls confirm_online_payment(), which moves the order to
-- placed and notifies the shop. The app never decides that a payment
-- succeeded. Unpaid orders are cancelled after payment_window_minutes and
-- their stock released; money that arrives after that is refunded
-- automatically, as is any paid order that the shop rejects or that is
-- cancelled. Off until online_payments_enabled is switched on.

-- ───────────────────────── settings & columns ─────────────────────────
insert into public.app_settings (key, value, is_public, description) values
  ('online_payments_enabled', 'false', true, 'Offer UPI / card / netbanking through Razorpay at checkout. Needs the Razorpay keys set as secrets.'),
  ('payment_window_minutes', '20', true, 'Minutes a customer has to finish paying online before the order is cancelled and stock released.')
on conflict (key) do nothing;

-- When the shop was told about the order (immediately for cash; on payment for online).
alter table public.orders add column released_at timestamptz;
update public.orders set released_at = placed_at where released_at is null and status <> 'awaiting_payment';

alter table public.payments
  add column checkout_url text,
  add column checkout_expires_at timestamptz,
  add column refund_status text check (refund_status in ('requested', 'processing', 'processed', 'failed')),
  add column refund_id text unique,
  add column refunded_at timestamptz,
  add column refund_error text;
create index payments_refund_queue on public.payments (refund_status) where refund_status in ('requested', 'failed');

-- ───────────────────────── state machine ─────────────────────────
-- plpgsql (not sql) so creating it doesn't evaluate the new enum value.
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language plpgsql immutable as $$
begin
  return case p_from
    when 'awaiting_payment' then p_to in ('placed', 'cancelled')
    when 'placed' then p_to in ('accepted', 'rejected', 'cancelled')
    when 'accepted' then p_to in ('preparing', 'ready_for_pickup', 'cancelled')
    when 'preparing' then p_to in ('ready_for_pickup', 'cancelled')
    when 'ready_for_pickup' then p_to in ('picked_up', 'cancelled')
    when 'picked_up' then p_to in ('delivered', 'cancelled')
    else false
  end;
end $$;

create or replace function public.orders_enforce_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status::text not in ('placed', 'awaiting_payment') then
      raise exception 'Orders must start as placed or awaiting_payment' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.order_transition_allowed(old.status, new.status) then
      raise exception 'invalid_transition' using errcode = 'P0001',
        detail = format('%s → %s', old.status, new.status);
    end if;
    case new.status::text
      when 'placed' then new.released_at := coalesce(new.released_at, now());
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

-- Shops only ever see orders that were released to them.
create or replace function public.can_view_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and (
         o.customer_id = auth.uid()
         or (o.released_at is not null
             and exists (select 1 from public.stores s where s.id = o.store_id and s.vendor_id = auth.uid()))
         or exists (select 1 from public.delivery_assignments da
                     where da.order_id = o.id and da.partner_id = auth.uid()
                       and da.status in ('accepted', 'picked_up', 'delivered'))
         or public.admin_can('orders')
       )
  )
$$;

-- ───────────────────────── placing & cancelling ─────────────────────────
create or replace function public.place_order(
  p_address_id uuid,
  p_payment_method public.payment_method,
  p_idempotency_key uuid,
  p_coupon_code text default null,
  p_instructions text default ''
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public._require_role('customer');
  v_existing public.orders;
  v_cart public.carts;
  v_quote jsonb;
  v_issue text;
  v_addr public.addresses;
  v_order_id uuid;
  v_order_number text;
  v_bytes bytea;
  v_recent int;
  v_vendor uuid;
  item jsonb;
begin
  if p_idempotency_key is null then raise exception 'idempotency_key_required' using errcode = 'P0001'; end if;

  -- Duplicate submit (double tap, retry after timeout) returns the original order.
  select * into v_existing from public.orders where customer_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number,
                              'total', v_existing.total, 'duplicate', true,
                              'awaiting_payment', v_existing.status = 'awaiting_payment');
  end if;

  select count(*) into v_recent from public.orders where customer_id = v_uid and placed_at > now() - interval '10 minutes';
  if v_recent >= coalesce(public.setting_num('max_orders_per_10min'), 5) then
    raise exception 'too_many_orders' using errcode = 'P0001';
  end if;

  if p_payment_method = 'razorpay' and not coalesce((public.setting('online_payments_enabled') #>> '{}')::boolean, false) then
    raise exception 'payment_method_unavailable' using errcode = 'P0001';
  end if;
  if p_payment_method = 'test' and not coalesce((public.setting('test_payments_enabled') #>> '{}')::boolean, false) then
    raise exception 'payment_method_unavailable' using errcode = 'P0001';
  end if;

  select * into v_cart from public.carts where customer_id = v_uid for update;
  if v_cart.id is null then raise exception 'cart_empty' using errcode = 'P0001'; end if;

  -- Lock stock rows in a stable order so concurrent checkouts cannot oversell or deadlock.
  perform 1 from public.inventory i
   where i.variant_id in (select variant_id from public.cart_items where cart_id = v_cart.id)
   order by i.variant_id for update;

  v_quote := public._cart_quote(v_uid, p_address_id, p_coupon_code);
  v_issue := v_quote -> 'issues' ->> 0;
  if v_issue is not null then
    raise exception '%', split_part(v_issue, ':', 1) using errcode = 'P0001', detail = v_issue;
  end if;

  select * into v_addr from public.addresses where id = p_address_id;
  v_order_number := 'LL' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-'
                    || lpad((nextval('public.order_number_seq') % 1000000)::text, 6, '0');

  insert into public.orders (
    order_number, customer_id, store_id, address_id, delivery_address, delivery_location, delivery_instructions,
    subtotal, delivery_fee, discount, tax, total, coupon_id, payment_method, payment_status, idempotency_key,
    is_demo, status, released_at
  ) values (
    v_order_number, v_uid, (v_quote ->> 'store_id')::uuid, v_addr.id,
    jsonb_build_object('label', v_addr.label, 'contact_name', v_addr.contact_name, 'contact_phone', v_addr.contact_phone,
                       'line1', v_addr.line1, 'line2', v_addr.line2, 'landmark', v_addr.landmark,
                       'locality', v_addr.locality, 'city', v_addr.city, 'state', v_addr.state, 'pincode', v_addr.pincode),
    v_addr.location, left(coalesce(p_instructions, ''), 300),
    (v_quote ->> 'subtotal')::numeric, (v_quote ->> 'delivery_fee')::numeric, (v_quote ->> 'discount')::numeric,
    (v_quote ->> 'tax')::numeric, (v_quote ->> 'total')::numeric, (v_quote ->> 'coupon_id')::uuid,
    p_payment_method, case when p_payment_method = 'test' then 'paid' else 'pending' end::public.payment_status,
    p_idempotency_key,
    (select is_demo from public.stores where id = (v_quote ->> 'store_id')::uuid),
    -- Online payments wait for Razorpay before the shop is told.
    case when p_payment_method = 'razorpay' then 'awaiting_payment' else 'placed' end::public.order_status,
    case when p_payment_method = 'razorpay' then null else now() end
  ) returning id into v_order_id;

  for item in select * from jsonb_array_elements(v_quote -> 'items') loop
    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_label, unit_price, quantity, line_total)
    values (v_order_id, (item ->> 'product_id')::uuid, (item ->> 'variant_id')::uuid, item ->> 'product_name',
            item ->> 'variant_label', (item ->> 'unit_price')::numeric, (item ->> 'quantity')::int,
            (item ->> 'line_total')::numeric);
    update public.inventory set quantity = quantity - (item ->> 'quantity')::int
     where variant_id = (item ->> 'variant_id')::uuid and track_inventory;
  end loop;

  v_bytes := extensions.gen_random_bytes(2);
  insert into public.order_secrets (order_id, delivery_otp)
  values (v_order_id, lpad((((get_byte(v_bytes, 0) << 8) | get_byte(v_bytes, 1)) % 10000)::text, 4, '0'));

  insert into public.payments (order_id, method, amount, status, provider_payment_id, paid_at)
  values (v_order_id, p_payment_method, (v_quote ->> 'total')::numeric,
          case when p_payment_method = 'test' then 'paid' else 'pending' end::public.payment_status,
          case when p_payment_method = 'test' then 'test_' || replace(v_order_id::text, '-', '') end,
          case when p_payment_method = 'test' then now() end);

  if (v_quote ->> 'coupon_id') is not null then
    insert into public.coupon_redemptions (coupon_id, customer_id, order_id, amount)
    values ((v_quote ->> 'coupon_id')::uuid, v_uid, v_order_id, (v_quote ->> 'discount')::numeric);
    update public.coupons set times_used = times_used + 1 where id = (v_quote ->> 'coupon_id')::uuid;
  end if;

  delete from public.cart_items where cart_id = v_cart.id;

  if p_payment_method <> 'razorpay' then
    select vendor_id into v_vendor from public.stores where id = (v_quote ->> 'store_id')::uuid;
    perform public.notify(v_uid, 'order_placed', jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number));
    perform public.notify(v_vendor, 'new_order', jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                                                                  'total', v_quote ->> 'total'));
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                            'total', (v_quote ->> 'total')::numeric, 'duplicate', false,
                            'awaiting_payment', p_payment_method = 'razorpay');
end $$;

-- Customers may also cancel while payment is still pending.
create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('customer');
  v_order public.orders;
  v_vendor uuid;
begin
  select * into v_order from public.orders where id = p_order_id and customer_id = v_uid for update;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  -- Customers can cancel freely only before the shop accepts; afterwards via support.
  if v_order.status::text not in ('placed', 'awaiting_payment') then raise exception 'cancel_not_allowed' using errcode = 'P0001'; end if;
  update public.orders set status = 'cancelled', cancel_reason = left(coalesce(p_reason, ''), 300), cancelled_by = v_uid
   where id = p_order_id;
  perform public._restock_order(p_order_id);
  perform public._close_payment_on_cancel(p_order_id);
  if v_order.released_at is not null then
    select vendor_id into v_vendor from public.stores where id = v_order.store_id;
    perform public.notify(v_vendor, 'order_cancelled', jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number));
  end if;
end $$;

-- Closing an order: online money that was received is refunded through
-- Razorpay (queued for the razorpay-refund function); pending payments fail.
create or replace function public._close_payment_on_cancel(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payments
     set refund_status = 'requested', refund_error = null
   where order_id = p_order_id and method = 'razorpay' and status = 'paid' and refund_status is null;
  update public.payments
     set status = case when status = 'paid' then 'refunded'::public.payment_status else 'failed'::public.payment_status end,
         failure_reason = coalesce(failure_reason, 'order_closed')
   where order_id = p_order_id and method <> 'razorpay' and status in ('pending', 'paid');
  update public.payments set status = 'failed', failure_reason = coalesce(failure_reason, 'order_closed')
   where order_id = p_order_id and method = 'razorpay' and status = 'pending';
  update public.orders o
     set payment_status = case when o.payment_status = 'paid' and o.payment_method <> 'razorpay' then 'refunded'::public.payment_status
                               when o.payment_status = 'pending' then 'failed'::public.payment_status
                               else o.payment_status end
   where o.id = p_order_id;
end $$;

-- ───────────────────────── payment confirmation (server only) ─────────────────────────
-- Everything the razorpay-pay function needs to create a payment link.
create or replace function public.online_payment_context(p_order_id uuid, p_customer_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', o.order_number, 'status', o.status, 'amount', p.amount,
    'payment_id', p.id, 'payment_status', p.status, 'checkout_url', p.checkout_url,
    'checkout_expires_at', p.checkout_expires_at, 'store_name', s.name,
    'customer_name', pr.full_name, 'customer_phone', pr.phone,
    'expires_at', o.created_at + make_interval(mins => coalesce(public.setting_num('payment_window_minutes'), 20)::int))
    from public.orders o
    join public.payments p on p.order_id = o.id and p.method = 'razorpay'
    join public.stores s on s.id = o.store_id
    join public.profiles pr on pr.id = o.customer_id
   where o.id = p_order_id and o.customer_id = p_customer_id
$$;

-- Called from the signed Razorpay webhook. Idempotent. Returns:
-- ok | duplicate | refund (money arrived for a closed order) | amount_mismatch | unknown
create or replace function public.confirm_online_payment(p_link_id text, p_payment_id text, p_amount_paise bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payments;
  v_order public.orders;
  v_vendor uuid;
begin
  select * into v_pay from public.payments where provider_order_id = p_link_id for update;
  if v_pay.id is null then return 'unknown'; end if;
  if v_pay.status = 'paid' or v_pay.provider_payment_id = p_payment_id then return 'duplicate'; end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;

  update public.payments set status = 'paid', provider_payment_id = p_payment_id, paid_at = now(), failure_reason = null
   where id = v_pay.id;

  if p_amount_paise <> round(v_pay.amount * 100) then
    update public.payments set refund_status = 'requested', failure_reason = 'amount_mismatch' where id = v_pay.id;
    return 'amount_mismatch';
  end if;

  if v_order.status::text <> 'awaiting_payment' then
    -- Paid after the window closed (or after the customer cancelled): give it back.
    update public.payments set refund_status = 'requested' where id = v_pay.id;
    return 'refund';
  end if;

  update public.orders set payment_status = 'paid', status = 'placed' where id = v_order.id;
  select vendor_id into v_vendor from public.stores where id = v_order.store_id;
  perform public.notify(v_order.customer_id, 'order_placed', jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
  perform public.notify(v_vendor, 'new_order', jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
                                                                'total', v_order.total));
  return 'ok';
end $$;

-- Unpaid online orders are cancelled after the payment window; stock goes back.
create or replace function public.expire_unpaid_orders() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from public.orders
            where status::text = 'awaiting_payment'
              and created_at < now() - make_interval(mins => coalesce(public.setting_num('payment_window_minutes'), 20)::int)
            for update skip locked
  loop
    update public.orders set status = 'cancelled', cancel_reason = 'payment_not_completed' where id = r.id;
    perform public._restock_order(r.id);
    perform public._close_payment_on_cancel(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Queue a refund call as soon as one is requested (same pattern as push delivery).
create or replace function public.payments_dispatch_refund() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_key text;
begin
  if new.refund_status is distinct from 'requested' or old.refund_status is not distinct from 'requested' then return new; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return new; end if;
  begin
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'project_url'$q$ into v_url;
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'$q$ into v_key;
    if v_url is null or v_key is null then return new; end if;
    execute $q$select net.http_post(url := $1, headers := $2, body := $3)$q$
      using v_url || '/functions/v1/razorpay-refund',
            jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
            jsonb_build_object('payment_id', new.id);
  exception when others then
    raise warning 'refund dispatch skipped: %', sqlerrm;
  end;
  return new;
end $$;
create trigger payments_dispatch_refund after update of refund_status on public.payments
  for each row execute function public.payments_dispatch_refund();

-- Every 10 minutes: retry refunds that didn't go through (provider or network trouble).
create or replace function public.refund_sweep() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_key text;
begin
  if not exists (select 1 from public.payments where refund_status in ('requested', 'processing')) then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'project_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'$q$ into v_key;
  if v_url is null or v_key is null then return; end if;
  execute $q$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb)$q$
    using v_url || '/functions/v1/razorpay-refund',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key);
end $$;

-- Admin: ask for a failed refund to be tried again.
create or replace function public.admin_retry_refund(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin('payments');
  update public.payments set refund_status = 'requested', refund_error = null
   where id = p_payment_id and refund_status = 'failed';
  if not found then raise exception 'nothing_to_settle' using errcode = 'P0001'; end if;
  perform public._audit('retry_refund', 'payments', p_payment_id::text, null, null);
end $$;

-- Admin overview: money still to refund (failed attempts need a look).
create or replace function public.admin_refund_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin('payments');
  return coalesce((select jsonb_agg(jsonb_build_object('payment_id', p.id, 'order_id', o.id, 'order_number', o.order_number,
                    'amount', p.amount, 'refund_status', p.refund_status, 'refund_error', p.refund_error, 'paid_at', p.paid_at)
                    order by p.paid_at)
                    from public.payments p join public.orders o on o.id = p.order_id
                   where p.refund_status in ('requested', 'failed')), '[]');
end $$;

-- ───────────────────────── scheduled job ─────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('localloop-expire-unpaid', '* * * * *', 'select public.expire_unpaid_orders()');
    perform cron.schedule('localloop-refund-sweep', '*/10 * * * *', 'select public.refund_sweep()');
  else
    raise notice 'pg_cron not installed — schedule expire_unpaid_orders() (every minute) and refund_sweep() (every 10 minutes) manually';
  end if;
end $$;

-- ───────────────────────── privileges ─────────────────────────
revoke execute on function public.online_payment_context(uuid, uuid), public.confirm_online_payment(text, text, bigint),
  public.expire_unpaid_orders(), public.payments_dispatch_refund(), public._close_payment_on_cancel(uuid),
  public.admin_refund_queue(), public.order_transition_allowed(public.order_status, public.order_status),
  public.refund_sweep(), public.admin_retry_refund(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_refund_queue(), public.admin_retry_refund(uuid) to authenticated;
grant execute on function public.online_payment_context(uuid, uuid), public.confirm_online_payment(text, text, bigint),
  public.expire_unpaid_orders() to service_role;
-- place_order and customer_cancel_order keep their existing grants (create or replace preserves them).
