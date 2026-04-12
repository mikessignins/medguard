# MedGuard Handoff — 2026-04-12

## Context

Today focused on production security remediation and follow-up bug fixes for the MedGuard web app, with some prior iOS/web security work already present in the same working tree. The web app is at `/Volumes/1tbusb/MedM8_WebApp`; the iOS app is at `/Volumes/1tbusb/xcode/meddec`.

Core role model confirmed with the product owner:

- `worker`: iOS worker dashboard only. Workers may change sites freely and may join/switch businesses using invite codes.
- `medic`: clinical reviewer for assigned business/sites.
- `admin`: business-appointed administrator for one business.
- `superuser`: platform owner/operator with platform-wide access to all businesses.

## Production Deployments

Several direct Vercel production deployments were made during the day using:

```bash
vercel deploy --prod -y --no-wait --scope mikessignins-1387s-projects
```

Current production alias:

- `https://medguard-nu.vercel.app`

Latest confirmed Ready deployment:

- Deployment URL: `https://medguard-g5oryyzfn-mikessignins-1387s-projects.vercel.app`
- Deployment ID: `dpl_E1virB4tSkKZ4oFHKmyqhRtzFrAj`
- Status: Ready

Previous notable Ready deployments today:

- `dpl_ratgKtH6mzmsPSVZb1QU8atCvRxj`: earlier superuser business-list fix deployment.
- `dpl_H5jE6MysDVq4akKW1Fh9Ys3NXzHq`: medic signup / cron warning deployment.
- `dpl_GgnvqsxTYWsbJ8yMVv4W6GzzRxwh`: CSP image-source fix deployment.
- `dpl_BFtbWCEvGYLnKTCDHudp15ccTQAb`: first canonical auth URL deployment.

## Database / Migration State

The user reported that migration `041` had been run. Later, the user also ran the SQL for the superuser-role fix.

Migration files added or mirrored in this repo:

- `supabase/migrations/20260411000000_security_authority_rpc.sql`
- `docs/migrations/041_security_authority_rpc.sql`
- `supabase/migrations/20260412000000_superuser_role_is_platform.sql`
- `docs/migrations/042_superuser_role_is_platform.sql`
- `supabase/migrations/20260412001000_business_logos_public_read.sql`
- `docs/migrations/043_business_logos_public_read.sql`

User-provided database snapshots added:

- `docs/migrations/RLS_Policies_as_of_20260412`
- `docs/migrations/SQL_Database_schema_as_of_20260412`

Migration `043` was added after diagnosing logo preview rendering. The live bucket was already marked public when checked through Supabase Storage API, but the migration documents/enforces the intended state:

- `business-logos` bucket is public-readable.
- A public SELECT policy exists for `storage.objects` where `bucket_id = 'business-logos'`.

Clinical/PHI buckets are not made public by this migration.

## Major Fixes Completed

### Superuser Business Visibility

Problem: after RLS hardening, the superuser dashboard stopped listing businesses.

Fix:

- Treated `role = 'superuser'` as platform-wide by definition.
- Removed business-scoped/null-business inference for superusers.
- Updated web superuser pages and route access tests.
- Added migration `042` to backfill superusers and redefine `is_platform_superuser()`.

Key files:

- `lib/route-access.ts`
- `lib/__tests__/route-access.test.ts`
- `app/superuser/page.tsx`
- `app/superuser/business/[id]/page.tsx`
- `app/api/superuser/reports/deidentified-pdf/route.ts`

### Medic Signup / Admin-Created Medic Flow

Problem: medics needed a way to request/create an account from the web side, and admin-created medic passwords should not be displayed/shared by admins.

Fix:

- Added public medic signup request page.
- Added `POST /api/medic-signup`.
- Added login-page link to request medic access.
- Updated middleware public paths for `/medic-signup` and `/api/medic-signup`.
- Changed admin-created medic flow to send Supabase invite emails instead of exposing generated temporary passwords.
- Changed medic password reset/setup flow to send reset/setup email.

Key files:

- `app/medic-signup/page.tsx`
- `app/api/medic-signup/route.ts`
- `app/login/page.tsx`
- `lib/supabase/middleware.ts`
- `app/api/admin/contractor-medics/route.ts`
- `app/api/admin/medics/[id]/password/route.ts`
- `components/admin/StaffManager.tsx`

### Canonical Auth Invite URLs

Problem: Supabase Auth invite email arrived saying the user had been invited to create an account on `http://localhost:3000`.

Fix on app/Vercel side:

- Added `APP_BASE_URL=https://medguard-nu.vercel.app` to Vercel Production.
- Added `lib/app-url.ts`.
- All server-side invite/setup email redirects now use `getAccountSetupUrl(req.url)` instead of raw request origin.
- Added regression tests to ensure configured production URL wins over localhost/preview request origins.

Key files:

- `lib/app-url.ts`
- `lib/__tests__/app-url.test.ts`
- `app/api/admin/contractor-medics/route.ts`
- `app/api/admin/medics/[id]/password/route.ts`
- `app/api/medic-signup/route.ts`
- `.env.example`

Remaining external step:

- In Supabase Dashboard, set `Authentication -> URL Configuration`:
  - Site URL: `https://medguard-nu.vercel.app`
  - Redirect URLs:
    - `https://medguard-nu.vercel.app/account`
    - `https://medguard-nu.vercel.app/**`

Reason: Supabase controls the base URL/wording in its hosted Auth email templates. The app now passes a production `redirectTo`, but the Supabase Auth Site URL must also be corrected so future emails no longer mention localhost.

### Superuser Logo Uploads

Problem 1: uploading a business logo from the superuser dashboard failed with generic error.

Production logs showed:

```txt
StorageApiError: new row violates row-level security policy
```

Fix:

- Kept user-scoped auth/role checks.
- Switched the privileged storage upload and `businesses` logo update to `createServiceClient()` after authorization succeeds.
- Added route-specific user-facing error text for logo storage/configuration failures.
- Added service-role allowlist entry in `scripts/security-check.mjs`.

Problem 2: uploaded logo previews displayed alt text/text only instead of images.

Diagnosis:

- ACME logo objects existed and returned `200`.
- Object content type was `image/webp`.
- CSP blocked Supabase-hosted image URLs because `img-src` only allowed `self`, `data`, and `blob`.

Fix:

- Updated CSP in `next.config.mjs`:

```txt
img-src 'self' data: blob: https://*.supabase.co
```

Additional robustness:

- Added server-side image header detection so files with misleading extensions are stored with the real MIME/extension.
- The sample file `/Users/michaelfullarton/Downloads/ACME_Corporation.png` was actually WebP data.

Key files:

- `app/api/businesses/[id]/logo/route.ts`
- `next.config.mjs`
- `scripts/security-check.mjs`
- `docs/migrations/043_business_logos_public_read.sql`
- `supabase/migrations/20260412001000_business_logos_public_read.sql`

### Cron / Auto-Purge Warning

Problem: admin dashboard showed:

```txt
Auto-purge not running. Last run: 3 days ago. Contact your system administrator.
```

Production logs showed `/api/cron/purge-exports` returning 500 in middleware/route. `CRON_SECRET` existed in Vercel Production and Preview, but the code required a minimum length of 32 characters.

Fix:

- Relaxed runtime secret validation to require presence instead of minimum length for cron routes.
- This avoids failing if the deployed `CRON_SECRET` is shorter than 32 characters.

Key files:

- `lib/supabase/middleware.ts`
- `app/api/cron/purge-exports/route.ts`
- `app/api/cron/contractor-expiry/route.ts`

Recommended follow-up:

- Rotate `CRON_SECRET` to a long random value later, then keep the less brittle runtime check.

### Broader Security Hardening Already in Working Tree

The working tree also contains broader security remediation from this effort:

- RLS hardening for businesses/feedback and clinical write paths.
- RPC-backed clinical review/comment actions.
- Worker business-switching and active-membership RPC support.
- CSP and security headers.
- Login backoff and rate-limit improvements.
- Service-role allowlist checks.
- RLS coverage script.
- iOS release certificate-pinning check script.
- Removal of `worker-dashboard-concept.svg` from the iOS repo at user request.

Key files/scripts:

- `docs/security-remediation-plan-2026-04-11.md`
- `scripts/security-check.mjs`
- `scripts/check-rls.mjs`
- `package.json`
- iOS: `scripts/check-release-pins.sh`

## Verification Run Today

Latest verification before handoff:

```bash
npm test
npx tsc --noEmit
npm run -s lint
npm run -s security:check
```

Latest result:

- `npm test`: 13 files passed, 86 tests passed.
- TypeScript: passed.
- Lint: passed.
- Security check: passed.

Manual/live checks performed:

- Vercel production deployment status checked with `vercel inspect`.
- Production CSP header checked with `curl -sI https://medguard-nu.vercel.app/superuser/business/acme_corp`.
- ACME logo storage objects checked via Supabase service client:
  - `acme_corp-light.webp`: HTTP 200, `image/webp`.
  - `acme_corp-dark.webp`: HTTP 200, `image/webp`.
- Vercel env checked and `APP_BASE_URL` added to Production.

## Known Remaining Work

1. Update Supabase Auth Site URL and redirect allowlist.
   - This is the only remaining step for the `localhost:3000` invite-email wording.
   - Do it in Supabase Dashboard rather than pushing a full `supabase/config.toml`, because the repo currently has no config file and a broad config push could overwrite unrelated hosted Auth settings.

2. Resend any stale medic invite emails.
   - Old invite emails containing `localhost:3000` should be ignored.
   - After Supabase Auth URL config is corrected, send a fresh invite/setup email.

3. Rotate secrets as part of the broader security remediation.
   - Earlier security review noted exposed/local `.env` values and recommended rotating Supabase anon/service keys.
   - Do this carefully with Vercel and iOS config updates.

4. Run migration `043` if it has not already been applied manually.
   - The live bucket was already public when checked, but the migration should be applied for durable environment parity.

5. Consider replacing Supabase hosted Auth email templates.
   - The default “You have been invited to create a user on ...” wording is generic.
   - A branded MedGuard invite template would reduce confusion for medics/admins.

## Worktree Notes

The web repo has many modified/untracked files from the larger security effort. Do not assume every dirty file belongs to the most recent invite/logo fix.

Notable untracked files created during this work include:

- `app/api/medic-signup/`
- `app/medic-signup/`
- `lib/app-url.ts`
- `lib/__tests__/app-url.test.ts`
- `docs/migrations/041_security_authority_rpc.sql`
- `docs/migrations/042_superuser_role_is_platform.sql`
- `docs/migrations/043_business_logos_public_read.sql`
- `supabase/migrations/20260411000000_security_authority_rpc.sql`
- `supabase/migrations/20260412000000_superuser_role_is_platform.sql`
- `supabase/migrations/20260412001000_business_logos_public_read.sql`

There are also pre-existing or separately generated changes in files such as:

- `app/account/page.tsx`
- `lib/user-facing-errors.ts`
- `lib/__tests__/user-facing-errors.test.ts`

Review the diff carefully before committing.

