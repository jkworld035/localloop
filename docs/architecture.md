# Architecture

## Shape

```
apps/mobile   Expo SDK 58 · React Native 0.88 · Expo Router · TanStack Query · Zustand
              One app, three role experiences (customer / vendor / delivery partner)
apps/admin    Next.js 16 (App Router, Server Actions, proxy.ts) · Tailwind 4
packages/shared  Types generated from the schema, zod validation, order state machine,
                 design tokens, geo/format utils — imported by both apps
supabase/     migrations (source of truth) · pgTAP tests · edge functions (Deno) · seed
```

```
 Customer app ─┐                      ┌─ PostgreSQL 15 + PostGIS
 Vendor app   ─┼─ supabase-js (anon) ─┤   RLS on every table
 Partner app  ─┘    + user JWT        │   SECURITY DEFINER RPCs for every state change
 Admin web ────── @supabase/ssr ──────┤   triggers: status history, audit, notifications
                                      ├─ Realtime (postgres_changes, RLS-filtered)
                                      ├─ Storage (public media, private documents)
                                      └─ Edge functions: compute-eta → Google Routes API
                                                         send-push   → Expo Push → FCM/APNs
                                                         razorpay-webhook (ready, not enabled)
```

## Key decisions

**One mobile app, role-based.** A single store listing and codebase; the
`profiles.role` chosen at first sign-in routes the user (`src/app/index.tsx`).
Roles cannot be switched or self-elevated: `choose_role()` refuses `admin` and
refuses changes once set; `profiles.role` has no client write grant.

**The database is the security boundary.** Clients never write orders,
payments, assignments, reviews or locations directly — those tables have no
INSERT/UPDATE grants. Every transition is a `SECURITY DEFINER` function that
checks the caller's role and ownership, locks the right rows and validates the
state machine (`order_transition_allowed`). Table and column privileges are
explicit; function EXECUTE is an allowlist (`…0014_function_privileges.sql`).
The admin dashboard and the apps hold only the anon key.

**Concurrency.** `place_order` locks the cart and stock rows in a fixed order
(no oversell, no deadlock) and is idempotent per client key (double-tap safe).
`partner_accept_assignment` serialises on the order row, and a partial unique
index guarantees at most one active partner per order even if code changes.

**Location privacy.** A customer can read the assignment row (the Realtime
source of the live map) only while *their* order is `picked_up`; access ends at
delivery. Before acceptance, partners see only the drop locality — full
address and phone appear after they accept. Location history is purged after
`location_retention_days`.

**Route-based ETA, cost-controlled.** The partner app sends a fix every ~4 s
during a delivery (`update_driver_location`). The server answers `eta_due`
only when the leg changed, the partner moved ≥250 m from the last route
origin, or 60 s passed; only then does the app call `compute-eta`, which
re-applies the same policy with a 15 s hard floor before calling the Routes API
(traffic-aware `TWO_WHEELER`). The result (road distance, duration, polyline)
lands on the assignment row and reaches the customer via Realtime. Listings
show an *approximate* window labelled as such; live tracking never uses
straight-line distance.

**Background tracking.** `expo-location` + `expo-task-manager` with an Android
foreground service and iOS background mode. The task is defined at module
scope (`services/partner-tracking.ts`) so the OS can wake it. Failed uploads
are queued and replayed; the server accepts fixes up to 15 minutes old and
never lets an older fix overwrite a newer one. Fixes worse than 500 m accuracy
are ignored. Tracking runs only while the partner is online.

**Dispatch.** On vendor acceptance (so the partner arrives as the order is
ready) the nearest eligible partners get timed offers: approved, online, fresh
GPS fix, within `dispatch_radius_km`, under their concurrency cap, vehicle
suited to the trip, and not one who declined. A pg_cron job re-dispatches
expired offers every 30 s; the vendor is told when nobody is available.

**i18n.** English and Telugu from day one: i18next resources in the app,
server-rendered push copy in both languages, category names stored in both.
Database errors are stable snake_case codes translated by the apps. Parity
tests fail the build if a key, an interpolation variable, an error code or a
push type is missing in either language. The `AppText` component switches to
Noto Sans Telugu when a string contains Telugu script.

**Accessibility.** 56 pt primary touch targets, Dynamic Type honoured (capped
at 1.6×), labels/roles/states on every control, status conveyed by icon + text
(never colour alone), secondary text darkened from the brief's `#737B75` to
`#5F6762` to meet WCAG AA on ivory.

**Commercial values are data.** Commission, delivery fees, partner pay, dispatch
and tracking parameters live in `app_settings`, edited by super admins and audited.

**Demo data is quarantined.** Demo rows carry `is_demo = true`, are created only
by `supabase/seed.sql` (never pushed), and are hidden unless `show_demo_data` is
on. Admin metrics always exclude them.
