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

## Phase 4 test report — 6 Nov 2026

| Suite | Result | What it proves |
|---|---|---|
| `07_partner` (pgTAP) | **18/18 pass** | The exact reads the partner app makes: open offer visible (realtime source), accept → active job with drop contact, order row readable; customer sees partner first name once assigned but **no position and no tracking row before pickup**, then the live position after pickup; OTP completion counts today's delivery, earning and COD cash in hand; documents only in the partner's own folder; customers can't read partner dashboards |
| All earlier suites | **135/135 pass** | Unchanged behaviour |
| Unit (vitest) | **34/34 pass** | New: the arrival estimate is hidden once the partner's position is no longer live, counts down from server compute time, and never shows 0 or negative minutes |
| Typecheck · Android & iOS bundles | **pass** | Partner tabs (deliveries, history, profile), offer cards, job screen with map/route/navigation/OTP, documents, profile photo; customer live tracking screen and "Track live" on the order page |

## Phase 5 test report — 6 Nov 2026

| Suite | Result | What it proves |
|---|---|---|
| `08_admin` (pgTAP) | **25/25 pass** | Partner COD cash and shop earnings appear as balances; a hand-over or payout is refused if the amount changed since the admin counted it; payouts need a bank/UPI reference, mark commissions paid and notify the shop; the partner app's cash in hand drops to zero after hand-over; the live map lists online partners and open orders and flags orders with no partner; re-dispatch keeps an accepted partner unless the admin releases them (they are notified); an admin can cancel an order already out for delivery, with a reason, without restocking goods still with the partner, and it is audited; a blocked partner is taken offline; support admins can't touch money; customers can't read the live map |
| All earlier suites | **153/153 pass** | Unchanged behaviour (partner dashboard now counts all cash not yet handed over) |
| Unit (vitest) | **34/34 pass** | State-machine check now follows the latest migration that defines the transitions |
| Typecheck · admin production build · Android bundle | **pass** | 17 admin routes incl. live map, orders + CSV export, users, support, reviews, catalogue, coupons, finance |

**Fixed in Phase 5:** the database test runner could report a suite as passed when psql stopped early; it now fails unless every planned assertion ran.

**Not yet exercised against the hosted project:** the admin pages were type-checked against the generated schema and built, but not clicked through with live data — do that after applying the patch.

## Phase 6 test report — 6 Nov 2026

| Suite | Result | What it proves |
|---|---|---|
| `09_engagement` (pgTAP) | **23/23 pass** | Help requests need a real message, can only attach the user's own orders, refunds get high priority, at most five open per person; staff replies notify the user, a user reply reopens a resolved ticket, nobody else can reply; vendors can ask too. Ratings only after delivery, partner shown by first name, products listed; shop reviews are public with first names only and hidden reviews disappear. Account closure is refused while a partner holds COD cash; a customer's closure removes name, phone and addresses and blocks sign-in while keeping the order without the phone number |
| All earlier suites | **178/178 pass** | Unchanged behaviour |
| Unit (vitest) | **37/37 pass** | New: notification taps route each role to the right screen; every new string has a Telugu translation |
| Typecheck · admin build (incl. 4 static `/legal` pages) · Android bundle | **pass** | Public privacy page rendered and checked at phone width |

## Phase 7 test report — 7 Nov 2026

| Suite | Result | What it proves |
|---|---|---|
| `10_security` (pgTAP) | **9/9 pass** | Release gate for every table and function, now and in future migrations: RLS on every table; every SECURITY DEFINER function pins `search_path`; signed-out callers can run only an explicit allowlist; server-only functions (dispatch, notify, audit, purge…) are not callable from the apps; nobody signed out can write; nobody can TRUNCATE; document buckets are private; crash reports mask phone numbers and are admin-only |
| All earlier suites | **201/201 pass** | Unchanged behaviour |
| Unit (vitest) | **37/37 pass** | |
| `pnpm preflight` | **fails as intended** | Blocks a store build until the legal business details are filled in |

**Found and fixed by the new security gate:** `partner_dashboard`, `vendor_dashboard`, `vendor_save_product` and `set_default_address` (added in Phases 2–4) were still executable by signed-out callers through PostgreSQL's default grant. Each refused (they check the caller's role), so nothing leaked, but they now follow the allowlist. The test database now mirrors Supabase's default grants so this class of mistake is caught automatically.

## Not yet verified — needs real devices and credentials
These can't be exercised in CI and are on the device test plan (Phase 6/7):
- Background GPS on physical Android (Doze, OEM battery savers — test Xiaomi/Realme/Samsung) and iOS (app killed, Low Power Mode)
- Google Routes API responses for Kamareddy roads (needs the server key)
- Push delivery via FCM/APNs (needs EAS credentials)
- Photo and document upload from real cameras/galleries (sizes, HEIC photos from iPhones, slow uploads on 3G)
- SMS OTP delivery through a DLT-registered sender
- Realtime subscription behaviour on 2G/3G and while switching networks
- Telugu rendering on low-end Android fonts; TalkBack/VoiceOver walkthroughs
