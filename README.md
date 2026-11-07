# LocalLoop

Hyperlocal commerce and real-time delivery for Indian towns, launching in
Kamareddy, Telangana. Customers discover real nearby shops by GPS, order, and
watch their delivery partner arrive live with a route-based ETA. One Android/iOS
app serves customers, shop owners and delivery partners; operations run from a
web admin dashboard. English and Telugu throughout.

```
apps/mobile        Expo SDK 58 / React Native 0.88 app (all three roles)
apps/admin         Next.js 16 admin dashboard
packages/shared    Generated DB types, validation, order state machine, design tokens
supabase/          Migrations, RLS, RPCs, pgTAP tests, edge functions, local seed
docs/              architecture · database · setup · deployment · testing
```

## Status — Phase 7 (release preparation) complete — launch steps in [docs/go-live.md](docs/go-live.md)

| Area | State |
|---|---|
| Database: 40 tables, PostGIS, RLS on every table, 57 client RPCs, triggers, storage, realtime, cron | ✅ built and tested (244 pgTAP assertions, incl. an automated security gate) |
| Order engine: pricing, idempotent placement, stock locking, state machine, cancellations | ✅ backend and customer screens |
| Dispatch + live tracking backend: offers, first-accept-wins, GPS ingestion, OTP handover, route ETA function | ✅ end to end: partner offers → pickup → OTP handover, customer live map with road-route ETA |
| Auth: phone OTP, role choice, encrypted session storage | ✅ |
| Customer app: onboarding, language, GPS location + map pin, nearby shops, shop & product pages, cart, addresses, Cash-on-Delivery checkout, live order status with delivery code, live map tracking with routed ETA and honest freshness labels, order history, saved items, product search across shops, order again, ratings & reviews, notifications inbox, help & support chat, legal pages, account deletion | ✅ |
| Vendor app: registration, setup checklist, shop editor (map pin, hours, photos), verification documents, products with sizes/prices/stock/photos, live order queue with accept/reject/prepare/ready, dashboard with sales and low stock | ✅ |
| Partner app: registration, documents, profile photo, go online/offline with GPS + background tracking, live delivery requests with server countdown, active job with route map, Google Maps navigation, call shop/customer, geofenced pickup, OTP + cash handover, earnings and history | ✅ |
| Admin: secure sign-in, overview metrics, live map of partners and open orders, orders search/detail/CSV with cancel and re-dispatch, approvals, users & shops (block/restore, hide shops), support tickets, review moderation, categories, coupons, COD cash hand-overs and shop payouts, delivery-area map editor, admin team (add staff with one-time passwords, roles), app health, platform settings, audit log | ✅ |
| Push notifications (EN/TE templates, Expo push, token lifecycle) | ✅ code complete; needs EAS/FCM/APNs credentials |
| Push notifications | ✅ code ready; Android needs Firebase set up once ([docs/push-notifications.md](docs/push-notifications.md)) |
| Payments | ✅ cash on delivery; UPI / card / netbanking via Razorpay with webhook confirmation, 20-minute hold, automatic refunds ([docs/payments.md](docs/payments.md)) |
| Crash reporting | ✅ in-house: app errors → Admin → App health (no third-party service) |
| Store builds | ✅ production profile, version 1.0.0, `pnpm preflight`, store listing + Data safety draft; ⏳ needs owner accounts |
| Launch | ⏳ owner tasks in [docs/launch-checklist.md](docs/launch-checklist.md) |

## Quick start
```bash
pnpm install
supabase start && supabase db reset          # local backend with demo data
cp apps/mobile/.env.example apps/mobile/.env
cp apps/admin/.env.example apps/admin/.env.local
pnpm admin                                   # dashboard on :3000
```
The mobile app needs a development build (native maps + background location) —
see [docs/setup.md](docs/setup.md).

## Verify
```bash
pnpm test:unit && pnpm typecheck && PGHOST=… PGUSER=postgres pnpm test:db
```
Latest results: [docs/testing.md](docs/testing.md).
