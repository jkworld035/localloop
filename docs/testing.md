# Testing

## How to run
```bash
pnpm test:unit                               # vitest: shared logic, ETA policy, push copy, translations
pnpm --filter @localloop/mobile typecheck
pnpm --filter @localloop/admin build         # includes TypeScript
PGHOST=… PGUSER=postgres pnpm test:db        # migrations + pgTAP on plain Postgres 16 + PostGIS
# or, with the Supabase CLI:  supabase db reset && supabase test db
```
CI (`.github/workflows/ci.yml`) runs all of the above plus `deno check` on every edge function.

## Phase 1 test report — 5 Nov 2026

| Suite | Result | What it proves |
|---|---|---|
| `01_order_lifecycle` (pgTAP) | **41/41 pass** | Discovery by radius and serviceability; cart pricing with sale prices; idempotent placement; stock reservation; vendor notification; dispatch to nearest fresh partners; locality-only offers; first-accept-wins with the second partner refused; pickup blocked until ready; live tracking hidden before pickup and visible after; routed road distance surfaced; "approaching" push; wrong OTP refused *and counted*; correct OTP completes; COD settled; commission from settings; customer loses location + OTP access after delivery; one review per order; rating aggregation |
| `02_rls_isolation` (pgTAP) | **26/26 pass** | Anon can't read profiles or call write RPCs; roles can't be self-elevated or switched; customers can't see each other's data, insert orders, change status or confirm payments; vendors can't see other stores' orders or OTPs, can't self-approve, and moving a shop forces re-review; unassigned/unapproved partners are locked out; admin actions audited |
| `03_failure_paths` (pgTAP) | **23/23 pass** | Overselling refused; test/gateway payments gated; coupon caps and validation; cancellation restocks and closes payment; invalid transitions and missing reasons refused; reviews need delivery; stale-GPS partners skipped; bicycle trip limit; expired offers refused; cron re-dispatch; unique index blocks double assignment; low-accuracy, future and stale fixes rejected |
| `04_admin_roles` (pgTAP) | **14/14 pass** | Each admin role can load exactly the dashboard data it needs; operations approves (reviewer stamped, applicant notified) but can't change commercial settings; finance can't see applications; only super admins grant roles or change commission (audited) |
| Unit (vitest) | **31/31 pass** | SQL↔TS state-machine parity; Indian phone/PIN/GSTIN/RC/DL validation; polyline decoding; INR formatting; stale-location classification; every ETA recompute rule and throttle; Routes API request/response handling (incl. refusing to invent an ETA); EN/TE key + placeholder parity; every error code and push type translated |
| Mobile typecheck | **pass** | RN 0.88 strict TypeScript API |
| Mobile bundle | **pass** | `expo export` for Android and iOS (all routes, imports, assets resolve) |
| Android native config | **pass** | `expo prebuild`: background location, foreground service (location), notifications in the manifest |
| Admin build | **pass** | `next build` (Next 16, Turbopack, TypeScript), `proxy.ts` recognised |
| Edge functions | **pass** | `deno check` on all three; runtime smoke test: webhook rejects bad signature (401) and accepts a valid one; `send-push` refuses non-service callers (403); `compute-eta` refuses unauthenticated callers (401) |

**Bugs caught by these tests and fixed:** status history inserted before its
order row existed; `quote_cart` crashing instead of reporting issues (text-array
append); anon had EXECUTE on write RPCs because per-schema default privileges
can't revoke PostgreSQL's global grant (now an explicit allowlist).

## Phase 2 test report — 6 Nov 2026

| Suite | Result | What it proves |
|---|---|---|
| `05_shopping` (pgTAP) | **16/16 pass** | Shop page distance/delivery from the customer's location, works without a location; suspended shops hidden from the public but visible to their owner; catalogue (products + sizes + stock) readable anonymously; addresses saved from the app's EWKT format; one default address; cart insert and quantity change allowed, moving items between carts refused; order detail items and timeline visible only to the owner |
| All earlier suites | **104/104 pass** | Unchanged behaviour |
| Unit (vitest) | **32/32 pass** | New: every translation key used anywhere in the app exists (catches missing EN/TE text at build time) |
| Typecheck · Android & iOS bundles · admin build | **pass** | New screens: shop, product, cart, checkout, addresses, order detail |

**Bugs caught and fixed in Phase 2:** the shop-page visibility check let suspended shops through for signed-out users (SQL `NULL` logic); the type generator treated a partial unique index as one-to-one, mistyping product sizes.

## Phase 3 test report — 6 Nov 2026

| Suite | Result | What it proves |
|---|---|---|
| `06_vendor` (pgTAP) | **15/15 pass** | Product + all sizes + stock saved in one step; editing keeps size ids (prices change in place), removed sizes are deleted (or hidden if ever ordered), default size re-assigned; an invalid offer price or duplicate size name changes nothing; another vendor can't edit products or read the dashboard; the vendor can pause orders; low stock shows on the dashboard |
| All earlier suites | **120/120 pass** | Unchanged behaviour |
| Unit (vitest) | **33/33 pass** | New: PostGIS point decoding checked against real PostGIS output; translation-key check now also catches keys containing digits |
| Typecheck · Android & iOS bundles · admin build | **pass** | Vendor tabs (home, orders, products, shop, profile), shop editor with opening hours and map pin, documents, product editor with photos, order actions; admin approvals with document links |

**Bug caught in Phase 3:** the translation-key test ignored keys with digits (e.g. `vendor.sales_7d`), so a missing string could have shipped unnoticed.

## Not yet verified — needs real devices and credentials
These can't be exercised in CI and are on the Phase 4/7 device test plan:
- Background GPS on physical Android (Doze, OEM battery savers — test Xiaomi/Realme/Samsung) and iOS (app killed, Low Power Mode)
- Google Routes API responses for Kamareddy roads (needs the server key)
- Push delivery via FCM/APNs (needs EAS credentials)
- Photo and document upload from real cameras/galleries (sizes, HEIC photos from iPhones, slow uploads on 3G)
- SMS OTP delivery through a DLT-registered sender
- Realtime subscription behaviour on 2G/3G and while switching networks
- Telugu rendering on low-end Android fonts; TalkBack/VoiceOver walkthroughs
