# Push notifications on Android (Firebase)

Android delivers push notifications through Firebase Cloud Messaging (FCM).
LocalLoop sends them via Expo's push service (`send-push` function), which
needs two things from one Firebase project: the app's `google-services.json`
(built into the app) and a service-account key (uploaded to Expo).
Without them the in-app 🔔 inbox and live screens still work; only phone
alerts are missing.

## 1. Firebase project (once)
1. https://console.firebase.google.com → **Add project** → name `LocalLoop` (Google Analytics: off is fine).
2. **Add app → Android** three times, one per app variant:
   - `in.localloop.app` (store), `in.localloop.app.preview` (test app), `in.localloop.app.dev` (dev app)
   - Nickname as you like; SHA-1 is optional here.
3. After adding the apps: Project settings (⚙) → **General** → under *Your apps* click **google-services.json** (one file covers all three packages once they're added) → download.

## 2. Give the file to EAS builds
```powershell
cd C:\dev\local-loop\apps\mobile
eas env:create --environment preview --name GOOGLE_SERVICES_JSON --type file --value "$HOME\Downloads\google-services.json" --visibility sensitive
eas env:create --environment development --name GOOGLE_SERVICES_JSON --type file --value "$HOME\Downloads\google-services.json" --visibility sensitive
eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value "$HOME\Downloads\google-services.json" --visibility sensitive
```
For running locally, also copy it to `apps/mobile/google-services.json` (git ignores it).

## 3. Let Expo send through your Firebase project
1. Firebase → Project settings → **Service accounts** → **Generate new private key** → a JSON file downloads. This one **is secret** — never commit or share it.
2. Upload it to Expo:
   ```powershell
   eas credentials
   ```
   Android → preview → **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Set up** → **Upload a new service account key** → choose the downloaded file.
   It's stored per project, so development and production use it too.
3. Delete the downloaded private-key file afterwards (Expo keeps it).

## 4. Rebuild
`google-services.json` is built into the app, so make a new build:
```powershell
eas build --platform android --profile preview
```
Then reinstall from the new link. (JavaScript-only updates can't add it.)

## Check it works
Sign in on the new build, allow notifications, then as the shop owner have someone place an order — the phone should ring with "New order" even with the app closed. In Supabase SQL: `select count(*) from push_tokens;` should be above 0 after signing in on a real phone.
