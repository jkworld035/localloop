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

## Status — Phase 1 (foundation) complete

| Area | State |
|---|---|
| Database: 38 tables, PostGIS, RLS on every table, 42 client RPCs, triggers, storage, realtime, cron | ✅ built and tested (104 pgTAP assertions) |
| Order engine: pricing, idempotent placement, stock locking, state machine, cancellations | ✅ backend complete and tested; customer screens in Phase 2 |
| Dispatch + live tracking backend: offers, first-accept-wins, GPS ingestion, OTP handover, route ETA function | ✅ backend complete and tested; tracking screens in Phase 4 |
| Auth: phone OTP, role choice, encrypted session storage | ✅ |
| Customer app: onboarding, language, GPS location + map pin, nearby shops with radius/sort/open-now, categories, orders, saved, profile | ✅ (shop pages, cart, checkout: Phase 2) |
| Vendor app: registration, verification status, today's order counts | ✅ (shop/products/orders: Phase 3) |
| Partner app: registration, verification, go online/offline with GPS + background tracking task | ✅ (offers, navigation, OTP screens: Phase 4) |
| Admin: secure sign-in, overview metrics, approvals, platform settings, audit log | ✅ (orders, live map, catalogue, coupons…: Phase 5) |
| Push notifications (EN/TE templates, Expo push, token lifecycle) | ✅ code complete; needs EAS/FCM/APNs credentials |
| Store builds | ⏳ EAS profiles ready; needs owner accounts (see docs/setup.md §1) |

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
