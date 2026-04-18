# Occupational Health Dashboard Dev Status

Date: 2026-04-16
Repo: `/Volumes/1tbusb/MedM8_WebApp`
Reference skill: `medguard-project-refs`

## Current State

The occupational health dashboard has been extended from the original surveillance foundation into a broader operational admin workflow.

Implemented in app code:

- surveillance type-aware enrolment
- compliance dashboard with `green / amber / red / grey` worker status
- actionable worker queue filters
- provider management
- provider location management UI and scheduling support
- worker roster and availability exception management
- review task creation and status updates
- bulk enrolment by surveillance type
- reminder generation trigger and delivery log screen
- reports and operational summary views

Implemented in database migrations:

- Wave 1 occupational health scaffolding
- type-based enrolment RPCs
- appointment v2 RPCs with provider and reason-code support
- notifications foundation
- Phase 2 operations foundation
- Phase 2 management RPCs
- provider location management RPCs

## Deployment

Latest Vercel development preview:

- `https://medguard-nydgm2shp-mikessignins-1387s-projects.vercel.app`

Canonical MedGuard references:

- web repo: `https://github.com/mikessignins/medguard`
- local web path: `/Volumes/1tbusb/MedM8_WebApp`
- iOS repo: `https://github.com/mikessignins/MedGuardApp`
- production Vercel: `medguard-b9os3awg3-mikessignins-1387s-projects.vercel.app`

## Important Note

The newest provider-location management migration still needs to be applied for the new clinic location forms to work end to end:

- `supabase/migrations/20260416190000_surveillance_provider_location_management_rpcs.sql`

Without that migration:

- provider location UI will render
- provider location create/update/toggle actions will not succeed yet

## What Is Next

Highest-value next steps:

1. Run `20260416190000_surveillance_provider_location_management_rpcs.sql`.
2. Smoke test provider location create, edit, deactivate, and appointment selection in the preview environment.
3. Add provider-location-aware appointment UX improvements:
   - filter locations by selected provider
   - auto-fill or suggest appointment location text from clinic location
4. Add success and error flash messaging across surveillance server actions, not just bulk enrolment.
5. Add provider location support to reports and appointment tables so location-level utilisation becomes visible.
6. Decide whether to add provider capacity and availability management or keep provider locations lightweight.

## Suggested Phase 3

After the current operational admin layer is stable, the next larger phase should focus on automation and workflow depth:

- scheduled reminder generation rather than manual trigger only
- escalation recipients beyond worker-only delivery
- onboarding and mobilisation trigger automation
- role change and site transfer reassessment triggers
- exportable compliance and workload reporting
- contractor-specific surveillance visibility rules

## Validation Snapshot

Latest completed validation:

- `npm run build` passed locally after the provider location changes
- Vercel preview deployment triggered successfully for the current codebase
