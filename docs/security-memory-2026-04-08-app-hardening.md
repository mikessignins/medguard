# Security Memory — 2026-04-08 App Hardening

## Context

This session started from the 2026-04-07 platform review and the follow-up priority list for the MedGuard web app and companion iOS app.

For the next round of open findings from the 2026-04-09 review, use `docs/security-remediation-checklist-2026-04-09.md` as the active fix tracker.

Primary concerns raised:

- possible service-role secret exposure
- no CSRF protection on mutating web routes
- weak cron secret validation
- broad service-role usage in web server code
- PDF export race handling gaps
- DB-backed rate limiting that will not scale cleanly across regions
- iOS repository `print(...)` statements leaking identifiers in logs

## What changed today

### Web app

- Added shared request-origin enforcement in `lib/api-security.ts`.
- Applied same-origin CSRF protection to mutating web routes under `app/api`, including:
  - feedback create/update
  - business module/trial/reminder/logo mutations
  - emergency review/comment/purge flows
  - fatigue review/purge flows
  - medication review/purge flows
  - psychosocial review/post-incident/purge flows
  - admin audit writes
  - submission test-flag writes
- Hardened `app/api/cron/purge-exports/route.ts` so `CRON_SECRET` must exist and be at least 32 characters long before the route will run.
- Added `.env.example` with the required server secrets and placeholder Redis env vars for the next hardening phase.
- Updated `README.md` to reflect current MedGuard branding and the stricter secret guidance.
- Extended the existing request-level Supabase cache usage across slower medic routes so they now reuse the same authenticated user/account/client state as the parent layout instead of repeating their own auth/account fetches:
  - `app/medic/exports/page.tsx`
  - `app/medic/submissions/[id]/page.tsx`
  - `app/medic/med-declarations/[id]/page.tsx`
  - `app/medic/fatigue/[id]/page.tsx`
  - `app/medic/psychosocial/[id]/page.tsx`
  - `app/medic/psychosocial/post-incident/page.tsx`
- Added missing medic-scope checks to several medic detail pages while touching those paths, so direct detail URLs now consistently enforce business/site scoping.
- Added request timing instrumentation for medic navigations:
  - middleware now stamps `x-medguard-request-id`, `x-medguard-middleware-auth-ms`, and `Server-Timing: supabase-auth;dur=...`
  - medic request-cache helpers and key medic page loaders now emit request-scoped timing logs keyed by the same request ID
- Reduced middleware auth cost on tab navigations by skipping the middleware-side `supabase.auth.getUser()` call for router-driven RSC requests and `HEAD` probes. Those requests now rely on the destination server component/layout auth checks instead of paying the duplicate middleware auth round-trip.
- Removed an unnecessary post-login medic redirect hop by sending medics directly to `/medic/emergency` from the login flow and app root redirect, instead of first loading `/medic` and then redirecting again.
- Upgraded rate limiting to prefer Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, using an atomic REST transaction (`/multi-exec`) to seed the window, increment the counter, and read TTL in one round-trip. The previous Supabase event-log limiter remains as a fallback until Redis env vars are present everywhere.
- Reduced service-role usage on authenticated write paths that already have matching RLS coverage:
  - `app/api/businesses/[id]/modules/route.ts` now updates `business_modules` through the signed-in superuser client instead of the service-role client
  - `app/api/businesses/[id]/trial/route.ts` now updates `businesses.trial_until` through the signed-in superuser client
  - `app/api/businesses/[id]/reminder-interval/route.ts` now updates `businesses.reminder_interval_months` through the signed-in superuser client
  - `app/api/businesses/[id]/logo/route.ts` now handles both the `businesses` row update and `business-logos` storage upload/remove through the signed-in superuser client, backed by new storage RLS
  - `app/api/declarations/[id]/review/route.ts` now reads and updates `submissions` through the signed-in medic client
  - `app/api/declarations/[id]/comments/route.ts` now reads scoped submissions/comments and inserts comments through the signed-in medic client
  - `app/api/declarations/[id]/pdf/route.ts` now reads declaration data, business/site lookups, script signed URLs, and export stamps through the signed-in medic client instead of service-role
  - `app/api/declarations/purge/route.ts` now reads, audit-logs, and purges through the signed-in medic client, backed by new purge-audit insert RLS
  - `app/api/medication-declarations/[id]/review/route.ts` now uses the signed-in medic client for review reads/writes
  - `app/api/medication-declarations/[id]/pdf/route.ts` now reads declaration data, script signed URLs, and export stamps through the signed-in medic client
  - `app/api/medication-declarations/purge/route.ts` now reads, audit-logs, and purges through the signed-in medic client
  - `app/api/fatigue-assessments/[id]/pdf/route.ts` now uses the signed-in medic client for export reads/lookups and export stamping
  - `app/api/fatigue-assessments/[id]/review/route.ts` now uses the signed-in medic client for review reads/writes
  - `app/api/fatigue-assessments/purge/route.ts` now reads, audit-logs, and purges through the signed-in medic client
  - `app/api/psychosocial-assessments/[id]/pdf/route.ts` now uses the signed-in medic client for export reads/lookups and export stamping
  - `app/api/psychosocial-assessments/[id]/review/route.ts` now uses the signed-in medic client for review reads/writes
  - `app/api/psychosocial-assessments/purge/route.ts` now reads, audit-logs, and purges through the signed-in medic client
  - `app/api/feedback/route.ts` now inserts feedback through the signed-in client
  - `app/api/feedback/[id]/route.ts` now updates feedback through the signed-in superuser client
  - `app/api/admin/audit/route.ts` now inserts admin audit rows through the signed-in admin client, backed by new insert RLS
  - `app/api/submissions/[id]/test-flag/route.ts` now uses the signed-in superuser client after adding an explicit superuser update policy on `public.submissions`
- Added shared business-id slug validation via `parseBusinessIdParam(...)` in `lib/api-validation.ts` and applied it to:
  - `app/api/businesses/[id]/modules/route.ts`
  - `app/api/businesses/[id]/trial/route.ts`
  - `app/api/businesses/[id]/reminder-interval/route.ts`
  - `app/api/businesses/[id]/logo/route.ts`
  This prevents arbitrary path input from flowing into business updates or logo storage paths.
- Added `docs/migrations/035_reduce_service_role_surface.sql` to introduce the missing authenticated insert/update policies that let the admin-audit, purge, and superuser test-flag routes move off service-role access.
- Added `docs/migrations/036_business_logo_storage_rls.sql` to allow authenticated superusers to manage the `business-logos` bucket without service-role access.
- Added `docs/migrations/037_psychosocial_post_incident_rls.sql` so the psychosocial post-incident flow can resolve workers through a narrow authenticated RPC and insert `psychosocial_health` module submissions through medic-scoped RLS instead of service-role.
- Added `docs/migrations/038_authenticated_app_event_rate_limit_rpc.sql` so the Supabase rate-limit fallback can count recent app events through an authenticated RPC instead of a service-role table query.
- Expanded `getAuthenticatedMedic()` in `lib/pdf-helpers.ts` to return the authenticated Supabase client and medic site scope, which let the export routes move off service-role cleanly.
- Updated `app/api/psychosocial-assessments/post-incident/route.ts` to remove the mid-request service-role client. Worker resolution now happens through the authenticated `resolve_scoped_worker_account(...)` RPC, and the post-incident insert now uses the signed-in medic client.
- Moved the unread feedback count out of `app/superuser/layout.tsx` and into `app/api/superuser/feedback/unread-count/route.ts`, so the service-role client is now isolated to a dedicated superuser-only API boundary instead of being instantiated in the layout on every render.
- Reworked `lib/rate-limit.ts` so the non-Redis fallback uses the authenticated `count_my_recent_app_events(...)` RPC instead of a service-role client querying `app_event_log` directly. The protected write routes now pass their signed-in client into the limiter.
- Added middleware-level `CRON_SECRET` verification in `lib/supabase/middleware.ts` for `/api/cron/*` requests, so cron endpoints now have a second authentication gate before route code runs.
- Tightened `app/api/admin/audit/route.ts` so `target_user_id` must belong to the acting admin's business before an audit row can be recorded.
- Centralized same-origin browser-write protection in `lib/supabase/middleware.ts` for non-GET `/api/*` requests (excluding cron), so new mutating routes now get a middleware-layer CSRF gate by default in addition to any route-level checks.
- Added the missing `app/api/superuser/feedback/unread-count/route.ts` endpoint so the superuser layout badge fetch is backed by a real server route again.
- Replaced the last silent PDF image-embed catches in the declaration and medication export routes with structured warning logs that include the declaration ID and medication name.

### Secret exposure finding

- In this checkout, `.env` is not currently tracked by git.
- `git ls-files .env .env.example .gitignore README.md` returned only `.gitignore` and `README.md`.
- That lowers the immediate certainty of an active tracked-file leak in this repo, but it does **not** remove the need to rotate keys if the current service-role key was ever committed, shared, or pasted into logs/history elsewhere.
- The current keys are still test/pre-production keys. All web and iOS app secrets will be rotated before go-live so production starts from a clean secret baseline.

## Immediate operator actions still required

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Supabase if there is any chance they were exposed previously.
2. Update Vercel environment variables after rotation.
3. Set a new `CRON_SECRET` with at least 32 random characters in Vercel and any local secret stores.
4. Smoke-test web write actions in the browser after the CSRF change:
   - feedback submission
   - declaration review save
   - declaration comment create
   - purge flows
   - business settings updates
   - psychosocial post-incident case creation

## Next security phases

### Web app

1. Continue reducing service-role usage to the minimum possible surface and prefer user-scoped clients plus RLS where feasible. The 2026-04-05 policy snapshot confirmed `public.businesses` and `public.feedback` write RLS for superusers/authenticated users, and migration `035_reduce_service_role_surface.sql` adds the missing audit/purge/test-flag policies for the remaining web routes that were still blocked.
   - The remaining web app holdouts are now mostly policy-centralization and follow-through items rather than obvious service-role shortcuts.
2. Replace DB-backed write throttling with Upstash Redis for cross-region correctness.
3. Add shared request/error correlation IDs to API responses and logs.
4. Fix PDF export idempotency by making `exported_at` updates conditional/atomic. Completed on 2026-04-08 via shared `markExportedIfNeeded(...)` in `lib/export-stamp.ts`, now used by declaration, medication, fatigue, and psychosocial PDF routes.
5. Replace silent catches in export routes with structured logging.
6. Add UUID validation on dynamic route params for high-value endpoints. Completed on 2026-04-08 for declaration, medication, fatigue, psychosocial, feedback, and submission test-flag routes via shared `parseUuidParam(...)` in `lib/api-validation.ts`.

## Additional backlog from follow-up review

### Open web-app items

1. Centralized same-origin checks in middleware for all non-GET `/api/*` browser writes (excluding cron). Completed after the original 2026-04-08 note via `lib/supabase/middleware.ts`, while preserving the existing route-level checks as defense in depth.

### Completed web-app items from the same review

1. PDF export routes now enforce medic scope before returning PHI-heavy documents. Completed on 2026-04-08 by moving the declaration, medication, fatigue, and psychosocial PDF routes onto the authenticated medic client and checking business/site scope in the route path itself.
2. The psychosocial post-incident route no longer switches to a service client mid-request. Completed on 2026-04-08 by moving worker resolution into a narrow authenticated RPC and adding medic insert RLS for `psychosocial_health` module submissions.
3. The unread feedback count no longer instantiates a service-role client in the superuser layout. Completed on 2026-04-08 by isolating that count to `app/api/superuser/feedback/unread-count/route.ts`.
4. The rate-limit fallback no longer uses the service-role key to query `app_event_log`. Completed on 2026-04-08 by switching the fallback to the authenticated `count_my_recent_app_events(...)` RPC.
5. `/api/cron/*` now has middleware-level `CRON_SECRET` verification. Completed on 2026-04-08 as a second layer on top of the existing route checks.
6. `app/api/admin/audit/route.ts` now validates that `target_user_id` belongs to the same business before writing an audit row. Completed on 2026-04-08.

### Open iOS items

1. `ProtectedHealthDataStore` now uses `.complete` file protection, and protected reads now degrade gracefully when the device is still locked immediately after resume.
2. Added certificate-pinning support for Supabase traffic through a custom `URLSessionDelegate` in `SupabaseService`, configured by `SUPABASE_CERTIFICATE_SHA256_PINS`. Operators still need to populate real certificate hashes in the local secrets config for enforcement.
3. Moved worker dismissed-card IDs and the “remember profile” flag out of `UserDefaults` into protected local storage via `ProtectedWorkerPreferencesStore`.
4. Added a worker re-authentication gate before starting a new emergency declaration after the app resumes from a 5+ minute background interval.
5. Replaced the shared temporary contractor-medic password flow with a password-setup email path: the app now provisions a one-time random password server-side and immediately sends a password-reset email so the medic sets their own password before first use.

## Performance note

- The previously documented redundant login `getUser()` call is already fixed in this checkout.
- The main medic layout already uses request-scoped React `cache()` wrappers for auth/account/module reads, and today's work extended that reuse into the remaining slower medic pages listed above.
- Remaining navigation latency on Vercel is now more likely to come from:
  1. middleware auth refresh in `lib/supabase/middleware.ts`, which still calls `supabase.auth.getUser()` on protected navigations
  2. the actual page data queries for the selected tab/detail view
  3. network distance between Vercel region and Supabase/Auth for this project
- That measurement path is now wired in. Check:
  - browser/network response headers for `x-medguard-request-id`, `x-medguard-middleware-auth-ms`, and `Server-Timing`
  - Vercel function logs for `{"type":"request_timing",...}` entries with the matching `request_id`
- Live preview sampling on 2026-04-08 showed `x-medguard-middleware-auth-ms` around 650 ms on a medic tab RSC request, confirming middleware auth was dominating the remaining tab-switch delay before this bypass change.

### iOS app

1. Replaced `print(...)` logging in `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift` with `Logger` and `.private` privacy annotations.
2. Added an explicit Supabase `URLSession` timeout policy in `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseService.swift`:
   - request timeout: 30 seconds
   - resource timeout: 60 seconds
3. Replaced silent observability `try?` writes in:
   - `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Auth/AuthViewModel.swift`
   - `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/FatigueAssessmentViewModel.swift`
   - `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/PsychosocialPulseViewModel.swift`
   These now log observability-write failures instead of swallowing them silently.
4. Replaced several silent worker dashboard/history `try?` fetches with logged fallbacks in:
   - `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeLifecycle.swift`
   - `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHistoryView.swift`
5. Still pending:
   - offline draft queue parity for declaration submission
   - accessibility labels and non-colour-only status cues
   - broader audit of remaining `try?` use across local-storage and admin/medic UI paths

## iOS finding snapshot

Plain-text logging was found in:

- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift:66`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift:72`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift:74`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift:139`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift:142`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift:151`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseDeclarationRepository.swift:154`

Those call sites have now been replaced with `Logger` and `.private` privacy handling.

## Additional iOS hardening completed

- Supabase-backed networking no longer relies on the default shared session. The app now uses a dedicated configured session through `SupabaseClientOptions.GlobalOptions`.
- Worker-facing lifecycle/history fetches still degrade gracefully to partial/empty states when individual requests fail, but they now emit `OSLog` entries so failures are diagnosable.
- Auth, fatigue, and psychosocial flows now preserve the existing non-blocking behavior for observability writes while recording logging failures instead of dropping them silently.

## Notes

- PDF exports remain re-downloadable until purge by product decision, but repeat exports are now explicitly auditable in `app_event_log` via `context.export_kind = first_export|re_export`.
- While de-scoping the PDF routes, explicit medic site-scope enforcement was added to the emergency and medication export paths instead of relying on service-role reads.
- Post-hardening PDF product follow-ups are tracked in `docs/pdf-export-follow-ups-2026-04-08.md`, including exporter identity, medic comments with author/timestamp, and removal of the patient signature field from exported PDFs.
- The CSRF protection added today is an origin/referrer enforcement layer for browser-originated writes. It is a practical same-origin defense for this app, but it should be complemented by secure cookie settings and continued route-level auth checks.
- Because the apps are still in test and not yet in production, pre-go-live hardening should assume every current secret can be replaced and every environment variable can be reissued before launch.
