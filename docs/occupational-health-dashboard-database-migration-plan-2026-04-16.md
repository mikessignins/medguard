# Occupational Health Dashboard Database Migration Plan

Date: 2026-04-16
Repo: `/Volumes/1tbusb/MedM8_WebApp`
Related:

- [occupational-health-dashboard-platform-plan-2026-04-16.md](/Volumes/1tbusb/MedM8_WebApp/docs/occupational-health-dashboard-platform-plan-2026-04-16.md:1)
- [health-surveillance-implementation-tracker-2026-04-15.md](/Volumes/1tbusb/MedM8_WebApp/docs/health-surveillance-implementation-tracker-2026-04-15.md:1)
- [20260415090000_health_surveillance_foundation.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260415090000_health_surveillance_foundation.sql:1)
- [20260416083000_surveillance_worker_directory.sql](/Volumes/1tbusb/MedM8_WebApp/supabase/migrations/20260416083000_surveillance_worker_directory.sql:1)

## Purpose

This document describes how to evolve the current surveillance schema into a rules-driven occupational health platform without breaking the existing dashboard or worker app contracts.

## Current Database Baseline

Current surveillance tables:

- `surveillance_workers`
- `surveillance_programs`
- `surveillance_enrolments`
- `surveillance_appointments`
- `surveillance_outcomes_minimal`
- `surveillance_audit_events`

Current strengths:

- clean privacy boundary
- business scoping
- RLS foundation
- worker directory supports both app and manual workers
- appointments and outcomes are already separated

Current constraints:

- `surveillance_programs` is too broad for type-level surveillance logic
- enrolments do not carry baseline or assignment-source detail
- appointments lack structured reason codes and provider context
- notifications/escalations are not modeled
- role, SEG, hazard, roster, and contractor context are only partially represented or absent

## Migration Strategy

Approach:

- additive migrations first
- compatibility views or query adapters where needed
- backfill in place
- only deprecate old fields after web and iOS consumers are switched

Guiding rule:

- preserve current worker and appointment flows while progressively moving queries toward richer assignment and rule tables

## Target Schema Layers

### Layer 1: Worker and Organisation Context

New or expanded data needed:

- worker employment context
- contractor context
- jurisdiction and site context
- role, workgroup, SEG, hazard, and exposure classification

Recommended changes:

- extend `surveillance_workers`
- add worker exposure and roster support as separate tables

### Layer 2: Surveillance Rules and Assignments

New data needed:

- surveillance type catalogue
- assignment rules
- frequency rules
- worker-specific assignment overrides

Recommended direction:

- retain `surveillance_enrolments` as the worker assignment record
- introduce discrete surveillance type entities rather than overloading `surveillance_programs`

### Layer 3: Operational Workflow

New data needed:

- notifications
- providers
- reason codes
- mobilisation and transfer review queues
- corrective actions

## Proposed Migration Phases

### Phase A: Add New Reference Tables

Goal:

- create the minimum configuration model for surveillance precision

Recommended migration files:

- `20260417xxxxxx_surveillance_types_and_rules.sql`
- `20260417xxxxxx_surveillance_reason_codes_and_providers.sql`

Proposed new tables:

- `surveillance_types`
- `surveillance_type_frequency_rules`
- `surveillance_assignment_rules`
- `surveillance_reason_codes`
- `surveillance_providers`
- `surveillance_provider_locations`

Suggested table sketches:

#### `surveillance_types`

Core fields:

- `id uuid primary key`
- `business_id text not null`
- `code text not null`
- `name text not null`
- `description text null`
- `default_interval_days integer not null`
- `baseline_interval_days integer null`
- `is_active boolean not null default true`
- `created_at timestamptz`
- `updated_at timestamptz`

Notes:

- business-scoped for flexibility
- can also support a shared seed strategy if later required

#### `surveillance_type_frequency_rules`

Core fields:

- `id uuid primary key`
- `business_id text not null`
- `surveillance_type_id uuid not null`
- `site_id text null`
- `worker_role_id uuid null`
- `seg_id uuid null`
- `hazard_code text null`
- `baseline_interval_days integer null`
- `recurring_interval_days integer not null`
- `priority integer not null default 100`
- `is_active boolean not null default true`
- `created_by uuid not null`
- `updated_by uuid null`
- `created_at timestamptz`
- `updated_at timestamptz`

Notes:

- highest-priority matching rule wins

#### `surveillance_assignment_rules`

Core fields:

- `id uuid primary key`
- `business_id text not null`
- `surveillance_type_id uuid not null`
- `site_id text null`
- `worker_role_id uuid null`
- `seg_id uuid null`
- `hazard_code text null`
- `exposure_level_category text null`
- `baseline_required boolean not null default true`
- `is_active boolean not null default true`
- `created_by uuid not null`
- `updated_at timestamptz`

Notes:

- this table decides who should be assigned
- frequency stays in the frequency-rule table

#### `surveillance_reason_codes`

Core fields:

- `id uuid primary key`
- `business_id text not null`
- `category text not null`
- `code text not null`
- `label text not null`
- `is_active boolean not null default true`

Recommended categories:

- `cancelled`
- `rescheduled`
- `did_not_attend`
- `review_required`

#### `surveillance_providers`

Core fields:

- `id uuid primary key`
- `business_id text not null`
- `name text not null`
- `provider_type text null`
- `contact_email text null`
- `contact_phone text null`
- `is_active boolean not null default true`
- `created_at timestamptz`
- `updated_at timestamptz`

#### `surveillance_provider_locations`

Core fields:

- `id uuid primary key`
- `provider_id uuid not null`
- `site_id text null`
- `location_name text not null`
- `address_text text null`
- `supports_remote boolean not null default false`
- `capacity_notes text null`
- `is_active boolean not null default true`

### Phase B: Extend Current Core Tables

Goal:

- enrich existing operational tables so current screens can evolve without replacement

Recommended migration file:

- `20260418xxxxxx_surveillance_core_table_expansion.sql`

#### Extend `surveillance_workers`

Add fields:

- `employee_number text null`
- `employment_type text null`
- `employing_entity text null`
- `contractor_company_name text null`
- `engagement_status text null`
- `mobilisation_date date null`
- `demobilisation_date date null`
- `department text null`
- `business_unit text null`
- `workgroup_name text null`
- `operational_area text null`
- `jurisdiction_code text null`

Notes:

- keep free-text additions constrained and eventually normalize the highest-value ones

#### Extend `surveillance_enrolments`

Recommended conceptual rename:

- keep physical table name for compatibility now
- treat it as the worker surveillance assignment table in code and docs

Add fields:

- `surveillance_type_id uuid null`
- `assignment_source text null`
- `baseline_required boolean not null default false`
- `baseline_completed_at timestamptz null`
- `frequency_override_days integer null`
- `review_required boolean not null default false`
- `review_reason_code_id uuid null`
- `deactivated_at timestamptz null`
- `deactivated_reason_code_id uuid null`

Backfill plan:

- map current `program_id` to seeded `surveillance_type_id` where possible
- default `assignment_source` to `legacy_manual`

#### Extend `surveillance_appointments`

Add fields:

- `provider_id uuid null`
- `provider_location_id uuid null`
- `status_reason_code_id uuid null`
- `confirmed_by_worker_at timestamptz null`
- `provider_acknowledged_at timestamptz null`
- `appointment_window_start timestamptz null`
- `appointment_window_end timestamptz null`
- `rescheduled_from_appointment_id uuid null`

Status recommendation:

- keep existing enum initially
- translate UI labels so `confirmed` becomes `confirmed_by_worker`
- if enum change is required later, do it only after app and web clients are updated

#### Extend `surveillance_outcomes_minimal`

Add fields:

- `outcome_received_at timestamptz null`
- `outcome_communicated_at timestamptz null`
- `corrective_action_required boolean not null default false`
- `corrective_action_ref text null`

Notes:

- do not add fields for diagnosis, measurements, or provider narrative

#### Extend `surveillance_audit_events`

Add fields if not already present:

- `entity_type text null`
- `entity_id uuid null`
- `previous_value jsonb null`
- `new_value jsonb null`
- `reason_code text null`
- `comment_text text null`

Notes:

- use `jsonb` for before/after payloads to avoid a migration every time the tracked entity shape changes

### Phase C: Add Exposure and Roster Tables

Goal:

- support bulk enrolment and scheduling realism

Recommended migration files:

- `20260419xxxxxx_surveillance_exposure_model.sql`
- `20260419xxxxxx_surveillance_roster_model.sql`

Proposed new tables:

- `surveillance_segs`
- `surveillance_hazards`
- `surveillance_worker_exposure_assignments`
- `surveillance_worker_role_history`
- `surveillance_worker_rosters`
- `surveillance_worker_availability_exceptions`

#### `surveillance_segs`

Fields:

- `id uuid primary key`
- `business_id text not null`
- `code text not null`
- `name text not null`
- `description text null`
- `is_active boolean not null default true`

#### `surveillance_hazards`

Fields:

- `id uuid primary key`
- `business_id text not null`
- `code text not null`
- `name text not null`
- `category text null`
- `is_active boolean not null default true`

#### `surveillance_worker_exposure_assignments`

Fields:

- `id uuid primary key`
- `business_id text not null`
- `surveillance_worker_id uuid not null`
- `worker_role_id uuid null`
- `seg_id uuid null`
- `hazard_id uuid null`
- `site_id text null`
- `exposure_level_category text null`
- `effective_from date not null`
- `effective_to date null`
- `assigned_by uuid not null`
- `created_at timestamptz`

Notes:

- one worker can have multiple hazard assignments
- historical rows enable role and exposure change review

#### `surveillance_worker_rosters`

Fields:

- `id uuid primary key`
- `business_id text not null`
- `surveillance_worker_id uuid not null`
- `roster_pattern text not null`
- `shift_type text null`
- `current_swing_start date null`
- `current_swing_end date null`
- `source_system text null`
- `source_ref text null`
- `updated_at timestamptz`

#### `surveillance_worker_availability_exceptions`

Fields:

- `id uuid primary key`
- `business_id text not null`
- `surveillance_worker_id uuid not null`
- `exception_type text not null`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `notes_operational text null`

Recommended exception types:

- `leave`
- `training`
- `restricted_duties`
- `off_site`
- `other`

### Phase D: Add Notifications and Corrective Actions

Goal:

- support reminders, escalations, and action tracking

Recommended migration files:

- `20260420xxxxxx_surveillance_notifications.sql`
- `20260420xxxxxx_surveillance_corrective_actions.sql`

Proposed new tables:

- `surveillance_notifications`
- `surveillance_notification_recipients`
- `surveillance_corrective_actions`

#### `surveillance_notifications`

Fields:

- `id uuid primary key`
- `business_id text not null`
- `surveillance_worker_id uuid not null`
- `appointment_id uuid null`
- `enrolment_id uuid null`
- `notification_type text not null`
- `delivery_channel text not null`
- `scheduled_for timestamptz not null`
- `sent_at timestamptz null`
- `delivery_status text not null default 'pending'`
- `template_version text null`
- `created_at timestamptz`

Recommended notification types:

- `due_30_day`
- `due_14_day`
- `due_7_day`
- `day_of`
- `overdue_worker`
- `overdue_supervisor`
- `overdue_manager`

#### `surveillance_notification_recipients`

Fields:

- `id uuid primary key`
- `notification_id uuid not null`
- `target_user_id uuid null`
- `target_role text null`
- `delivery_address text null`
- `acknowledged_at timestamptz null`

Notes:

- supports both direct and role-based routing

#### `surveillance_corrective_actions`

Fields:

- `id uuid primary key`
- `business_id text not null`
- `surveillance_worker_id uuid not null`
- `outcome_id uuid null`
- `external_reference text null`
- `owner_user_id uuid null`
- `status text not null`
- `due_at timestamptz null`
- `completed_at timestamptz null`
- `created_by uuid not null`
- `created_at timestamptz`

Recommended statuses:

- `open`
- `in_progress`
- `completed`
- `overdue`
- `cancelled`

## Compatibility Plan

### 1. Keep `surveillance_programs` During Transition

Short-term approach:

- continue supporting current screens that expect programs
- seed `surveillance_types` with a mapped representation of current programs
- add join logic in server code so old pages still render meaningful names

Long-term approach:

- shift web and iOS to surveillance type terminology
- eventually deprecate program-only flows

### 2. Keep `surveillance_enrolments` Table Name

Reason:

- existing queries, APIs, and types already depend on it

Approach:

- expand the table and update code semantics first
- only consider physical rename if the repo later standardizes on assignment terminology everywhere

### 3. Preserve Existing Worker Endpoint Contracts

Current contract:

- worker app reads next surveillance appointment

Approach:

- keep current RPC/API working
- later add a richer endpoint for worker surveillance summary

## Backfill Plan

### Backfill 1: Seed surveillance types from current programs

Mapping suggestion:

- `respiratory` -> `spirometry`
- `hearing` -> `audiometry`
- `chemical` -> `biological_monitoring`
- `dust` -> `spirometry`
- `general` -> `general_surveillance_review`
- `other` -> `other_surveillance`

Note:

- this is a transitional mapping only
- final type assignment should be reviewed by occ health

### Backfill 2: Copy program interval into type default interval

- set `default_interval_days` from `surveillance_programs.interval_days`

### Backfill 3: Populate assignment metadata defaults

- `baseline_required = false`
- `assignment_source = 'legacy_manual'`

### Backfill 4: Infer provider and reason codes only where safe

- do not guess provider information where not explicitly stored
- reason codes should remain null for legacy records if no reliable mapping exists

## RLS and Security Plan

For every new table:

- enable RLS at creation time
- grant write access only to `occ_health`, scoped admins, and specific service roles where needed
- restrict worker access to their own summary-facing records only
- keep supervisor access at a reporting/compliance level rather than raw operational administration unless explicitly required

Recommended new policies:

- workers can read only their own active assignments and their own upcoming appointments
- occ health can manage all surveillance records for their business
- admins can read compliance rollups and manage provider/config records where appropriate
- contractor representatives, if added later, must be scoped by employer relationship

## Query and Performance Considerations

Add indexes for expected query patterns:

- `surveillance_enrolments (business_id, surveillance_type_id, next_due_at)`
- `surveillance_enrolments (business_id, baseline_required, baseline_completed_at)`
- `surveillance_appointments (business_id, provider_id, scheduled_at)`
- `surveillance_notifications (business_id, delivery_status, scheduled_for)`
- `surveillance_worker_exposure_assignments (business_id, seg_id, site_id, effective_to)`
- `surveillance_worker_rosters (surveillance_worker_id, current_swing_start, current_swing_end)`

Consider materialized or RPC-backed rollups for:

- compliance dashboard aggregates
- 30/60/90 day workload forecasting
- overdue trend reporting

## Suggested Migration Order

Recommended execution order:

1. add surveillance types, rules, reason codes, and providers
2. extend current core tables
3. backfill type and assignment defaults
4. update server queries and actions to read new fields
5. add exposure and roster tables
6. add notifications and corrective actions
7. switch dashboard and app flows to the richer model
8. deprecate old program-only assumptions

## Rollout Guardrails

Before each production rollout:

- run migration on staging with representative legacy surveillance data
- validate RLS with occ health, worker, and admin accounts
- test worker next-appointment API compatibility
- verify dashboard queries still render for businesses with only old data
- confirm no new field can store clinical detail beyond approved administrative metadata

## Recommendation

The safest path is additive evolution. The existing surveillance schema is already a workable administrative core. The migration plan should preserve that core while adding:

- surveillance type precision
- configurable rules
- exposure context
- operational notifications
- provider and roster support
- stronger audit and reporting structures

That sequence keeps delivery practical and avoids a risky rewrite of the current web and iOS surveillance flows.
