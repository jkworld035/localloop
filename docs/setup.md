# Setup

Everything you need to run LocalLoop locally and to connect real services.
Nothing in the apps pretends to work without its service: a missing key shows
a configuration notice or an "unavailable" state, never fake data.

## 1. Accounts and credentials you need to provide

| # | Service | Needed for | What to create | Where it goes |
|---|---------|-----------|----------------|---------------|
| 1 | **Supabase** (Pro plan recommended for launch; region `ap-south-1` Mumbai) | Database, auth, storage, realtime, edge functions | A project | URL + anon key → app env files; DB password → CLI only |
| 2 | **SMS provider for Supabase Auth** (Twilio, MessageBird, Vonage or Textlocal) | Phone OTP login | Account + sender. **India requires DLT registration** of your entity, sender ID (header) and the OTP template before SMS will deliver | Supabase → Authentication → Providers → Phone |
| 3 | **Google Cloud** project with billing | Maps on both apps + route ETA | Enable *Maps SDK for Android*, *Maps SDK for iOS*, *Routes API*. Create **three** keys: Android (restricted to package + SHA-1), iOS (restricted to bundle id), server (restricted to Routes API, no app restriction) | Android/iOS keys → EAS env vars; server key → Supabase secret `GOOGLE_ROUTES_API_KEY` |
| 4 | **Expo / EAS** account | Builds, push tokens, OTA updates | `eas init` in `apps/mobile` | Writes the project id → `EAS_PROJECT_ID` |
| 5 | **Firebase** project | Android push delivery (FCM v1) | Android app `in.localloop.app`; download service account key | Upload with `eas credentials` (Android → FCM V1) |
| 6 | **Apple Developer Program** | iOS builds, push (APNs), TestFlight | Bundle id `in.localloop.app` with Push Notifications + Background Modes (Location) | `eas credentials` manages certificates and the APNs key |
| 7 | **Google Play Console** | Android release | App + internal testing track; complete the *Location permissions* declaration (background location is for delivery partners) | `eas submit` service account JSON |
| 8 | Razorpay (later) | Online payments | Account + webhook | `RAZORPAY_WEBHOOK_SECRET` (function ready; checkout not yet enabled) |

## 2. Environment variables

### Mobile — `apps/mobile/.env` (local) or EAS environment variables (cloud builds)
| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Public. Without it the app shows a configuration screen. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key. **Never** the service-role key. |
| `GOOGLE_MAPS_ANDROID_API_KEY` | for maps on Android | Restricted to package + SHA-1 of the signing key (EAS shows it under credentials). |
| `GOOGLE_MAPS_IOS_API_KEY` | for maps on iOS | Restricted to bundle id. |
| `EAS_PROJECT_ID` | for push + updates | Written by `eas init`. |
| `APP_VARIANT` | no | `development` / `preview` → separate bundle ids so all three can be installed side by side. |

### Admin — `apps/admin/.env.local` (or your host's env)
| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | The dashboard acts as the signed-in admin through RLS; it holds no secret key. |

### Edge function secrets — `supabase secrets set …`
| Secret | Used by | Notes |
|---|---|---|
| `GOOGLE_ROUTES_API_KEY` | `compute-eta` | Without it the function returns `routing_not_configured`; apps show ETA as unavailable. |
| `EXPO_ACCESS_TOKEN` | `send-push` | Only if *Enhanced push security* is on in Expo. |
| `RAZORPAY_WEBHOOK_SECRET` | `razorpay-webhook` | Without it every webhook is refused. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | all | Injected automatically by Supabase. |

### Database (Vault) — for push delivery
The `notifications_dispatch_push` trigger calls `send-push` through `pg_net`.
In the SQL editor:
```sql
select vault.create_secret('https://YOUR-REF.supabase.co', 'project_url');
select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');
```

## 3. Local development

Prerequisites: Node 22.13+ (or 24.3+), pnpm 10, the Supabase CLI and Docker.

```bash
pnpm install
supabase start                 # local Postgres+PostGIS, Auth, Storage, Realtime
supabase db reset              # applies supabase/migrations + supabase/seed.sql (demo data)
supabase functions serve       # edge functions on :54321/functions/v1

cp apps/mobile/.env.example apps/mobile/.env      # use the local URL/anon key printed by `supabase start`
cp apps/admin/.env.example apps/admin/.env.local
pnpm admin                     # http://localhost:3000
```

The mobile app uses native modules (maps, background location), so it runs in a
**development build**, not Expo Go:
```bash
cd apps/mobile
npx eas-cli@latest build --profile development --platform android   # or ios; installs like a normal app
npx expo start --dev-client
```
Local test sign-ins (fixed OTP `123456`, see `supabase/config.toml`):
`+91 90000 00001` customer · `+91 90000 00003` vendor · `+91 90000 00005` delivery partner.
When testing on a phone, replace `127.0.0.1` in `EXPO_PUBLIC_SUPABASE_URL` with your computer's LAN IP.

## 4. First production deployment of the backend

```bash
supabase link --project-ref YOUR-REF
supabase db push                          # migrations only — seed.sql is never pushed
supabase functions deploy compute-eta send-push razorpay-webhook
supabase secrets set GOOGLE_ROUTES_API_KEY=… EXPO_ACCESS_TOKEN=…
```
Then in the dashboard:
1. **Database → Extensions**: enable `pg_cron` and `pg_net`, then re-run the
   scheduling block from migration `…0012` (or `supabase db reset` on a branch):
   it schedules `expire_offers_and_redispatch()` every 30 s and the nightly location purge.
2. **Vault**: add `project_url` and `service_role_key` (above).
3. **Authentication → Providers → Phone**: enable, connect the DLT-approved SMS provider. Remove all test OTP numbers.
4. **Authentication → Rate limits**: keep SMS limits conservative (OTP abuse is the main cost risk).
5. Create the first admin (once, SQL editor), then manage the rest from the dashboard:
   ```sql
   -- after signing up admin@yourco.in via Auth → Users → Add user (email + strong password)
   update public.profiles set role = 'admin', full_name = 'Your Name' where email = 'admin@yourco.in';
   insert into public.admin_users (id, admin_role) select id, 'super_admin' from public.profiles where email = 'admin@yourco.in';
   ```
6. **Admin → Platform settings**: confirm commission, delivery fee and partner pay values
   (the seeded numbers are placeholders), keep `show_demo_data = false`.
7. **Serviceable areas**: the Kamareddy area is seeded with a 12 km radius around
   the town centre. Until the admin areas module ships (Phase 5), adjust it in SQL:
   `update public.serviceable_areas set radius_km = 10 where name = 'Kamareddy';`

## 5. Before launch: content to review
- **Telugu copy** (`apps/mobile/src/translations/te.json`, `supabase/functions/_shared/notification-templates.ts`, category names in migration `…0013`) — written carefully but must be reviewed by a native speaker.
- **Legal pages** (privacy, terms, refund, cancellation, delivery, vendor and partner agreements) are Phase 6 and need review by an Indian lawyer (DPDP Act 2023, Consumer Protection (E-Commerce) Rules 2020).
