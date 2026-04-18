# Health Surveillance Implementation Tracker

Date: 2026-04-15
Repo: `/Volumes/1tbusb/MedM8_WebApp`

## Summary

This document tracks the Health Surveillance module foundation, the dedicated occ health dashboard, the occ health web signup flow, the worker role/surveillance intake work, and the follow-up fixes required to get the preview working.

The implementation was designed to keep MedGuard as an operational workflow platform rather than a clinical record repository. The new module stores scheduling, enrolment, workflow, and minimal operational outcome metadata only.

## Product Scope Added

- New business-toggleable module: `health_surveillance`
- New dedicated role: `occ_health`
- New pending role: `pending_occ_health`
- Dedicated web dashboard at `/surveillance`
- Unified staff signup flow for medic and occ health staff
- Admin management support for occ health staff
- Worker-facing next-appointment API contract
- Worker operational role intake for the iOS app
- Worker-facing surveillance summary surfaces in the iOS app

## Database Changes

Primary migration:

- [supabase/migrations/20260415090000_health_surveillance_foundation.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260415090000_health_surveillance_foundation.sql:1)

Included in the migration:

- module seed for `health_surveillance`
- role support for `occ_health` and `pending_occ_health`
- new enums for surveillance workflow states
- new tables:
  - `surveillance_programs`
  - `surveillance_enrolments`
  - `surveillance_appointments`
  - `surveillance_outcomes_minimal`
  - `surveillance_audit_events`
- strict RLS for all new tables
- RPC/functions for state transitions and worker next-appointment retrieval

Worker role / surveillance intake migration:

- [supabase/migrations/20260415143000_worker_operational_roles_and_surveillance_intake.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260415143000_worker_operational_roles_and_surveillance_intake.sql:1)

Included in the migration:

- new tables:
  - `business_worker_roles`
  - `worker_operational_profiles`
  - `business_worker_role_suggestions`
- worker RPCs:
  - `save_my_worker_operational_profile(...)`
  - `get_my_worker_operational_profile()`
- strict RLS for worker self-read and business-scoped occ health/admin visibility
- pending suggestion capture for `Other` role entries instead of automatic catalogue insertion

Shared surveillance worker directory migration:

- [supabase/migrations/20260416083000_surveillance_worker_directory.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260416083000_surveillance_worker_directory.sql:1)

Included in the migration:

- new shared worker directory table:
  - `surveillance_workers`
- supports both:
  - `app_user`
  - `manual_entry`
- adds `surveillance_worker_id` to:
  - `surveillance_enrolments`
  - `surveillance_appointments`
  - `surveillance_outcomes_minimal`
  - `surveillance_audit_events`
- allows occ health staff to manage workers who do not use the iOS app
- keeps worker-facing appointment access working for app-linked workers through the shared worker directory

## Web App Changes

### Surveillance dashboard

Added:

- [app/(dashboard)/surveillance/layout.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/layout.tsx:1)
- [app/(dashboard)/surveillance/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/page.tsx:1)
- [app/(dashboard)/surveillance/appointments/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/appointments/page.tsx:1)
- [app/(dashboard)/surveillance/appointments/[id]/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/appointments/[id]/page.tsx:1)
- [app/(dashboard)/surveillance/workers/[id]/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/workers/[id]/page.tsx:1)
- [app/(dashboard)/surveillance/programs/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/programs/page.tsx:1)

Supporting components:

- [components/surveillance/AppointmentTable.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/AppointmentTable.tsx:1)
- [components/surveillance/EnrolmentList.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/EnrolmentList.tsx:1)
- [components/surveillance/MetricCard.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/MetricCard.tsx:1)
- [components/surveillance/ScheduleAppointmentForm.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/ScheduleAppointmentForm.tsx:1)
- [components/surveillance/StatusBadge.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/StatusBadge.tsx:1)
- [components/surveillance/SurveillanceSidebar.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/SurveillanceSidebar.tsx:1)
- [components/surveillance/EligibleWorkerList.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/EligibleWorkerList.tsx:1)

Server-side query/action helpers:

- [lib/surveillance/queries.ts](/Volumes/1tbusb/MedM8_WebApp/lib/surveillance/queries.ts:1)
- [lib/surveillance/actions.ts](/Volumes/1tbusb/MedM8_WebApp/lib/surveillance/actions.ts:1)

Occ health worker intake/search:

- [app/(dashboard)/surveillance/workers/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/workers/page.tsx:1)
- [app/(dashboard)/surveillance/workers/[id]/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/workers/[id]/page.tsx:1)
- [components/surveillance/ManualWorkerForm.tsx](/Volumes/1tbusb/MedM8_WebApp/components/surveillance/ManualWorkerForm.tsx:1)

### Staff signup changes

Unified signup:

- [app/staff-signup/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/staff-signup/page.tsx:1)
- [components/auth/StaffSignupForm.tsx](/Volumes/1tbusb/MedM8_WebApp/components/auth/StaffSignupForm.tsx:1)
- [app/api/staff-signup/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/staff-signup/route.ts:1)

Compatibility redirects:

- [app/medic-signup/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/medic-signup/page.tsx:1)
- [app/occ-health-signup/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/occ-health-signup/page.tsx:1)
- [app/api/medic-signup/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/medic-signup/route.ts:1)
- [app/api/occ-health-signup/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/occ-health-signup/route.ts:1)

Login page updated to point at the unified signup flow:

- [app/login/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/login/page.tsx:1)

### Admin staff management changes

Updated to manage both medic and occ health staff:

- [app/admin/staff/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/admin/staff/page.tsx:1)
- [components/admin/StaffManager.tsx](/Volumes/1tbusb/MedM8_WebApp/components/admin/StaffManager.tsx:1)
- [app/api/admin/contractor-medics/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/admin/contractor-medics/route.ts:1)
- [app/api/admin/medics/[id]/password/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/admin/medics/[id]/password/route.ts:1)
- [lib/admin-medics.ts](/Volumes/1tbusb/MedM8_WebApp/lib/admin-medics.ts:1)

## Shared Role / Routing / Module Updates

Updated shared typing and routing support:

- [lib/types.ts](/Volumes/1tbusb/MedM8_WebApp/lib/types.ts:1)
- [lib/modules.ts](/Volumes/1tbusb/MedM8_WebApp/lib/modules.ts:1)
- [lib/web-access.ts](/Volumes/1tbusb/MedM8_WebApp/lib/web-access.ts:1)
- [lib/auth/roles.ts](/Volumes/1tbusb/MedM8_WebApp/lib/auth/roles.ts:1)
- [app/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/page.tsx:1)
- [lib/supabase/middleware.ts](/Volumes/1tbusb/MedM8_WebApp/lib/supabase/middleware.ts:1)

## API Additions

Worker-facing next-appointment endpoint:

- [app/api/surveillance/me/next-appointment/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/surveillance/me/next-appointment/route.ts:1)

Appointment mutation endpoint:

- [app/api/surveillance/appointments/[id]/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/surveillance/appointments/[id]/route.ts:1)

## iOS App Changes

Repo:

- `/Volumes/1tbusb/xcode/meddec`

Updated domain and data-layer support:

- [/Volumes/1tbusb/xcode/meddec/meddec/Domain/Models.swift](/Volumes/1tbusb/xcode/meddec/meddec/Domain/Models.swift:1)
- [/Volumes/1tbusb/xcode/meddec/meddec/Domain/Repositories.swift](/Volumes/1tbusb/xcode/meddec/meddec/Domain/Repositories.swift:1)
- [/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseService.swift](/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseService.swift:1)
- [/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseUserRepository.swift](/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseUserRepository.swift:1)

Worker UI additions:

- new post-quick-start work setup screen:
  - [/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerWorkSetupView.swift](/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerWorkSetupView.swift:1)
- worker home/profile integration:
  - [/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeView.swift](/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeView.swift:1)

Behavior added:

- worker can choose a business role from an alphabetical list
- worker can choose `Other` and enter free text
- worker can declare whether the role requires health surveillance
- role/surveillance data is saved server-side rather than only in local storage
- workers who declare surveillance requirement become visible to occ health intake/search
- the worker dashboard and profile surface the next surveillance appointment when one exists

Manual non-app worker support:

- occ health staff can add a worker who does not use the app with:
  - full name
  - phone
  - email
  - job role
  - site
  - operational notes
- manual workers appear in the same surveillance worker list as app workers
- manual workers can be enrolled and scheduled from the same worker detail page

## Privacy and Security Decisions

- No clinical values are stored in the surveillance module.
- No spirometry, audiometry, pathology, imaging, diagnosis, or report PDFs are stored.
- Outcomes are minimal and operational only.
- Restriction handling is a boolean flag only.
- State transitions are routed through RPC/functions instead of unrestricted direct client-side updates.
- RLS is enabled on all new surveillance tables.
- Workers can only see their own next/upcoming surveillance data.
- Medics do not automatically inherit surveillance access.

## Debugging / Fixes Applied During Delivery

### 1. Public route fixes

The new staff signup pages initially behaved like protected routes.

Fixes:

- allowed `/staff-signup` and related API routes through middleware
- retained compatibility redirects for `/medic-signup` and `/occ-health-signup`

### 2. Root routing support for occ health

The app root route did not initially know how to route approved or pending occ health users.

Fixes:

- `pending_occ_health` now routes to `/pending`
- `occ_health` now routes to `/surveillance`

### 3. Surveillance query hardening

The initial dashboard queries relied on relationship embedding from PostgREST.

Fix:

- [lib/surveillance/queries.ts](/Volumes/1tbusb/MedM8_WebApp/lib/surveillance/queries.ts:1) was refactored to fetch programs separately and attach them in application code

### 4. Safe date rendering

The surveillance UI could crash if a malformed timestamp or date reached `date-fns/format`.

Fix:

- added [lib/date-format.ts](/Volumes/1tbusb/MedM8_WebApp/lib/date-format.ts:1)
- updated surveillance pages/components to use safe date formatting fallbacks

### 5. Next.js `unstable_cache` and cookies bug

Authenticated surveillance pages were failing with:

- `Route /surveillance used "cookies" inside a function cached with "unstable_cache(...)"`.

Root cause:

- [lib/supabase/request-cache.ts](/Volumes/1tbusb/MedM8_WebApp/lib/supabase/request-cache.ts:1) used `unstable_cache()` around helpers that still created a cookie-backed Supabase client.

Fix:

- removed `unstable_cache()` from the request helpers
- retained safe request-scoped React `cache()` only

## Verification Completed

- local typecheck: `npx tsc --noEmit`
- iOS simulator compile: `xcodebuild` via XcodeBuildMCP for scheme `meddec`
- Vercel preview deployments used to validate routing and runtime behavior

## Known Follow-up Items

- add more complete admin flows for assigning occ health staff to sites if site scoping becomes mandatory for surveillance access
- decide whether surveillance staff should have a separate pending approval screen copy from medics
- add focused QA coverage for the occ health login and surveillance dashboard path
- add admin tooling to review/merge worker `Other` role suggestions into the canonical business role list
- decide whether workers should later see appointment history or only the next appointment
- consider a dedicated audit note for the privacy model and external-report handling

## Current Outcome

The occ health dashboard, unified staff signup, admin approval support, surveillance data foundation, worker operational role intake, and worker-facing next-appointment surfaces are now in place, and the preview-blocking runtime issues discovered during rollout have been addressed.
