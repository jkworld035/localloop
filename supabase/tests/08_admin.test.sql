-- Phase 5: admin operations — interventions, live map, accounts, cash and payouts, support.
begin;
\ir _helpers.sql
select plan(25);

select tests.seed_world();
select tests.variant() as variant_id, tests.address() as address_id \gset
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000a004', '919000000013');
select tests.login(tests.id('admin'));
select public.admin_set_admin_role('00000000-0000-0000-0000-00000000a004', 'support');

-- helper: a COD order placed by the customer and accepted by the shop
select tests.su();
create function tests.order_accepted() returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform tests.login(tests.id('customer'));
  perform public.start_cart(tests.store());
  insert into public.cart_items (cart_id, variant_id, quantity)
  select id, tests.variant(), 1 from public.carts where customer_id = tests.id('customer');
  v_id := (public.place_order(tests.address(), 'cod', gen_random_uuid()) ->> 'order_id')::uuid;
  perform tests.login(tests.id('vendor'));
  perform public.vendor_accept_order(v_id, 10);
  return v_id;
end $$;
grant execute on function tests.order_accepted() to public;

select tests.login(tests.id('partner1'));
select public.partner_set_online(true, 18.3204, 78.3371, 8);

-- ── a delivered COD order ─────────────────────────────────
select tests.order_accepted() as o1 \gset
select tests.login(tests.id('partner1'));
select assignment_id as a1 from public.partner_offers() limit 1 \gset
select public.partner_accept_assignment(:'a1');
select tests.login(tests.id('vendor'));
select public.vendor_mark_ready(:'o1');
select tests.login(tests.id('partner1'));
select public.partner_confirm_pickup(:'a1');
select tests.su();
select delivery_otp as otp from public.order_secrets where order_id = :'o1' \gset
select tests.login(tests.id('partner1'));
select public.update_driver_location(18.3299, 78.3419, 5);
select public.partner_complete_delivery(:'a1', :'otp');
select tests.su();
select total as o1_total from public.orders where id = :'o1' \gset

-- ── balances, cash settlement, vendor payout ──────────────
select tests.login(tests.id('admin'));
select is((public.admin_balances() -> 'partners' -> 0 ->> 'amount')::numeric, :'o1_total'::numeric, 'partner holds the COD cash');
select is((public.admin_balances() -> 'vendors' -> 0 ->> 'orders')::int, 1, 'vendor is owed for one delivered order');
select throws_ok(format($$ select public.admin_settle_partner_cash(%L, %s) $$, tests.id('partner1'), :'o1_total'::numeric + 10),
                 'P0001', 'amount_changed', 'settlement refuses an amount that does not match the cash collected');
select lives_ok(format($$ select public.admin_settle_partner_cash(%L, %s, 'Counted at office') $$, tests.id('partner1'), :'o1_total'),
                'cash hand-over recorded');
select is(jsonb_array_length(public.admin_balances() -> 'partners'), 0, 'nothing left to settle for the partner');
select tests.login(tests.id('partner1'));
select is((public.partner_dashboard() ->> 'cash_in_hand')::numeric, 0::numeric, 'partner app shows no cash in hand after settling');
select tests.login(tests.id('admin'));
select (public.admin_balances() -> 'vendors' -> 0 ->> 'amount')::numeric as owed \gset
select throws_ok(format($$ select public.admin_record_vendor_payout(%L, %s, 'x') $$, tests.id('vendor'), :'owed'),
                 'P0001', 'reference_required', 'a payout needs the bank or UPI reference');
select lives_ok(format($$ select public.admin_record_vendor_payout(%L, %s, 'utr123456789') $$, tests.id('vendor'), :'owed'),
                'payout recorded');
select is((select count(*)::int from public.commissions where vendor_id = tests.id('vendor') and settled_at is null), 0,
          'commission rows marked as paid out');
select tests.login(tests.id('vendor'));
select is((select reference from public.vendor_payouts where vendor_id = auth.uid()), 'UTR123456789', 'vendor can see their payout');
select ok(exists (select 1 from public.notifications where user_id = auth.uid() and type = 'payout_sent'), 'vendor notified of payout');

-- ── live map ──────────────────────────────────────────────
select tests.order_accepted() as o2 \gset
select tests.login(tests.id('admin'));
select is((public.admin_live_map() -> 'partners' -> 0 ->> 'name'), 'Suresh Reddy', 'map shows the online partner');
select ok((public.admin_live_map() -> 'orders' -> 0 -> 'drop' ->> 'latitude')::float between 18.32 and 18.34, 'map shows the order drop point');
select is((public.admin_live_map() -> 'orders' -> 0 ->> 'waiting_for_partner')::boolean, true, 'unassigned order flagged');

-- ── redispatch: take the order back from an unresponsive partner ──
select tests.login(tests.id('partner1'));
select assignment_id as a2 from public.partner_offers() limit 1 \gset
select public.partner_accept_assignment(:'a2');
select tests.login(tests.id('admin'));
select throws_ok(format($$ select public.admin_redispatch(%L) $$, :'o2'), 'P0001', 'already_assigned',
                 'redispatch without releasing keeps the current partner');
select lives_ok(format($$ select public.admin_redispatch(%L, true) $$, :'o2'), 'admin releases the partner and redispatches');
select is((select status::text from public.delivery_assignments where id = :'a2'), 'cancelled', 'old assignment cancelled');
select tests.su();
select ok(exists (select 1 from public.notifications where user_id = tests.id('partner1') and type = 'assignment_cancelled'),
          'released partner is told');

-- ── cancel an order already out for delivery ──────────────
select tests.login(tests.id('partner1'));
select public.partner_accept_assignment((select assignment_id from public.partner_offers() limit 1));
select tests.login(tests.id('vendor'));
select public.vendor_mark_ready(:'o2');
select tests.login(tests.id('partner1'));
select public.update_driver_location(18.3204, 78.3371, 5);
select public.partner_confirm_pickup((select id from public.delivery_assignments where order_id = :'o2' and status = 'accepted'));
select tests.su();
select quantity as stock_before from public.inventory where variant_id = :'variant_id' \gset
select tests.login(tests.id('admin'));
select throws_ok(format($$ select public.admin_cancel_order(%L, 'no') $$, :'o2'), 'P0001', 'reason_required', 'cancelling needs a reason');
select lives_ok(format($$ select public.admin_cancel_order(%L, 'Customer unreachable at door') $$, :'o2'), 'admin cancels a picked-up order');
select tests.su();
select is((select quantity from public.inventory where variant_id = :'variant_id'), :'stock_before'::int,
          'goods with the partner are not restocked automatically');
select ok(exists (select 1 from public.admin_audit_logs where action = 'cancel_order' and entity_id = :'o2'), 'cancellation audited');

-- ── accounts ──────────────────────────────────────────────
select tests.login(tests.id('admin'));
select public.admin_set_user_active(tests.id('partner1'), false, 'Repeated no-shows');
select tests.su();
select is((select is_online from public.delivery_partners where id = tests.id('partner1')), false, 'blocked partner is taken offline');

-- ── permissions ───────────────────────────────────────────
select tests.login('00000000-0000-0000-0000-00000000a004');
select throws_ok(format($$ select public.admin_settle_partner_cash(%L, 1) $$, tests.id('partner2')), 'P0001', 'forbidden',
                 'support admins cannot settle cash');
select tests.login(tests.id('customer'));
select throws_ok($$ select public.admin_live_map() $$, 'P0001', 'forbidden', 'customers cannot read the live map');

select * from finish();
rollback;
