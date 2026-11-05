# Database

All schema lives in `supabase/migrations` (applied in filename order). Never
change a production database by hand — add a migration.

| Migration | Contents |
|---|---|
| 0001 | Extensions (PostGIS, pgcrypto, pg_trgm) and enums |
| 0002 | `serviceable_areas`, `app_settings`, `profiles` (+ auth trigger), `customers`, `admin_users`, `vendors`, `delivery_partners`, `addresses`, `push_tokens` |
| 0003 | `categories`, opening-hours validation, `stores` (auto area assignment, moderation guard), `products`, `product_images`, `product_variants`, `inventory`, `vendor_documents`, `delivery_documents` |
| 0004 | `carts`, `cart_items`, `coupons`, `orders` (+ state machine & history triggers), `order_secrets` (delivery OTP), `order_items`, `order_status_history`, `payments`, `payment_events`, `commissions`, `coupon_redemptions` |
| 0005 | `delivery_assignments` (offers + live tracking snapshot), `driver_locations`, `delivery_routes` |
| 0006 | `reviews`, `review_reports`, `notifications`, `support_tickets`, `support_messages`, `admin_audit_logs` |
| 0007 | Grants, RLS policies for every table, policy helpers, guard triggers, admin audit trigger |
| 0008 | Onboarding (`choose_role`, `register_vendor`, `register_delivery_partner`) and discovery (`nearby_stores`, `search_products`, `area_status`) |
| 0009 | Cart pricing (`quote_cart`), `place_order`, customer/vendor order actions |
| 0010 | Dispatch engine, partner availability/offers/pickup/OTP completion, `update_driver_location`, `get_order_tracking`, `record_route`, retention |
| 0011 | Reviews + rating aggregates, low-stock and verification notifications, `admin_overview`, `admin_set_admin_role` |
| 0012 | Storage buckets + policies, Realtime publication, pg_cron jobs, push trigger (pg_net) |
| 0013 | Reference data: settings, bilingual categories, Kamareddy launch area |
| 0014 | Function EXECUTE allowlist (single source of truth) |
| 0015 | `wishlist_items` |

The 30 tables from the brief are all present; 8 more were added where the
design needed them (`admin_users`, `order_secrets`, `payment_events`,
`coupon_redemptions`, `review_reports`, `support_messages`, `push_tokens`,
`wishlist_items`).

## Order lifecycle
```
placed ─► accepted ─► preparing ─► ready_for_pickup ─► picked_up ─► delivered
  │          │            │               │
  ├► rejected └──────────► cancelled ◄────┘
  └► cancelled (customer, before acceptance only)
```
Enforced by `orders_enforce_transition` (rejects anything else with
`invalid_transition`) and mirrored in `packages/shared/src/constants/order.ts`
(a unit test fails if they diverge).

## Error codes
Business errors raise SQLSTATE `P0001` with a snake_case message (e.g.
`insufficient_stock`). The list is in `packages/shared/src/types/errors.ts`;
both locale files must translate each one (enforced by test).

## Types
`packages/shared/src/types/database.ts` is generated from the migrated schema:
```bash
supabase gen types typescript --local > packages/shared/src/types/database.ts
# or, without the CLI, against any migrated Postgres:
PGHOST=… PGUSER=… python3 scripts/gen-db-types.py <dbname>
```

## Adding a function the apps can call
1. Create it in a new migration (`security definer`, `set search_path = public, extensions`, check `auth.uid()`/role first).
2. Add it to a grant block like the one in `…0014` (otherwise clients get `permission denied`).
3. Add a pgTAP test, regenerate types.
