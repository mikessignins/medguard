# Occ Health Module Change Tracker - 2026-04-18

## Scope

This note tracks the current occupational health / health surveillance module work in the MedGuard web app.

Canonical project references:

- Web app repo: `https://github.com/mikessignins/medguard`
- Local path: `/Volumes/1tbusb/MedM8_WebApp`
- Vercel production: `medguard-b9os3awg3-mikessignins-1387s-projects.vercel.app`
- Shared Supabase project: `gsejspyyidjifsgtfnhb.supabase.co`

## Completed In This Workstream

### Superuser Reporting

- Added dependent site filtering to the superuser workforce health reports.
- Selecting a business now updates the site list instead of leaving only `All sites`.
- Removed business-level reporting metrics/statistics from the superuser business administration view so reporting remains in the reporting tab.

### Occ Health Dashboard Shell

- Added the feedback button into the occ health dashboard layout.
- Updated feedback button styling support so dashboard-specific navigation/link classes can be passed in.
- Fixed queue and worker title colours so visited links do not become unreadable across dark and light themes.

### Staff Management Copy

- Updated admin staff management labels from `Add Contractor Medic` and `Add Contractor Occ Health` to `Add Medic` and `Add Occ Health`.
- Existing contractor/end-date behaviour remains unchanged.

### Occ Health Reports

- Added aggregate summary CSV export for surveillance reports.
- Added report breakdowns for:
  - Site compliance
  - Requirement workload
  - Provider workload
- Updated module catalogue metadata so health surveillance shows export capability.

### Notifications And Escalations

- Added escalation policy storage for:
  - Due-soon window
  - Occ health overdue escalation threshold
  - Supervisor overdue escalation threshold
  - Manager overdue escalation threshold
- Added tooltip help beside each escalation threshold.
- Extended notification generation to create operational escalation entries.
- Added a dedicated open escalation queue at `/surveillance/escalations`.
- Added acknowledgement flow for escalation notifications.
- Added dashboard and sidebar links into the escalation queue.
- Added notification log filtering, search, status/type filtering, and page-size selection.

### Worker Queue

- Added pagination and page-size control for the worker list.
- Simplified the worker queue page so it is no longer dominated by large queue tiles.
- Replaced large action queue cards with compact action buttons.
- Moved `Add worker` into a header button and modal.
- Moved `Bulk enrolment` into a header button and modal.
- Top-aligned modals so they remain visible even when the user has scrolled down the page.
- Added tooltips beside `Add worker` and `Bulk enrolment`.
- Added calmer visual treatments:
  - `Add worker`: emerald green
  - `Bulk enrolment`: teal green
- Reintroduced `Match to site role` in the add-worker modal with clearer helper text.
- Fixed the add-worker form layout so the site selector does not stretch taller than adjacent fields.
- Loaded worker role catalogue through a server-side service client, scoped to the authenticated business, so populated role catalogues appear reliably.

### Mineral Resources Role Catalogue

- Added 74 starter mine-site roles to business id `mineralresources`.
- These roles populate the `Match to site role` selector and support role-based bulk enrolment/reporting.
- Examples include:
  - Drill and Blast Operator
  - Shotfirer
  - Driller
  - Mobile Plant Operator
  - Loader Operator
  - Haul Truck Operator
  - Underground Operator
  - Maintenance Fitter
  - Boilermaker
  - Electrician
  - Tyre Fitter
  - Emergency Services Officer
  - Site Medic
  - HSE Advisor
  - Bus Driver
  - Security Officer

## Database / Migration Notes

Apply these health surveillance migrations in order if the target database has not already received them:

- `supabase/migrations/20260415090000_health_surveillance_foundation.sql`
- `supabase/migrations/20260415143000_worker_operational_roles_and_surveillance_intake.sql`
- `supabase/migrations/20260416083000_surveillance_worker_directory.sql`
- `supabase/migrations/20260416120000_occupational_health_wave1_scaffolding.sql`
- `supabase/migrations/20260416133000_surveillance_type_enrolment_rpc.sql`
- `supabase/migrations/20260416143000_surveillance_appointment_rpc_v2.sql`
- `supabase/migrations/20260416150000_surveillance_notifications_foundation.sql`
- `supabase/migrations/20260416162000_surveillance_phase2_operations_foundation.sql`
- `supabase/migrations/20260416173000_surveillance_phase2_management_rpcs.sql`
- `supabase/migrations/20260416190000_surveillance_provider_location_management_rpcs.sql`
- `supabase/migrations/20260418090000_surveillance_roster_anchor_dates.sql`
- `supabase/migrations/20260418091000_surveillance_roster_rpc_update.sql`
- `supabase/migrations/20260418113000_business_smtp_email_settings.sql`
- `supabase/migrations/20260418121000_surveillance_escalation_policy.sql`
- `supabase/migrations/20260418123000_surveillance_notification_acknowledgement.sql`

Important: when applying `20260418121000_surveillance_escalation_policy.sql` manually, run the entire file through the final `commit;`. The function bodies use unique dollar-quote tags to avoid unterminated `$function$` issues.

## Open Follow-Ups

### Feedback Entry Point

- Add `Send Feedback` to the occ health dashboard sidebar in the same pattern as the medic, admin, and superuser dashboards.
- The current occ health layout has feedback button support, but the sidebar placement should be reviewed against the other dashboard shells so it feels consistent.

### Instruction Manual / Help System

- Plan an in-dashboard instruction manual for Mine8 similar to the Modeus dashboard help pattern.
- Suggested coverage:
  - Admin dashboard guide
  - Medic dashboard guide
  - Occ health dashboard guide
  - Superuser guide
  - Worker/iOS guide, if needed later
- The manual should explain practical workflows rather than just list screens.
- Candidate occ health topics:
  - Worker intake
  - Matching worker roles
  - Bulk enrolment
  - Roster setup
  - Due-soon and overdue queues
  - Appointment scheduling
  - Escalation policy thresholds
  - Escalation acknowledgement
  - Reports and CSV export
  - Notification log filters

### Role Catalogue Mapping

- The role catalogue exists for Mineral Resources, but each role still needs mapping to surveillance requirements.
- This should become a guided configuration step so admins can decide which requirements apply to each role.

### UX Review Items

- Review mobile layout for the worker queue action row.
- Review modal close behaviour after form submission.
- Consider adding a role search/autocomplete if the role catalogue grows significantly.
- Consider server-side pagination for worker and notification lists once production volumes exceed the current client-side windows.

## Verification Completed

- `npx tsc --noEmit`
- `npm run lint`
- Localhost checks showed protected surveillance routes redirect unauthenticated users as expected.
