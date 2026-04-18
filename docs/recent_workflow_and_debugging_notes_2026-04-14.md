# Recent Workflow And Debugging Notes

Date: 2026-04-14

This note captures the recent MedGuard workflow hardening work, the bugs found during preview testing, and the fixes or migrations added to resolve them.

## Scope

Recent work focused on:

- moving MedGuard away from PHI retention and toward PHI transit
- replacing time-based export retention with explicit export confirmation
- making medic comments immutable and auditable
- aligning emergency, medication, and fatigue workflows
- improving preview/runtime debugging when DB or RPC mismatches occur

## High-Level Workflow Direction

Target lifecycle:

`submitted -> in review -> final outcome -> exported -> export confirmed -> PHI purged -> audit shell retained`

Key product intent:

- MedGuard should temporarily hold PHI for review and export only
- once export is confirmed by the medic, MedGuard should remove stored health information
- MedGuard should retain only an audit-safe trail after purge

## Main Workflow Changes

### 1. Export confirmation and PHI transit model

Implemented in the first export-confirmation slice:

- added export confirmation fields to supported records
- added transactional confirm-and-purge flow
- removed the old 7-day retention model from the medic experience
- changed cron-based purge behavior to be non-destructive
- updated dashboard and purge log visibility for exported-but-unconfirmed items

Primary migration:

- [20260413001000_export_confirmation_phi_transit.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260413001000_export_confirmation_phi_transit.sql:1)

Primary route:

- [app/api/exports/confirm-and-purge/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/exports/confirm-and-purge/route.ts:1)

Related UI:

- [components/medic/MedicExportsDashboard.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/MedicExportsDashboard.tsx:1)

### 2. Emergency declaration detail-page export confirmation

Emergency declaration detail pages were updated so that:

- after export, the medic gets a strong warning to make sure the PDF saved correctly
- returning to the list acts as export confirmation and triggers PHI removal
- if the PDF did not save, the medic can download again before leaving

Primary UI:

- [components/medic/SubmissionDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/SubmissionDetail.tsx:1)

### 3. Medication declaration MRO workflow

Medication declarations were extended to support:

- `Medical Officer Review` instead of the looser `Further Review`
- doctor name and practice capture
- final duties outcome gating
- export lockout until valid final state
- doctor/practice audit trail retention
- same export-confirm-return-to-list behavior as emergency declarations

Primary migration:

- [20260414083000_medication_mro_workflow.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414083000_medication_mro_workflow.sql:1)

Primary UI:

- [components/medic/MedDecDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/MedDecDetail.tsx:1)

### 4. Medication immutable comments

Medication declarations were updated to use append-only comment history instead of a mutable free-text review comment field.

Added:

- immutable medication comment table
- medication comment RPCs
- medication comments API
- medication PDF rendering from immutable comment history

Primary migration:

- [20260414103000_medication_declaration_immutable_comments.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414103000_medication_declaration_immutable_comments.sql:1)

Primary route:

- [app/api/medication-declarations/[id]/comments/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/medication-declarations/[id]/comments/route.ts:1)

### 5. Fatigue immutable comments and export confirmation

Fatigue assessments were updated to:

- remove the handover-notes box from the active medic workflow
- use immutable append-only comments
- show export warning after PDF generation
- confirm export and remove PHI when returning to the queue

Primary migration:

- [20260414123000_fatigue_immutable_comments.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414123000_fatigue_immutable_comments.sql:1)

Primary files:

- [components/medic/FatigueDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/FatigueDetail.tsx:1)
- [app/api/fatigue-assessments/[id]/comments/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/fatigue-assessments/[id]/comments/route.ts:1)

## Errors Found And Fixes

### Error: emergency approve/comment/in-review actions returned `Forbidden`

Observed behavior:

- medic could open the emergency form
- approve, requires follow-up, and comment all failed
- form stayed at the wrong UI state

Root cause:

- Postgres authorization SQL used the wrong site membership check:
  `site_id <> ANY(site_ids)`
- for medics with multiple sites, that incorrectly raised `Forbidden`

Fix:

- corrected SQL to use proper membership logic

Migration:

- [20260414070000_fix_multi_site_medic_rpc_scope.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414070000_fix_multi_site_medic_rpc_scope.sql:1)

### Error: preview DB/RPC mismatches were hidden behind generic UI messages

Observed behavior:

- several failures showed only `Something went wrong. Please try again.`

Fixes:

- expanded server-side error mapping
- adjusted preview diagnostics so DB/schema issues surface more clearly during debugging

Primary file:

- [lib/user-facing-errors.ts](/Volumes/1tbusb/MedM8_WebApp/lib/user-facing-errors.ts:1)

### Error: medication declarations exported while UI outcome looked saved but DB still said `In Review`

Observed behavior:

- medic selected outcome and MRO details
- export still failed with:
  `Medication declarations must be reviewed before they can be exported. Current status: In Review.`

Root cause:

- outcome selection was local UI state until explicit review save
- export gate checked the DB record, not the unsaved client state

Fix:

- medication export now persists review state first if there are unsaved review changes

Primary file:

- [components/medic/MedDecDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/MedDecDetail.tsx:1)

### Error: medication MRO details could not be corrected after final outcome

Observed behavior:

- doctor name/practice stayed editable in the UI
- saving corrections after final outcome failed
- generic error shown

Root cause:

- medication review logic treated final outcome as fully terminal
- backend and DB both blocked any later writes, even when only correcting doctor metadata

Fixes:

- allow corrections to doctor name/practice before export
- keep the final outcome itself locked
- clarify UI copy and button text

Migration:

- [20260414112000_allow_medication_mro_corrections_before_export.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414112000_allow_medication_mro_corrections_before_export.sql:1)

Related files:

- [components/medic/MedDecDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/MedDecDetail.tsx:1)
- [app/api/medication-declarations/[id]/review/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/medication-declarations/[id]/review/route.ts:1)

### Error: medication review save hit `null value in column "medic_comments"... violates not-null constraint`

Observed behavior:

- MRO correction path failed with a DB constraint error

Root cause:

- app and review function were writing `NULL` into the legacy `medic_comments` column
- that column is `NOT NULL`

Fixes:

- client now sends `''` instead of `null`
- review function now defensively coerces blank/null to empty string

Migration:

- [20260414114500_fix_medication_review_legacy_comment_not_null.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414114500_fix_medication_review_legacy_comment_not_null.sql:1)

### Error: medication toggle layout overflowed above the text

Observed behavior:

- MRO toggle visually floated too high / overlapped layout on narrower widths

Fix:

- constrained the text block and switch alignment in the medication outcome panel

Primary file:

- [components/medic/MedDecDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/MedDecDetail.tsx:1)

### Error: fatigue save failed with generic message, later exposed as `operator does not exist: uuid = text`

Observed behavior:

- fatigue review save returned generic failure
- diagnostic pass later exposed:
  `operator does not exist: uuid = text`

Root cause:

- fatigue/module review path could fall into the older 3-argument `review_module_submission(...)`
- that older function compares `module_submissions.id` to a text parameter incorrectly in this environment

Fix:

- fatigue flow now prefers the UUID-safe 6-argument module review RPC first
- only falls back to the older RPC if the newer function is actually missing
- fatigue status values are normalized so both old and new module-review status vocabularies work in the UI

Primary files:

- [app/api/fatigue-assessments/[id]/review/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/fatigue-assessments/[id]/review/route.ts:1)
- [app/medic/fatigue/[id]/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/medic/fatigue/[id]/page.tsx:1)
- [app/api/fatigue-assessments/[id]/pdf/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/fatigue-assessments/[id]/pdf/route.ts:1)

## Current Important Migrations

These migrations are especially important for the recent workflow changes:

- [20260413001000_export_confirmation_phi_transit.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260413001000_export_confirmation_phi_transit.sql:1)
- [20260414070000_fix_multi_site_medic_rpc_scope.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414070000_fix_multi_site_medic_rpc_scope.sql:1)
- [20260414083000_medication_mro_workflow.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414083000_medication_mro_workflow.sql:1)
- [20260414103000_medication_declaration_immutable_comments.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414103000_medication_declaration_immutable_comments.sql:1)
- [20260414112000_allow_medication_mro_corrections_before_export.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414112000_allow_medication_mro_corrections_before_export.sql:1)
- [20260414114500_fix_medication_review_legacy_comment_not_null.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414114500_fix_medication_review_legacy_comment_not_null.sql:1)
- [20260414123000_fatigue_immutable_comments.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260414123000_fatigue_immutable_comments.sql:1)

## Files Most Touched In This Phase

- [components/medic/SubmissionDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/SubmissionDetail.tsx:1)
- [components/medic/MedDecDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/MedDecDetail.tsx:1)
- [components/medic/FatigueDetail.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/FatigueDetail.tsx:1)
- [components/medic/MedicExportsDashboard.tsx](/Volumes/1tbusb/MedM8_WebApp/components/medic/MedicExportsDashboard.tsx:1)
- [app/api/exports/confirm-and-purge/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/exports/confirm-and-purge/route.ts:1)
- [app/api/medication-declarations/[id]/review/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/medication-declarations/[id]/review/route.ts:1)
- [app/api/medication-declarations/[id]/comments/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/medication-declarations/[id]/comments/route.ts:1)
- [app/api/fatigue-assessments/[id]/review/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/fatigue-assessments/[id]/review/route.ts:1)
- [app/api/fatigue-assessments/[id]/comments/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/fatigue-assessments/[id]/comments/route.ts:1)
- [app/api/fatigue-assessments/[id]/pdf/route.ts](/Volumes/1tbusb/MedM8_WebApp/app/api/fatigue-assessments/[id]/pdf/route.ts:1)
- [lib/purge-guards.ts](/Volumes/1tbusb/MedM8_WebApp/lib/purge-guards.ts:1)
- [lib/user-facing-errors.ts](/Volumes/1tbusb/MedM8_WebApp/lib/user-facing-errors.ts:1)

## Remaining Follow-Up Items

- fatigue preview flow should be re-tested after the latest RPC compatibility change
- psychosocial forms still need to be aligned to the same immutable-comment / export-confirm pattern if full consistency is desired
- immutable medic comments can still contain PHI by user input, so policy and product decisions may still be needed around what should remain in post-purge audit trails
