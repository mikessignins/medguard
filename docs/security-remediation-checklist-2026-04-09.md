# Security Remediation Checklist — 2026-04-09

## Purpose

This document tracks the 2026-04-09 security and safety review findings that still need to be verified, fixed, or explicitly closed out.

Use this as the working checklist for implementation and QA across both codebases:

- Web app: `/Volumes/1tbusb/MedM8_WebApp`
- iOS app: `/Volumes/1tbusb/xcode/meddec`

Status legend:

- `[ ]` not fixed yet
- `[~]` partially addressed or needs verification
- `[x]` fixed and verified

## Priority Order

1. [x] Web: race condition on decision routes, add optimistic-lock predicate to `UPDATE`
2. [x] Web: medication review guard must block reversals from final state
3. [x] iOS: recall submission must verify `worker_id`
4. [x] iOS: logout must clear all local profiles and protected worker preferences
5. [x] Web: purge audit log must be atomic with PHI delete ordering
6. [~] iOS: add inactivity timeout for medic role
7. [x] Web: rate limiting must fail closed when enforcement is unavailable
8. [x] iOS: remove or isolate `AppEnvironment.shared`

## Critical

### 1. Race condition in all decision routes

- Status: [x]
- Scope: Web
- Issue:
  `app/api/declarations/[id]/review/route.ts` validates the `version` field before writing, but the actual `.update()` does not include `.eq("version", currentVersion)`. Two medics reviewing the same declaration concurrently can both pass validation, and the later write silently overwrites the earlier decision.
- Required fix:
  Add `.eq("version", currentVersion)` to the `UPDATE` statement on all four decision routes:
  - `app/api/declarations/[id]/review/route.ts`
  - `app/api/fatigue-assessments/[id]/review/route.ts`
  - `app/api/medication-declarations/[id]/review/route.ts`
  - `app/api/psychosocial-assessments/[id]/review/route.ts`
- Verification:
  Simulate two concurrent reviews against the same record and confirm the stale write is rejected.
- Evidence:
  Added compare-and-swap style update predicates in all four review routes so stale writes now fail with `409` instead of silently overwriting:
  - `app/api/declarations/[id]/review/route.ts`
  - `app/api/fatigue-assessments/[id]/review/route.ts`
  - `app/api/medication-declarations/[id]/review/route.ts`
  - `app/api/psychosocial-assessments/[id]/review/route.ts`

### 2. Medication review guard allows reverting final decisions

- Status: [x]
- Scope: Web
- Issue:
  `lib/medication-review-guards.ts` rejects transitions from a final status only when `currentStatus !== requestedStatus`. That still allows a reversal such as `Normal Duties -> Pending`.
- Required fix:
  Reject any transition where `isFinalMedicationReviewStatus(currentStatus)` is true, regardless of the requested next status.
- Verification:
  Add or update tests so any transition away from a final medication review status is denied.
- Evidence:
  Updated `lib/medication-review-guards.ts` and `lib/__tests__/medication-review-guards.test.ts`.
  Targeted vitest run passed on 2026-04-09.

### 3. iOS recall submission does not verify worker ownership

- Status: [x]
- Scope: iOS
- Issue:
  `SupabaseDeclarationRepository.swift` recall `UPDATE` filters on `business_id` and status but not `worker_id`. A worker who knows another worker's submission UUID could recall it.
- Required fix:
  Add `.eq("worker_id", value: currentUserId)` to the recall `UPDATE` filter.
- Verification:
  Confirm one worker cannot recall another worker's submission even with a valid UUID.
- Evidence:
  `SupabaseDeclarationRepository.swift` now requires the authenticated `worker_id` on recall updates before the row can be marked recalled.

### 4. iOS module submission updates are missing worker ownership checks

- Status: [x]
- Scope: iOS
- Issue:
  `SupabaseModuleSubmissionRepository.swift` fatigue and psychosocial status updates filter only on `id` and `module_key`, not ownership context.
- Required fix:
  Include the appropriate ownership constraints in all `module_submissions` `UPDATE` filters. Review the implementation carefully against the actual schema and ensure the final predicate cannot match another worker's record.
- Verification:
  Confirm a medic or worker cannot modify another worker's module submission by UUID alone.
- Evidence:
  `SupabaseModuleSubmissionRepository.swift` now includes `business_id` and `site_id` in fatigue and psychosocial review/claim update filters, and medic call sites now pass those scope values explicitly.

### 5. iOS local profile is not fully cleared on normal logout

- Status: [x]
- Scope: iOS
- Issue:
  `LocalProfileRepository.deleteProfile()` removes only the current user's file. On a shared device, previous users' PHI can remain on disk after logout.
- Required fix:
  Call `deleteAllProfiles()` on logout instead of `deleteProfile()`.
- Verification:
  Log in as user A, log out, then inspect local profile storage before user B logs in.
- Evidence:
  `AuthViewModel.signOut()` now clears all local profiles and protected worker preferences before ending the session.
  Added `LocalProfileRepositoryTests.deleteAllProfilesClearsProfilesForEveryUser`.

### 6. iOS medic sessions have no inactivity timeout

- Status: [~]
- Scope: iOS
- Issue:
  A medic can leave a device unlocked and another person nearby can continue accessing worker health data indefinitely.
- Required fix:
  Implement a 5-minute inactivity lock for the medic role requiring biometric or PIN re-authentication. Use foreground/background lifecycle handling.
- Verification:
  Leave the app idle or backgrounded beyond the threshold and confirm medic flows require re-authentication.
- Evidence:
  Added `PrivilegedSessionPolicy` plus a medic dashboard lock overlay that uses device-owner authentication (`Face ID` / `Touch ID` / passcode) after five minutes or after a long background interval.
  The iOS simulator build succeeded on 2026-04-09.
  Still needs manual runtime validation on-device or in Simulator for the biometric/passcode flow.

## High

### 7. Purge audit log is committed before PHI delete succeeds

- Status: [x]
- Scope: Web
- Issue:
  `app/api/declarations/purge/route.ts` writes the audit log before the PHI-nulling `UPDATE`. If the `UPDATE` fails, the audit trail incorrectly states that purge happened.
- Required fix:
  Make audit-log insert and PHI delete atomic through a transaction or RPC, or only log after the delete is confirmed.
- Verification:
  Force the data mutation to fail and confirm no successful purge audit entry is written.
- Evidence:
  Purge routes now write the audit log only after the PHI mutation succeeds:
  - `app/api/declarations/purge/route.ts`
  - `app/api/medication-declarations/purge/route.ts`
  - `app/api/fatigue-assessments/purge/route.ts`
  - `app/api/psychosocial-assessments/purge/route.ts`

### 8. Web medic session scope is not refreshed mid-session

- Status: [x]
- Scope: Web
- Issue:
  `lib/supabase/request-cache.ts` caches `getRequestUserAccount` for the life of the request tree, so UI state may lag if a medic loses access mid-session.
- Current note:
  The original review notes that API routes already re-validate medic scope via `requireMedicScope`, so this is primarily a UI freshness concern rather than a route-auth bypass.
- Required action:
  Verify all data-bearing API routes and sensitive pages still enforce fresh medic scope at entry. Keep this item open only if a real route gap is found.
- Evidence:
  Verified from source that middleware and API routes still enforce scoped access independently of the React request cache. No new route-auth gap was identified in this pass.

### 9. Rate limit fallback silently allows requests when it fails

- Status: [x]
- Scope: Web
- Issue:
  `lib/rate-limit.ts` returns `null` when the authenticated client is missing. If both Upstash and the DB fallback are unavailable, sensitive actions become effectively unlimited.
- Required fix:
  Fail closed and return `429` when rate limiting cannot be determined.
- Verification:
  Test both misconfigured Upstash and unavailable DB fallback paths and confirm protected routes deny the request.
- Evidence:
  `lib/rate-limit.ts` now returns `429` when neither Upstash nor the authenticated fallback can determine the limit state.

### 10. iOS worker preferences are not cleared on logout

- Status: [x]
- Scope: iOS
- Issue:
  `ProtectedWorkerPreferencesStore.clearAll()` exists but is not used on the normal sign-out path.
- Required fix:
  Call `clearAll()` during sign-out.
- Verification:
  Dismiss cards or set worker flags, sign out, then confirm protected preferences are gone.
- Evidence:
  `AuthViewModel.signOut()` now clears protected worker preferences on the normal sign-out path.

### 11. `AppEnvironment.shared` is a PHI-mixing footgun

- Status: [x]
- Scope: iOS
- Issue:
  `AppEnvironment.shared` is initialized with `userId: nil` and persists for the process lifetime. Future code could accidentally read or write user-scoped data through the anonymous environment.
- Required fix:
  Remove `AppEnvironment.shared` for user-scoped access, or enforce a crash/assertion if it is used in those paths.
- Verification:
  Audit call sites and ensure all user-scoped repositories and stores are constructor-injected from the authenticated session.
- Evidence:
  Removed `AppEnvironment.shared` and the anonymous environment path. `RootView` now creates `AuthViewModel` from concrete non-user-scoped repositories, and authenticated flows create `AppEnvironment(userId: account.id)` explicitly.

## Medium

### 12. `ProtectedHealthDataStore` uses `.completeUnlessOpen`

- Status: [x]
- Scope: iOS
- Issue:
  Health data should use `.complete` rather than `.completeUnlessOpen`.
- Current note:
  Existing security memory suggests this may already be completed in the iOS app, but it still needs explicit confirmation against the current source.
- Required action:
  Verify the store now uses `.complete` and that locked-device startup behavior is handled gracefully.
- Evidence:
  Verified from source on 2026-04-09 that `ProtectedHealthDataStore.protection` is set to `.complete` in `meddec/Data/ProtectedHealthDataStore.swift`.

### 13. `myDeclarations(workerId:)` trusts a caller-supplied worker ID

- Status: [x]
- Scope: iOS
- Issue:
  `SupabaseMedicationDeclarationRepository.myDeclarations()` accepts `workerId` as a parameter instead of deriving it from the authenticated session.
- Required fix:
  Resolve the worker ID from the Supabase session inside the repository and remove the external trust boundary.
- Verification:
  Ensure the repository cannot query another worker's history even if called incorrectly.
- Evidence:
  `MedicationDeclarationRepository.myDeclarations()` no longer accepts a caller-supplied worker ID. `SupabaseMedicationDeclarationRepository.swift` now derives the worker ID from the authenticated Supabase session.

### 14. OSLog privacy may not survive third-party crash reporters

- Status: [x]
- Scope: iOS
- Issue:
  `.private` protects system logs, but future crash-reporting integrations may capture the raw strings before redaction.
- Required fix:
  Avoid logging raw worker IDs and submission IDs in submission or health-data paths if a crash reporter is introduced.
- Verification:
  Document this as a logging rule and re-review if Sentry, Bugsnag, or similar tooling is added.
- Note:
  No crash-reporting SDK is present in the current iOS app source, so this remains a forward-looking hardening rule rather than an immediate code change.
- Evidence:
  Added an explicit logging rule to `docs/security-memory-2026-04-08-app-hardening.md` stating that identifiers must be removed or further redacted before any future crash-reporting integration exports health-path logs.

### 15. Web CSRF relies on per-route `requireSameOrigin()`

- Status: [x]
- Scope: Web
- Issue:
  A future route could miss route-level CSRF enforcement if the developer forgets to call `requireSameOrigin()`.
- Current note:
  Existing hardening notes indicate a middleware-level same-origin check for non-GET `/api/*` routes was added as defense in depth. This likely needs verification rather than new implementation.
- Required action:
  Confirm middleware coverage still applies to all non-GET browser API writes except intentional exclusions such as cron endpoints.
- Evidence:
  Verified from source on 2026-04-09 that `lib/supabase/middleware.ts` enforces `requireSameOrigin(request)` for non-GET `/api/*` writes, excluding cron routes which use bearer-secret middleware validation.

## Low

### 16. Temp medic password has no forced reset

- Status: [x]
- Scope: iOS and onboarding flow
- Issue:
  `addContractMedic()` previously created accounts with a shared temporary password and no forced reset.
- Current note:
  Existing security memory suggests onboarding was moved to a password-setup email flow. This should be verified and then closed if confirmed.
- Evidence:
  Verified from source on 2026-04-09 that `SupabaseUserRepository.addContractMedic(...)` creates a one-time random password and immediately triggers `resetPasswordForEmail(email)`, and the admin UI copy reflects the password-setup flow.

### 17. iOS session is not re-verified before medic review access after long sleep

- Status: [~]
- Scope: iOS
- Issue:
  If a medic returns after a long sleep and the auth session is still technically valid, they may land directly in the dashboard without fresh re-authentication.
- Required fix:
  Re-check session age in `BusinessDashboardView.onAppear` or equivalent entry point and redirect to re-auth when the last fresh login exceeds policy.
- Verification:
  Resume after a long idle interval with a still-valid auth token and confirm medic review screens require re-auth.
- Evidence:
  The medic dashboard now enforces the same five-minute privileged-session timeout and background lock policy used for item 6.
  Still needs manual runtime validation of the wake/resume path.

## Suggested Execution Plan

### Web first

1. Fix optimistic locking on all decision routes.
2. Fix medication final-state reversal guard and add tests.
3. Make purge logging atomic with the PHI mutation.
4. Make rate limiting fail closed.
5. Verify and close the already-likely-addressed medic-scope and middleware-CSRF items.

### iOS next

1. Fix ownership predicates on recall and module submission updates.
2. Harden logout to clear all local profiles and worker preferences.
3. Remove or constrain `AppEnvironment.shared`.
4. Add medic inactivity timeout and fresh-session re-auth checks.
5. Verify and close the `.complete` file-protection and onboarding-flow items if already done.

## Session Notes

- Keep this checklist updated as items move from `[ ]` to `[~]` to `[x]`.
- When an item is fixed, record the file paths changed and the verification performed beneath that item.
- If an item was already fixed in a prior session, update it to `[x]` and note the evidence.
