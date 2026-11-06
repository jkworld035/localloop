# Going live

The order to launch LocalLoop on Android in Kamareddy. Every command runs from
`C:\dev\local-loop` unless stated. Items marked **(you)** need the owner's
accounts or decisions; everything else is already built.

## 0. Before anything
- [ ] **(you)** Fill in the business details in `packages/shared/src/legal/index.ts` (`LEGAL_ENTITY`) and have a lawyer read the policies.
- [ ] `pnpm preflight` passes (typecheck, tests, Telugu complete, legal details filled in).

## 1. Production backend (separate from the test project)
Keep `localloop-dev` for testing; customers get their own project so test data never mixes with real orders.

1. **(you)** Supabase → New project `localloop-prod`, region **South Asia (Mumbai)**, a strong database password saved in a password manager. Pro plan ($25/month) is needed for daily backups and the custom domain.
2. Link and push everything:
   ```powershell
   npx supabase@latest link --project-ref <prod-ref>
   npx supabase@latest db push --remote
   npx supabase@latest functions deploy compute-eta send-push razorpay-pay razorpay-webhook razorpay-refund delete-account admin-invite --project-ref <prod-ref> --use-api
   ```
3. Secrets (type the values, never paste them in chat):
   ```powershell
   $k = Read-Host "Routes key"; npx supabase@latest secrets set "GOOGLE_ROUTES_API_KEY=$k" --project-ref <prod-ref>
   ```
   and in the SQL editor: `select vault.create_secret('<prod URL>', 'project_url'); select vault.create_secret('<prod service_role key>', 'service_role_key');`
4. Scheduled jobs (SQL editor), if `select jobname from cron.job;` doesn't list them:
   ```sql
   select cron.schedule('localloop-redispatch', '30 seconds', 'select public.expire_offers_and_redispatch()');
   select cron.schedule('localloop-purge-locations', '17 3 * * *', 'select public.purge_old_locations()');
   ```
5. First admin (once; after that add staff from Admin → Admin team): create your user in Supabase → Authentication → Add user (email + password, auto-confirm), sign in once at the admin site, then in SQL:
   `update public.profiles set role = 'admin' where email = '<you>'; insert into public.admin_users (id, admin_role) select id, 'super_admin' from public.profiles where email = '<you>';`
6. Admin → Platform settings: commission, delivery fees, partner earnings, dispatch radius. Check the delivery area in Admin → Delivery areas (draw the exact town boundary if the circle is too loose).
7. Auth → URL configuration and **Auth → Phone**: see §2.

## 2. Real SMS sign-in codes (India)
Indian carriers only deliver SMS from senders registered on the TRAI **DLT** platform.
1. **(you)** Register the business as a Principal Entity on a DLT portal (run by the telecom operators, e.g. Jio, Airtel or Vodafone Idea; there is a one-time registration fee), then a 6-letter sender ID (e.g. `LCLOOP`) and an OTP template such as:
   `{#var#} is your LocalLoop login code. Do not share it with anyone. - LocalLoop`
2. **(you)** Open an SMS provider account (MSG91, Twilio or another DLT-ready provider) and link your DLT entity, sender ID and template there.
3. Connect it to Supabase: Twilio works directly under Auth → Phone; for MSG91 use a **Send SMS hook** (Auth → Hooks) that calls MSG91's OTP API. Tell me which provider you choose and I'll add the hook.
4. Remove all test phone numbers from Auth → Phone in the production project.

## 3. Your own API domain (fixes the supabase.co ISP block)
Some Indian ISPs block `*.supabase.co` (you hit this yourself). Customers on those networks would see "network error".
1. **(you)** Buy a domain (e.g. `localloop.in`) from any registrar.
2. Supabase → Project settings → Custom domains → add `api.localloop.in` ($10/month add-on), create the CNAME and TXT records it shows at your registrar, then activate.
3. Use `https://api.localloop.in` as `EXPO_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` everywhere below.

## 3b. Online payments
Follow [payments.md](payments.md) with **live** Razorpay keys on the production project (after KYC approval). Cash on delivery works without it.

## 4. Google keys for the release app
1. **(you)** Google Cloud → Credentials → Android key restricted to package `in.localloop.app` with the **release** SHA-1 (`eas credentials` → Android → production shows it after the first production build; Play App Signing adds a second SHA-1 under Play Console → Setup → App signing — add both).
2. Billing → Budgets & alerts: a monthly budget with email alerts.

## 5. Production app build
```powershell
cd apps/mobile
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://api.localloop.in --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <prod publishable key> --visibility plaintext
$k = Read-Host "Android Maps key"; eas env:create --environment production --name GOOGLE_MAPS_ANDROID_API_KEY --value $k --visibility sensitive
cd ../..; pnpm preflight; cd apps/mobile
eas build --platform android --profile production
```
The result is an `.aab` for Play. Version 1.0.0; build numbers go up automatically.

## 6. Google Play
1. **(you)** Play Console account. A **personal** account created after Nov 2023 must run a **closed test with at least 12 testers opted in for 14 days in a row** before production; an **organisation** account (needs a D-U-N-S number) skips this. Plan for it — recruit shop owners, partners and friends early.
2. Create the app "LocalLoop", then fill in from `docs/store-listing.md`: store listing (EN + TE), Data safety, content rating, target audience (18+), ads (none).
3. **Location permissions declaration**: background location is used by delivery partners only. Play asks for a short video showing the in-app explanation before the permission prompt (Partner app → Go online) and the feature that needs it (live tracking). Record it on a phone.
4. Policy links: Privacy `https://admin.localloop.in/legal/privacy`, account deletion `https://admin.localloop.in/legal/delete-account` (deploy the admin site first, §7).
5. Upload: `eas submit --platform android --profile production` (needs a Play service-account JSON saved as `apps/mobile/google-play-service-account.json` — never commit it). It lands on the **internal** track as a draft; promote to closed testing, then production.

## 7. Admin site
Deploy `apps/admin` to Vercel (or any Node host) with the two `NEXT_PUBLIC_SUPABASE_*` variables pointing at production and the domain `admin.localloop.in`. The `/legal/*` pages are public; everything else requires an admin sign-in.

## 8. Launch-day checks
- Place a real COD order end to end with a real shop and partner; watch it on Admin → Live map.
- Admin → App health shows no crashes.
- A push notification arrives on a real phone (order accepted).
- A customer on Jio and one on Airtel can sign in (SMS) and load shops (custom domain).

## After launch
- **JavaScript-only fixes** ship without a store review: `eas update --channel production --message "fix: …"`. Native changes (new permissions, new native modules, Expo SDK upgrades) need a new build.
- Watch Admin → App health and Support daily for the first weeks.
- Back-ups: Supabase Pro keeps daily backups for 7 days; test a restore into a scratch project once.
