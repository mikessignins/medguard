# Security Remediation Plan - 2026-04-11

## Scope

This plan consolidates the April 2026 cross-review of:

- Web app: `/Volumes/1tbusb/MedM8_WebApp`
- iOS app: `/Volumes/1tbusb/xcode/meddec`

The system handles sensitive health information for mining operations. The plan assumes production-grade clinical workflows with strict tenant isolation, least-privilege access, immutable auditability, and Australian privacy expectations.

## Role Model

The product has four user roles:

- `worker`: mobile worker/contractor user, iOS only
- `medic`: clinical reviewer, iOS and web
- `admin`: business-appointed administrator for one business
- `superuser`: platform owner/operator across all businesses

There is no separate business-scoped superuser product role. Business-scoped administration belongs to `admin`; platform-wide administration belongs to `superuser`.

## Product Rules To Preserve

### Platform Superusers

Platform superusers are the owners/operators of the MedGuard platform. They must be able to:

- see all businesses
- onboard and configure businesses
- create and manage business admins
- suspend and unsuspend businesses
- switch modules on and off
- review platform-level feedback, billing, and operational state

The security fix is not to remove this capability. The fix is to represent platform scope explicitly and audit its use.

### Worker Mobility

Workers, especially contractors, can change sites frequently and may join new businesses over time.

Workers can move freely; records cannot.

This means:

- a worker may select another site in their active business at any time
- a worker may join a new business with a valid invite code
- the app may switch the dashboard to the newly active business
- GPS may suggest the nearest site owned by the active business
- historical submissions must remain bound to the business and site where they were created
- switching site or business must not rewrite old clinical records

## Priority 0 - Database Authority And Tenant Isolation

### 1. Make Supabase migrations executable and complete

Status: in progress

Problem:
The strongest RLS policy evidence currently lives in documentation snapshots and `docs/migrations`, not in a normal `supabase/migrations` chain. Migration `005` omits RLS enablement for `businesses` and `feedback`, while `docs/rls_policies_2026_04_05.md` shows those policies in a captured environment. That is a deployment-drift risk.

Required work:

- create a real `supabase/migrations` chain or move the current SQL there in order
- add/verify RLS on every public table, including `businesses`, `feedback`, `worker_memberships`, `submission_comments`, module tables, audit tables, and storage objects
- add explicit migration coverage for `businesses` and `feedback`
- add a CI check that fails if any public table has `relrowsecurity = false`
- add policy tests for worker, medic, admin, and platform superuser

Acceptance criteria:

- a fresh local Supabase reset applies all policies
- production `pg_policies` matches the expected policy snapshot
- no public table is missing RLS unless explicitly exempted in a reviewed allowlist

### 2. Make platform superuser scope explicit

Status: implemented in `041_security_authority_rpc.sql`; pending database apply/verification

Problem:
Current web route logic used to treat a superuser with no `business_id` as globally scoped. Platform-wide superuser access is intentional, but it should be represented explicitly rather than inferred from NULL state.

Required work:

- add `superuser_scope text not null default 'business'` or `is_platform_superuser boolean not null default false`
- backfill existing platform owner accounts explicitly
- update `requireScopedBusinessAccess` to use explicit scope
- mirror the same distinction in RLS helpers

Acceptance criteria:

- platform superusers can manage all businesses
- admins remain the only business-scoped administration role
- a mistaken NULL `business_id` does not grant platform-wide access by itself
- all platform-scope operations write audit events

## Priority 0 - Clinical Write Consistency

### 3. Move clinical reviews into shared backend-controlled operations

Status: implemented in `041_security_authority_rpc.sql`; pending database apply/verification

Problem:
The web app has guarded review routes for clinical decisions, but the iOS app still performs direct Supabase table updates for several review and comment paths. This allows channel-specific bypass of transition, terminal-state, concurrency, and audit rules.

Required work:

- create transactional RPCs or shared API endpoints for:
  - emergency declaration review
  - medication declaration review
  - fatigue review
  - psychosocial review
  - review-start/claim actions
- enforce inside the backend operation:
  - authenticated actor
  - active medic status
  - business and assigned-site scope
  - allowed status transition
  - expected current version/status
  - immutable audit insert
  - version increment or compare-and-swap update
- remove direct iOS `.update(...)` calls for clinical review state

Acceptance criteria:

- iOS and web use the same backend authority for every review outcome
- stale concurrent review attempts fail with a conflict
- terminal review states cannot be overwritten through either app
- medic attempts outside assigned site fail at the database boundary

### 4. Make clinical comments append-only everywhere

Status: implemented in `041_security_authority_rpc.sql`; pending database apply/verification

Problem:
The web app has normalized `submission_comments`, but iOS can still rewrite the legacy `submissions.comments` JSON array. This weakens clinical audit integrity.

Required work:

- backfill legacy JSON comments into `submission_comments`
- remove iOS writes to `submissions.comments`
- add an insert-only `add_submission_comment(...)` RPC or API route
- add a trigger rejecting future mutation of `submissions.comments`
- remove web fallback to legacy comments after backfill

Acceptance criteria:

- comments can be added but not edited or deleted
- every comment has actor, timestamp, submission id, business id, and site id
- legacy comments are preserved as historical imported rows

## Priority 0/1 - Worker Mobility

### 5. Move worker join and active membership switching into RPCs

Status: implemented in `041_security_authority_rpc.sql`; pending database apply/verification

Problem:
Workers are allowed to join businesses and switch active site/business context. The current iOS repository updates `worker_memberships` and syncs `user_accounts.business_id` directly from the client.

Required work:

- add `worker_join_business_with_invite(p_invite_code text)`
- add `worker_set_active_membership(p_membership_id uuid)`
- inside each RPC:
  - use `auth.uid()` as the worker id
  - validate invite code server-side
  - ensure the membership belongs to the signed-in worker
  - deactivate previous active memberships for that worker
  - activate the selected membership
  - update current account context if the app still needs `user_accounts.business_id`
  - write an immutable audit event
- update iOS `SupabaseUserRepository` to call those RPCs

Acceptance criteria:

- workers can still join businesses with invite codes
- workers can still switch active business/site for legitimate work
- workers cannot activate another worker's membership by UUID
- historical submissions retain their original business and site
- membership changes are auditable

### 6. Treat GPS as a suggestion, not an authorization boundary

Status: implemented in `041_security_authority_rpc.sql` and iOS repository calls; pending database apply/verification

Required work:

- keep GPS nearest-site selection in the iOS UI
- fetch selectable sites only from the active business
- verify server-side that submitted `site_id` belongs to the active business
- store `site_id`, `site_name`, and `business_id` snapshots on each submitted record

Acceptance criteria:

- GPS can suggest the closest allowed site
- manual override remains possible
- a modified client cannot submit under a site outside the active business

## Priority 1 - Immutable Audit Trail

### 7. Add audit coverage for sensitive writes and PHI access

Status: partially implemented

Problem:
`app_event_log` exists and is useful, but the system needs immutable audit coverage for clinical, admin, superuser, membership, export, and PHI read operations.

Required work:

- prefer audit writes inside RPCs or database triggers, not only client-side follow-up logging
- audit at minimum:
  - medic review started/completed/changed
  - medication approval/rejection
  - emergency declaration decision
  - clinical comment added
  - worker business/site membership change
  - admin approves/revokes medic
  - admin changes medic contract or site assignment
  - admin creates/edits/deletes site
  - superuser creates admin
  - superuser suspends/unsuspends business
  - module toggles
  - PDF/export generation
  - PHI purge
  - failed authorization attempts on sensitive APIs
- include actor id, actor role, business id, site id where applicable, target id, action, result, timestamp, request id, and non-PHI context

Acceptance criteria:

- sensitive writes and exports are reconstructable from append-only logs
- failed authorization attempts are visible
- PHI read/export events are available for regulator or customer access-log requests

## Priority 1 - Authentication Hardening

### 8. Require MFA for privileged roles

Status: planned late in the hardening sequence so normal development and automated testing stay fast; production enforcement still required

Required work:

- enable Supabase Auth MFA
- require MFA enrollment for medic, admin, and superuser accounts
- block privileged dashboards and APIs until MFA is satisfied
- add iOS MFA challenge after password authentication for privileged roles
- document worker password-only access as a deliberate lower-friction exception if retained

Acceptance criteria:

- a compromised password alone cannot access medic/admin/superuser workflows
- iOS biometric unlock remains a local session protection, not the only second factor

### 9. Replace shared temporary password workflows

Status: partially implemented for web admin medic setup/reset; superuser business-admin creation still depends on the external `create-admin` function contract

Required work:

- replace admin-entered temporary passwords with invite or reset links
- force password setup/change before PHI access
- remove password copy/display UI
- audit account creation, invite, reset, and first-login completion

Acceptance criteria:

- admins and superusers never handle another user's plaintext password
- temporary-password users cannot access PHI until password setup is complete

### 10. Verify and enforce login throttling

Status: client-side backoff implemented for web and iOS; Supabase dashboard limits/CAPTCHA still require environment verification

Required work:

- document Supabase Auth rate-limit, CAPTCHA, and lockout settings
- add iOS exponential backoff after failed login attempts
- consider a server-mediated web login flow for privileged roles if dashboard settings are not sufficient

Acceptance criteria:

- brute-force protection is testable and documented
- privileged role login attempts are rate limited

## Priority 2 - Web Hardening

### 11. Add Content Security Policy

Status: implemented with enforced baseline CSP; monitor/tune before tightening inline allowances

Required work:

- add `Content-Security-Policy-Report-Only`
- tune allowed `connect-src`, `img-src`, `script-src`, and `font-src`
- move to enforced CSP once reports are clean

Acceptance criteria:

- production responses include CSP
- Supabase, Vercel, and required assets still work
- inline script/style needs are intentionally handled

### 12. Reduce service-role surface

Status: in progress

Required work:

- review every `createServiceClient()` call
- replace with user-scoped client plus RLS or narrow RPC where possible
- keep service-role for cron, provisioning, and reviewed platform operations only

Acceptance criteria:

- every remaining service-role call has a documented reason
- no routine user request uses service-role when RLS can safely authorize it

### 13. Sanitize server error logging

Status: partially implemented through sanitized `logApiError`; remaining direct `console.error` call sites need conversion

Required work:

- replace raw `console.error(error)` logging with structured logging
- strip SQL fragments, table details, storage paths, tokens, and PHI
- return only generic user-facing errors plus correlation ids

Acceptance criteria:

- production logs do not contain PHI, tokens, raw Supabase query context, or secrets

### 14. Audit superuser deidentified PDF exports

Status: implemented

Problem:
Medic PDF routes log per-export events, but the superuser deidentified PDF route should also log report generation.

Required work:

- log every superuser deidentified PDF generation
- include business id, site id filter, date range, actor id, and result
- do not log worker-level PHI

Acceptance criteria:

- platform report exports appear in `app_event_log`

## Priority 2 - iOS Hardening

### 15. Enforce certificate pinning in release builds

Status: implemented in app startup configuration; local CI script added

Required work:

- release builds must fail fast if `SUPABASE_CERTIFICATE_SHA256_PINS` is empty
- add CI check for non-empty release pins
- keep debug fallback if needed for local development

Acceptance criteria:

- production app cannot silently run without configured pins

### 16. Encrypt offline PHI beyond file protection

Status: not started

Required work:

- use CryptoKit envelope encryption for local PHI queues/caches
- store keys in Keychain, protected by device security
- add TTL purge for stale pending submissions

Acceptance criteria:

- offline PHI remains protected if app sandbox files are copied from an unlocked device backup or compromised host
- stale pending PHI is purged according to retention policy

### 17. Re-enable production email confirmation with OTP-style UX

Status: not started

Required work:

- remove production guidance to disable email confirmation
- use Supabase OTP/code confirmation where possible
- ensure invite-code registration still works onsite

Acceptance criteria:

- unverified email addresses cannot create durable production accounts

### 18. Add privileged device-integrity checks

Status: backlog

Required work:

- add lightweight jailbreak/device-integrity signals
- block medic/admin/superuser login on clearly compromised devices
- log integrity failures without collecting PHI

Acceptance criteria:

- privileged roles cannot use obviously compromised iOS devices

## Automated Regression Checks

Add CI checks for:

- no public table missing RLS
- worker cannot activate another worker's membership
- worker can join a business with a valid invite code
- worker cannot submit to a site outside active business
- historical submissions do not move when a worker changes business
- medic cannot review outside assigned site
- medic cannot alter terminal reviewed records
- comments are append-only
- admin cannot read raw PHI
- platform superuser can manage all businesses
- admins cannot manage other businesses
- temporary-password privileged users cannot access PHI
- PDF/export events write audit rows
- service-role usage allowlist has no unreviewed additions
- npm audit high severity gate
- iOS release config contains certificate pins

## Implementation Slices

### PR 1 - Database and policy foundation

- create executable migrations
- add missing RLS coverage
- add explicit platform superuser scope
- add RLS/policy tests
- add RLS CI check

### PR 2 - Worker membership authority

- add worker join/switch RPCs
- update iOS repository to use RPCs
- add membership audit rows
- add worker mobility tests

### PR 3 - Clinical workflow authority

- add clinical review/comment RPCs or shared API endpoints
- update iOS clinical repositories
- remove mutable legacy comment writes
- add transition/concurrency tests

### PR 4 - Audit expansion

- expand `app_event_log` or add `data_change_log`
- add audit triggers/functions for admin, superuser, membership, PHI read/export, and purge operations
- add audit verification tests

### PR 5 - Auth hardening

- privileged MFA
- remove shared temporary passwords
- login throttling/backoff
- email confirmation production path

### PR 6 - Web and iOS hardening

- CSP
- server log sanitization
- service-role allowlist/reduction
- release certificate pin enforcement
- offline PHI encryption and TTL purge
