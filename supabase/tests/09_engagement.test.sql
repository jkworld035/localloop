-- Phase 6: help & support, ratings, account closure.
begin;
\ir _helpers.sql
select plan(23);

select tests.seed_world();
select tests.variant() as variant_id, tests.address() as address_id \gset

-- An order placed and accepted (left open for the closure checks).
select tests.login(tests.id('customer'));
select public.start_cart(tests.store());
insert into public.cart_items (cart_id, variant_id, quantity)
select id, :'variant_id', 1 from public.carts where customer_id = tests.id('customer');
select (public.place_order(:'address_id', 'cod', gen_random_uuid()) ->> 'order_id') as order_id \gset

-- ── support ───────────────────────────────────────────────
select tests.login(tests.id('customer'));
select throws_ok($$ select public.create_support_ticket('order', 'Hi', 'short') $$, 'P0001', 'ticket_too_short', 'ticket needs a real subject and message');
select throws_ok(format($$ select public.create_support_ticket('order', 'Wrong item', 'I got the wrong rice brand.', %L) $$, gen_random_uuid()),
                 'P0001', 'order_not_found', 'cannot attach someone else''s order');
select public.create_support_ticket('order', 'Wrong item', 'I got the wrong rice brand in my order.', :'order_id') as ticket \gset
select is((select count(*)::int from public.support_messages where ticket_id = :'ticket'), 1, 'first message saved with the ticket');
select is((select priority::text from public.support_tickets where id = :'ticket'), 'normal', 'order questions get normal priority');
select public.create_support_ticket('refund', 'Refund please', 'Please refund my last payment.') as refund_ticket \gset
select is((select priority::text from public.support_tickets where id = :'refund_ticket'), 'high', 'refund questions get high priority');
select public.create_support_ticket('other', 'Question 3', 'Another question about the app.');
select public.create_support_ticket('other', 'Question 4', 'Another question about the app.');
select public.create_support_ticket('other', 'Question 5', 'Another question about the app.');
select throws_ok($$ select public.create_support_ticket('other', 'Question 6', 'Another question about the app.') $$,
                 'P0001', 'too_many_open_tickets', 'at most five open tickets per person');

select tests.login(tests.id('admin'));
select public.admin_reply_ticket(:'ticket', 'Sorry! We will exchange it today.', 'resolved');
select tests.login(tests.id('customer'));
select ok(exists (select 1 from public.notifications where user_id = auth.uid() and type = 'support_reply'), 'customer notified of the reply');
select is((select count(*)::int from public.support_messages where ticket_id = :'ticket' and is_staff), 1, 'customer sees the staff reply');
select public.reply_support_ticket(:'ticket', 'Still waiting for the exchange.');
select is((select status::text from public.support_tickets where id = :'ticket'), 'open', 'replying reopens a resolved ticket');
select tests.login(tests.id('customer2'));
select throws_ok(format($$ select public.reply_support_ticket(%L, 'hello') $$, :'ticket'), 'P0001', 'ticket_not_found', 'others cannot reply');
select tests.login(tests.id('vendor'));
select lives_ok($$ select public.create_support_ticket('store', 'Payout question', 'When will my payout arrive?') $$, 'vendors can ask for help too');

-- ── deliver the order, then rate it ───────────────────────
select tests.login(tests.id('customer'));
select is((public.order_review_state(:'order_id') ->> 'can_review')::boolean, false, 'cannot rate before delivery');
select tests.login(tests.id('partner1'));
select public.partner_set_online(true, 18.3204, 78.3371, 8);
select tests.login(tests.id('vendor'));
select public.vendor_accept_order(:'order_id', 10);
select tests.login(tests.id('partner1'));
select assignment_id as a1 from public.partner_offers() limit 1 \gset
select public.partner_accept_assignment(:'a1');
select tests.login(tests.id('vendor'));
select public.vendor_mark_ready(:'order_id');
select tests.login(tests.id('partner1'));
select public.partner_confirm_pickup(:'a1');
select tests.su();
select delivery_otp as otp from public.order_secrets where order_id = :'order_id' \gset
select tests.login(tests.id('partner1'));
select public.update_driver_location(18.3299, 78.3419, 5);
select public.partner_complete_delivery(:'a1', :'otp');

select tests.login(tests.id('customer'));
select is((public.order_review_state(:'order_id') ->> 'can_review')::boolean, true, 'can rate after delivery');
select is((public.order_review_state(:'order_id') ->> 'partner_name'), 'Suresh', 'partner shown by first name');
select is(jsonb_array_length(public.order_review_state(:'order_id') -> 'products'), 1, 'ordered products listed for rating');
select public.submit_review(:'order_id', 'store', 4::smallint, 'Quick and friendly');
select public.submit_review(:'order_id', 'delivery_partner', 5::smallint);
select is((public.order_review_state(:'order_id') -> 'store' ->> 'rating')::int, 4, 'store rating remembered');
select tests.su();
update public.profiles set full_name = 'Lakshmi Devi' where id = tests.id('customer');
select tests.anon();
select is((select author from public.store_reviews(tests.store())), 'Lakshmi', 'shop page shows the review with the author''s first name (to anyone)');
select tests.su();
update public.reviews set status = 'hidden' where order_id = :'order_id' and target = 'store';
select tests.anon();
select is((select count(*)::int from public.store_reviews(tests.store())), 0, 'hidden reviews are not shown');

-- ── account closure ───────────────────────────────────────
select tests.login(tests.id('partner1'));
select throws_ok($$ select public.close_my_account() $$, 'P0001', 'cash_not_settled', 'partner must hand over COD cash first');
select tests.login(tests.id('customer'));
select lives_ok($$ select public.close_my_account() $$, 'customer closes their account');
select tests.su();
select is((select row(full_name, phone, is_active)::text from public.profiles where id = tests.id('customer')), '(,,f)',
          'name and phone removed, sign-in blocked');
select is((select count(*)::int from public.addresses where user_id = tests.id('customer')), 0, 'saved addresses deleted');
select is((select delivery_address ->> 'contact_phone' from public.orders where id = :'order_id'), null,
          'order kept for accounts without the phone number');

select * from finish();
rollback;
