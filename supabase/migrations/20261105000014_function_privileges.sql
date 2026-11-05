-- LocalLoop · 0014 · function privileges — the single source of truth
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC, and Supabase adds
-- default grants to anon/authenticated/service_role. A per-schema
-- `alter default privileges ... revoke` cannot undo the global PUBLIC grant,
-- so we revoke explicitly here and re-grant an allowlist. Anything not listed
-- is callable only by its owner (i.e. from inside other SECURITY DEFINER
-- functions, triggers and cron).
--
-- Every future migration that adds a client-callable function must add it
-- here (or in a later migration of the same shape).

revoke execute on all functions in schema public from public, anon, authenticated, service_role;

-- ── usable by everyone (policy helpers, CHECK constraints, pure helpers) ──
grant execute on function
  public.current_app_role(),
  public.admin_can(text),
  public.is_admin(),
  public.owns_store(uuid),
  public.owns_product(uuid),
  public.demo_data_visible(),
  public.store_is_public(uuid),
  public.product_is_public(uuid),
  public.can_view_order(uuid),
  public.is_open_at(jsonb, text, timestamptz),
  public.valid_opening_hours(jsonb),
  public._point(double precision, double precision),
  public._uuid_or_null(text)
to anon, authenticated, service_role;

-- ── public discovery ──
grant execute on function
  public.nearby_stores(double precision, double precision, numeric, uuid, boolean, text, text, integer, integer),
  public.search_products(double precision, double precision, text, numeric, uuid, numeric, numeric, boolean, integer, integer),
  public.area_status(double precision, double precision),
  public.estimate_delivery_minutes(double precision, integer)
to anon, authenticated;

-- ── signed-in users (each function checks the caller's role itself) ──
grant execute on function
  -- onboarding
  public.choose_role(public.app_role),
  public.register_vendor(text, text, uuid, text, text),
  public.register_delivery_partner(text, public.vehicle_type, text, text, text),
  -- customer
  public.quote_cart(uuid, text),
  public.start_cart(uuid),
  public.place_order(uuid, public.payment_method, uuid, text, text),
  public.customer_cancel_order(uuid, text),
  public.get_order_tracking(uuid),
  public.submit_review(uuid, public.review_target, smallint, text, uuid),
  -- vendor
  public.vendor_accept_order(uuid, integer),
  public.vendor_reject_order(uuid, text),
  public.vendor_mark_preparing(uuid),
  public.vendor_mark_ready(uuid),
  public.vendor_cancel_order(uuid, text),
  public.vendor_request_delivery(uuid),
  -- delivery partner
  public.partner_set_online(boolean, double precision, double precision, real),
  public.update_driver_location(double precision, double precision, real, real, real, timestamptz),
  public.partner_offers(),
  public.partner_accept_assignment(uuid),
  public.partner_reject_assignment(uuid),
  public.partner_confirm_pickup(uuid),
  public.partner_complete_delivery(uuid, text),
  public.partner_active_job(uuid),
  -- admin (each checks admin_can)
  public.admin_set_admin_role(uuid, public.admin_role),
  public.admin_overview()
to authenticated;

-- ── server only (edge functions with the service-role key, cron) ──
grant execute on function
  public.record_route(uuid, public.route_leg, double precision, double precision, double precision, double precision,
                      integer, integer, text, boolean, text, text, text),
  public.eta_context(uuid),
  public.expire_offers_and_redispatch(),
  public.purge_old_locations(),
  public.notify(uuid, text, jsonb)
to service_role;
