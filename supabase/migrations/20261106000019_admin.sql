-- LocalLoop · 0019 · admin operations (Phase 5)
-- Order intervention, live operations map, account activation, COD cash
-- settlement and vendor payouts. Every function checks admin_can() itself and
-- writes an admin_audit_logs row; nothing here is reachable by other roles.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public._require_admin(p_perm text) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can(p_perm) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return auth.uid();
end $$;

create or replace function public._audit(p_action text, p_entity text, p_id text, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, before_state, after_state)
  values (auth.uid(), p_action, p_entity, p_id, p_before, p_after);
$$;

-- An order already with the partner can now be closed by an admin (customer
-- unreachable, wrong address, accident). Customer and vendor cancellation
-- RPCs keep their own narrower status checks, so this only widens admin power.
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select case p_from
    when 'placed' then p_to in ('accepted', 'rejected', 'cancelled')
    when 'accepted' then p_to in ('preparing', 'ready_for_pickup', 'cancelled')
    when 'preparing' then p_to in ('ready_for_pickup', 'cancelled')
    when 'ready_for_pickup' then p_to in ('picked_up', 'cancelled')
    when 'picked_up' then p_to in ('delivered', 'cancelled')
    else false
  end
$$;

-- ───────────────────────── orders ─────────────────────────
-- Cancels any open order. Stock goes back only if the goods are still at the
-- shop (or the admin confirms they were returned).
create or replace function public.admin_cancel_order(p_order_id uuid, p_reason text, p_restock boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public._require_admin('orders');
  v_order public.orders;
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
begin
  if char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status not in ('placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up') then
    raise exception 'cancel_not_allowed' using errcode = 'P0001';
  end if;

  update public.orders set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_admin where id = p_order_id;
  if coalesce(p_restock, v_order.status <> 'picked_up') then perform public._restock_order(p_order_id); end if;
  perform public._close_payment_on_cancel(p_order_id);
  perform public._cancel_open_assignments(p_order_id);

  perform public.notify(v_order.customer_id, 'order_cancelled',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'reason', v_reason));
  perform public.notify(s.vendor_id, 'order_cancelled',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'reason', v_reason))
    from public.stores s where s.id = v_order.store_id;
  perform public._audit('cancel_order', 'orders', p_order_id::text,
    jsonb_build_object('status', v_order.status), jsonb_build_object('status', 'cancelled', 'reason', v_reason));
end $$;

-- Sends fresh offers. With p_release_partner, first takes the order away from
-- a partner who accepted but hasn't picked up (not responding, vehicle trouble).
create or replace function public.admin_redispatch(p_order_id uuid, p_release_partner boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_released uuid;
  v_sent integer;
begin
  perform public._require_admin('deliveries');
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status not in ('accepted', 'preparing', 'ready_for_pickup') then
    raise exception 'dispatch_not_allowed' using errcode = 'P0001';
  end if;
  if p_release_partner then
    update public.delivery_assignments set status = 'cancelled', responded_at = coalesce(responded_at, now())
     where order_id = p_order_id and status = 'accepted'
    returning partner_id into v_released;
    if v_released is not null then
      perform public.notify(v_released, 'assignment_cancelled', jsonb_build_object('order_id', p_order_id));
    end if;
  end if;
  if exists (select 1 from public.delivery_assignments where order_id = p_order_id and status in ('accepted', 'picked_up')) then
    raise exception 'already_assigned' using errcode = 'P0001';
  end if;
  -- Offers still open don't block a fresh round to more partners.
  update public.delivery_assignments set status = 'expired' where order_id = p_order_id and status = 'offered';
  v_sent := public.dispatch_order_internal(p_order_id);
  perform public._audit('redispatch', 'orders', p_order_id::text,
    case when v_released is null then null else jsonb_build_object('released_partner', v_released) end,
    jsonb_build_object('offers_sent', v_sent));
  return v_sent;
end $$;

-- ───────────────────────── live operations map ─────────────────────────
-- One snapshot of everything moving: online partners and open orders, with
-- plain coordinates for the map. Positions older than the freshness setting
-- are returned with their timestamp so the map can grey them out.
create or replace function public.admin_live_map()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public._require_admin('deliveries');
  return jsonb_build_object(
    'generated_at', now(),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dp.id, 'name', p.full_name, 'phone', p.phone, 'vehicle_type', dp.vehicle_type,
        'latitude', st_y(dp.current_location::geometry), 'longitude', st_x(dp.current_location::geometry),
        'location_at', dp.current_location_at,
        'busy', exists (select 1 from public.delivery_assignments a
                         where a.partner_id = dp.id and a.status in ('accepted', 'picked_up'))
      ) order by p.full_name)
      from public.delivery_partners dp join public.profiles p on p.id = dp.id
      where dp.is_online and dp.current_location is not null), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'placed_at', o.placed_at,
        'total', o.total, 'store_name', s.name,
        'store', jsonb_build_object('latitude', st_y(s.location::geometry), 'longitude', st_x(s.location::geometry)),
        'drop', jsonb_build_object('latitude', st_y(o.delivery_location::geometry), 'longitude', st_x(o.delivery_location::geometry)),
        'partner_id', a.partner_id, 'partner_name', pp.full_name, 'assignment_status', a.status,
        'eta_seconds', a.eta_seconds, 'eta_computed_at', a.eta_computed_at,
        'waiting_for_partner', o.status in ('accepted', 'preparing', 'ready_for_pickup') and a.id is null
      ) order by o.placed_at)
      from public.orders o
      join public.stores s on s.id = o.store_id
      left join lateral (select * from public.delivery_assignments x
                          where x.order_id = o.id and x.status in ('accepted', 'picked_up') limit 1) a on true
      left join public.profiles pp on pp.id = a.partner_id
      where o.status in ('placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up') and not o.is_demo), '[]'::jsonb)
  );
end $$;

-- ───────────────────────── accounts ─────────────────────────
-- Blocks or restores sign-in for any non-admin account. A blocked partner is
-- taken offline; their active delivery (if any) has to be redispatched.
create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles;
begin
  perform public._require_admin('users');
  if p_user_id = auth.uid() then raise exception 'cannot_change_own_role' using errcode = 'P0001'; end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile.id is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if v_profile.role = 'admin' then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not p_active and char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.profiles set is_active = p_active where id = p_user_id;
  if not p_active then
    update public.delivery_partners set is_online = false where id = p_user_id;
  end if;
  perform public._audit(case when p_active then 'activate_user' else 'block_user' end, 'profiles', p_user_id::text,
    jsonb_build_object('is_active', v_profile.is_active),
    jsonb_build_object('is_active', p_active, 'reason', nullif(trim(coalesce(p_reason, '')), '')));
end $$;

-- ───────────────────────── money ─────────────────────────
-- Cash a partner collected on COD orders is owed to the platform until they
-- hand it over; each hand-over is one settlement row.
create table public.partner_cash_settlements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.delivery_partners (id),
  amount numeric(10,2) not null check (amount > 0),
  payment_count integer not null check (payment_count > 0),
  note text check (char_length(note) <= 300),
  received_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.payments add column cash_settlement_id uuid references public.partner_cash_settlements (id);
create index payments_unsettled_cash on public.payments (collected_by)
  where method = 'cod' and status = 'paid' and cash_settlement_id is null;

-- Money owed to a shop: vendor_payout on each delivered order's commission row.
create table public.vendor_payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id),
  amount numeric(10,2) not null check (amount > 0),
  order_count integer not null check (order_count > 0),
  reference text not null check (char_length(reference) between 4 and 60), -- bank UTR / UPI reference
  paid_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.commissions add column payout_id uuid references public.vendor_payouts (id);
create index commissions_unsettled on public.commissions (vendor_id) where settled_at is null;

alter table public.partner_cash_settlements enable row level security;
alter table public.vendor_payouts enable row level security;
grant select on public.partner_cash_settlements, public.vendor_payouts to authenticated;
create policy cash_settlements_read on public.partner_cash_settlements for select to authenticated
  using (partner_id = auth.uid() or public.admin_can('payments'));
create policy vendor_payouts_read on public.vendor_payouts for select to authenticated
  using (vendor_id = auth.uid() or public.admin_can('commissions'));

-- What each partner currently holds, and what each vendor is owed.
create or replace function public.admin_balances()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_partners jsonb := '[]'; v_vendors jsonb := '[]';
begin
  if not (public.admin_can('payments') or public.admin_can('commissions')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if public.admin_can('payments') then
    select coalesce(jsonb_agg(x order by x ->> 'name'), '[]') into v_partners from (
      select jsonb_build_object('partner_id', p.collected_by, 'name', pr.full_name, 'phone', pr.phone,
                                'amount', sum(p.amount), 'payments', count(*), 'oldest', min(p.paid_at)) x
        from public.payments p join public.profiles pr on pr.id = p.collected_by
       where p.method = 'cod' and p.status = 'paid' and p.cash_settlement_id is null and p.collected_by is not null
       group by p.collected_by, pr.full_name, pr.phone) s;
  end if;
  if public.admin_can('commissions') then
    select coalesce(jsonb_agg(x order by x ->> 'business_name'), '[]') into v_vendors from (
      select jsonb_build_object('vendor_id', c.vendor_id, 'business_name', v.business_name, 'phone', pr.phone,
                                'amount', sum(c.vendor_payout), 'commission', sum(c.commission_amount),
                                'orders', count(*), 'oldest', min(o.delivered_at)) x
        from public.commissions c
        join public.orders o on o.id = c.order_id and o.status = 'delivered' and not o.is_demo
        join public.vendors v on v.id = c.vendor_id
        join public.profiles pr on pr.id = c.vendor_id
       where c.settled_at is null
       group by c.vendor_id, v.business_name, pr.phone) s;
  end if;
  return jsonb_build_object('partners', v_partners, 'vendors', v_vendors);
end $$;

-- Records that a partner handed over their cash. p_expected is the amount the
-- admin saw and counted; if more cash was collected in the meantime the call
-- fails rather than settling money nobody counted.
create or replace function public.admin_settle_partner_cash(p_partner_id uuid, p_expected numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public._require_admin('payments');
  v_amount numeric;
  v_count integer;
  v_id uuid;
begin
  perform 1 from public.delivery_partners where id = p_partner_id for update;
  select coalesce(sum(amount), 0), count(*) into v_amount, v_count from public.payments
   where collected_by = p_partner_id and method = 'cod' and status = 'paid' and cash_settlement_id is null;
  if v_count = 0 then raise exception 'nothing_to_settle' using errcode = 'P0001'; end if;
  if v_amount <> p_expected then raise exception 'amount_changed' using errcode = 'P0001'; end if;
  insert into public.partner_cash_settlements (partner_id, amount, payment_count, note, received_by)
  values (p_partner_id, v_amount, v_count, nullif(left(trim(coalesce(p_note, '')), 300), ''), v_admin)
  returning id into v_id;
  update public.payments set cash_settlement_id = v_id
   where collected_by = p_partner_id and method = 'cod' and status = 'paid' and cash_settlement_id is null;
  perform public._audit('settle_partner_cash', 'partner_cash_settlements', v_id::text, null,
    jsonb_build_object('partner_id', p_partner_id, 'amount', v_amount, 'payments', v_count));
  return v_id;
end $$;

-- Records a bank/UPI transfer to a vendor covering all unpaid delivered orders.
create or replace function public.admin_record_vendor_payout(p_vendor_id uuid, p_expected numeric, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public._require_admin('commissions');
  v_ref text := upper(trim(coalesce(p_reference, '')));
  v_amount numeric;
  v_count integer;
  v_id uuid;
begin
  if char_length(v_ref) not between 4 and 60 then raise exception 'reference_required' using errcode = 'P0001'; end if;
  perform 1 from public.vendors where id = p_vendor_id for update;
  select coalesce(sum(c.vendor_payout), 0), count(*) into v_amount, v_count
    from public.commissions c join public.orders o on o.id = c.order_id and o.status = 'delivered' and not o.is_demo
   where c.vendor_id = p_vendor_id and c.settled_at is null;
  if v_count = 0 then raise exception 'nothing_to_settle' using errcode = 'P0001'; end if;
  if v_amount <> p_expected then raise exception 'amount_changed' using errcode = 'P0001'; end if;
  insert into public.vendor_payouts (vendor_id, amount, order_count, reference, paid_by)
  values (p_vendor_id, v_amount, v_count, v_ref, v_admin) returning id into v_id;
  update public.commissions c set settled_at = now(), payout_id = v_id
    from public.orders o
   where o.id = c.order_id and o.status = 'delivered' and not o.is_demo
     and c.vendor_id = p_vendor_id and c.settled_at is null;
  perform public.notify(p_vendor_id, 'payout_sent', jsonb_build_object('amount', v_amount, 'orders', v_count, 'reference', v_ref));
  perform public._audit('vendor_payout', 'vendor_payouts', v_id::text, null,
    jsonb_build_object('vendor_id', p_vendor_id, 'amount', v_amount, 'orders', v_count, 'reference', v_ref));
  return v_id;
end $$;

-- Partner home: cash in hand is everything not yet handed over, not just today's.
create or replace function public.partner_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('delivery_partner');
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_week timestamptz := v_today - interval '6 days';
begin
  if not exists (select 1 from public.delivery_partners where id = v_uid) then
    raise exception 'partner_not_registered' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'deliveries_today', (select count(*) from public.delivery_assignments
                          where partner_id = v_uid and status = 'delivered' and delivered_at >= v_today),
    'earnings_today', (select coalesce(sum(earning), 0) from public.delivery_assignments
                        where partner_id = v_uid and status = 'delivered' and delivered_at >= v_today),
    'deliveries_7d', (select count(*) from public.delivery_assignments
                       where partner_id = v_uid and status = 'delivered' and delivered_at >= v_week),
    'earnings_7d', (select coalesce(sum(earning), 0) from public.delivery_assignments
                     where partner_id = v_uid and status = 'delivered' and delivered_at >= v_week),
    'cash_in_hand', (select coalesce(sum(p.amount), 0) from public.payments p
                      where p.collected_by = v_uid and p.method = 'cod' and p.status = 'paid' and p.cash_settlement_id is null),
    'rating_avg', (select rating_avg from public.delivery_partners where id = v_uid),
    'rating_count', (select rating_count from public.delivery_partners where id = v_uid),
    'active_assignment_id', (select id from public.delivery_assignments
                              where partner_id = v_uid and status in ('accepted', 'picked_up')
                              order by responded_at desc nulls last limit 1)
  );
end $$;

-- ───────────────────────── support ─────────────────────────
-- Staff reply: adds the message, moves the ticket to in_progress (or the
-- chosen status) and notifies the customer.
create or replace function public.admin_reply_ticket(p_ticket_id uuid, p_body text, p_status public.ticket_status default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public._require_admin('tickets');
  v_ticket public.support_tickets;
  v_body text := trim(coalesce(p_body, ''));
begin
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  if v_body <> '' then
    insert into public.support_messages (ticket_id, author_id, is_staff, body) values (p_ticket_id, v_admin, true, left(v_body, 4000));
    perform public.notify(v_ticket.user_id, 'support_reply', jsonb_build_object('ticket_id', p_ticket_id, 'subject', v_ticket.subject));
  end if;
  update public.support_tickets
     set status = coalesce(p_status, case when v_ticket.status = 'open' then 'in_progress'::public.ticket_status else v_ticket.status end),
         assigned_admin = coalesce(assigned_admin, v_admin)
   where id = p_ticket_id;
end $$;

-- ───────────────────────── privileges ─────────────────────────
revoke execute on function public._require_admin(text), public._audit(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_cancel_order(uuid, text, boolean), public.admin_redispatch(uuid, boolean),
  public.admin_live_map(), public.admin_set_user_active(uuid, boolean, text), public.admin_balances(),
  public.admin_settle_partner_cash(uuid, numeric, text), public.admin_record_vendor_payout(uuid, numeric, text),
  public.admin_reply_ticket(uuid, text, public.ticket_status) from public, anon;
grant execute on function public.admin_cancel_order(uuid, text, boolean), public.admin_redispatch(uuid, boolean),
  public.admin_live_map(), public.admin_set_user_active(uuid, boolean, text), public.admin_balances(),
  public.admin_settle_partner_cash(uuid, numeric, text), public.admin_record_vendor_payout(uuid, numeric, text),
  public.admin_reply_ticket(uuid, text, public.ticket_status) to authenticated;
