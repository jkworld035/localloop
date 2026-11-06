# Launch checklist

Everything below needs the owner (accounts, legal entity, money, people) — the
code is ready for each item. Tick them off before opening to the public.

## Legal and policies
- [ ] Fill in every `[bracketed]` value in `packages/shared/src/legal/index.ts` (`LEGAL_ENTITY`): registered business name and address, support email/phone, Grievance Officer name and email, effective date.
- [ ] Have a lawyer review Terms, Privacy Policy and the Cancellation & Refund Policy (same file). The refund windows (48 hours; same day for fresh food) and timelines are proposals — confirm you can honour them.
- [ ] Decide whether to publish Telugu versions of the policies; until then the app says they are in English and support explains in Telugu.
- [ ] Deploy the admin site to a public domain so these work: `/legal/terms`, `/legal/privacy`, `/legal/refunds`, `/legal/delete-account` (Play Console → App content needs the privacy policy URL and the account-deletion URL).
- [ ] Shop onboarding agreement (commission, payouts, FSSAI duties) and delivery-partner agreement (earnings, cash handling) as signed documents.
- [ ] Set up the manual deletion route promised on `/legal/delete-account` (email → confirm by SMS → delete via the admin or SQL).

## Language
- [ ] Native Telugu speaker reviews all app text: run `python scripts/export-translations.py`, share `telugu-review.csv`, apply corrections to `apps/mobile/src/translations/te.json`, then `pnpm test:unit`.
- [ ] Review the Telugu push-notification texts in `supabase/functions/_shared/notification-templates.ts`.

## Accounts and services (see docs/setup.md)
- [ ] SMS sign-in: DLT-registered sender ID and template, SMS provider connected in Supabase Auth; remove test phone numbers.
- [ ] Custom domain for Supabase (the `supabase.co` block on some Indian ISPs) — docs/deployment.md.
- [ ] Google Cloud: production Maps keys restricted to the release package and SHA-1; Routes API key server-only; billing budget alert.
- [ ] Expo/EAS: production build credentials, FCM (Android) and APNs (iOS) push keys.
- [ ] Google Play developer account; Apple Developer Program (for iOS).
- [ ] Support inbox and phone number staffed during the hours the app promises (9 am – 9 pm).

## Operations
- [ ] Serviceable area polygon for Kamareddy checked in `serviceable_areas`.
- [ ] Platform settings reviewed in admin (commission, delivery fees, partner earnings, dispatch radius).
- [ ] At least one finance admin and one operations admin with their own accounts.
- [ ] Real-device test plan in docs/testing.md completed on the phones your partners actually use.
