# Deployment

Nothing has been published to any store. These are the steps, and the items
only the owner can provide are marked **(owner)**.

## Backend
See `setup.md` §4. Use a Supabase **branch** or separate staging project for
preview builds; never point preview builds at production data.

### Launch risk: `supabase.co` blocked on some Indian networks
In February 2026 several Indian ISPs blocked `supabase.co` after a government
order; Supabase reported access restored in March, but some connections still
reset (seen during this project's setup in November 2026). If a customer's ISP
blocks it, the app cannot load anything. Before launch, serve the API from your
own domain (for example `api.localloop.in`) with Supabase's **Custom Domains**
add-on, then set `EXPO_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` to it.
Developers on an affected network can use Cloudflare WARP meanwhile.

## Mobile (EAS)
Profiles in `apps/mobile/eas.json`:

| Profile | Bundle id | Output | Use |
|---|---|---|---|
| `development` | `in.localloop.app.dev` | APK / dev client | Daily development with `expo start --dev-client` |
| `preview` | `in.localloop.app.preview` | APK / ad-hoc IPA | Field testing in Kamareddy (internal distribution) |
| `production` | `in.localloop.app` | AAB / IPA | Store submission; build number auto-increments |

```bash
cd apps/mobile
npx eas-cli@latest login                     # (owner)
npx eas-cli@latest init                      # writes the project id
npx eas-cli@latest env:create …              # EXPO_PUBLIC_*, GOOGLE_MAPS_* per environment
npx eas-cli@latest credentials               # (owner) upload FCM v1 key; Apple signs in to create certs/APNs key
npx eas-cli@latest build --profile preview --platform all
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform android   # internal track, draft
npx eas-cli@latest submit --profile production --platform ios       # TestFlight
```

### Store review notes (both stores scrutinise background location)
- **Google Play**: complete the *Sensitive permissions → Location* declaration.
  Background location is used only by delivery partners during an active
  delivery/online shift; record the in-app explanation screen (shown before the
  OS prompt) for the review video. Foreground service type: `location`.
- **App Store**: explain in review notes that "Always" location is requested only
  for delivery partners, with a persistent indicator, and stops when they go
  offline. Provide a demo partner account and a demo customer account.
- Both: provide test credentials (phone + OTP via a test number configured on
  the review build's Supabase project only).

### Over-the-air updates
`runtimeVersion` follows the app version, so JS-only fixes can ship with
`eas update --channel production`; anything touching native modules or
permissions needs a new store build.

## Admin dashboard
Any Node 22 host (Vercel, Render, a VM). Set the two `NEXT_PUBLIC_SUPABASE_*`
variables and deploy `apps/admin` (`pnpm --filter @localloop/admin build`).
Put it behind your company domain; it sends `X-Frame-Options: DENY` and is
`noindex`. Consider restricting by IP or adding Supabase MFA for admins.

The admin live map draws OpenStreetMap tiles with Leaflet (no API key). That is
fine for a handful of staff; if usage grows, switch the tile URL in
`apps/admin/src/app/(dashboard)/live/LiveMap.tsx` to a commercial tile provider
or Google Maps JavaScript API with an HTTP-referrer-restricted key, as the OSM
tile policy asks heavy users to do.
