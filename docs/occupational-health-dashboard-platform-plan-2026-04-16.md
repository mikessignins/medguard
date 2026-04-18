# Occupational Health Dashboard Platform Plan

Date: 2026-04-16
Repo: `/Volumes/1tbusb/MedM8_WebApp`
Reference: [health-surveillance-implementation-tracker-2026-04-15.md](/Volumes/1tbusb/MedM8_WebApp/docs/health-surveillance-implementation-tracker-2026-04-15.md:1)

## Summary

This document translates the existing Health Surveillance module foundation into a broader occupational health dashboard platform roadmap for mining and remote operations.

It assumes the current MedM8 position remains unchanged:

- the platform stores operational, scheduling, enrolment, compliance, and workflow metadata only
- the platform does not store clinical measurements, diagnoses, reports, attachments, or provider notes
- clinical records remain in the occupational health provider or physician system of record

For planning purposes, references to `.pdf` files starting with `MRL` have been excluded. The plan below instead uses the already-implemented MedM8 surveillance foundation as the delivery baseline.

## Current Foundation In Repo

Already implemented:

- dedicated `health_surveillance` module enablement
- dedicated `occ_health` and `pending_occ_health` roles
- surveillance dashboard at `/surveillance`
- worker directory for both app-linked workers and manual-entry workers
- surveillance programs, enrolments, appointments, minimal outcomes, and audit events
- worker-facing next-appointment support for the iOS app
- operational worker role intake and self-declared surveillance flag

Current limitations in the foundation:

- surveillance programs are broad and low-granularity (`general`, `respiratory`, `hearing`, `chemical`, `dust`, `other`)
- one default interval per program only
- dashboard metrics are counts rather than full compliance segmentation
- reminder and escalation workflows are not yet modeled
- appointment status tracking is present but not yet expanded into reminder, DNA trend, provider acknowledgement, or escalation management
- self-declaration exists, but exposure-driven and bulk enrolment logic does not
- roster, site transfer, mobilisation, contractor visibility, and offline workflows are not yet modeled end-to-end

## Product Direction

The occupational health dashboard should evolve into an administrative compliance platform that answers five core questions:

1. Who should be enrolled in surveillance, and why?
2. Which surveillance types apply to each worker, and how often?
3. Which appointments are due, approaching, overdue, or completed?
4. Which operational follow-ups, escalations, or corrective actions are still open?
5. How can site, corporate, and contractor stakeholders see only the minimum information appropriate to their role?

## Delivery Principles

- Preserve the current privacy boundary: administrative metadata only.
- Prefer coded administrative states over free text wherever possible.
- Make exposure and workgroup rules the primary enrolment driver, with worker self-declaration retained as a secondary signal.
- Keep supervisor and management access narrower than occupational health access.
- Design for multi-site, FIFO, contractor, and intermittent-connectivity conditions from the start.
- Extend the current surveillance schema rather than replacing it.

## Recommended Delivery Tiers

### Tier 1: Essential Enhancements

These features should be treated as the core occupational health release.

#### 1. Surveillance Type and Frequency Engine

Goal:

- replace coarse program assignment with configurable surveillance-type rules tied to role, workgroup, SEG, hazard exposure, and site context

Recommended additions:

- add a surveillance type catalogue with mining-relevant codes:
  - `spirometry`
  - `audiometry`
  - `biological_monitoring`
  - `musculoskeletal_screening`
  - `skin_surveillance`
  - `vision_screening`
  - `radiation_health_monitoring`
- support default recurrence rules per surveillance type
- allow occupational health override per worker enrolment
- calculate due dates from actual completion date, not just enrolment date
- allow baseline vs recurring cycle logic

Implementation note:

- the existing `surveillance_programs.interval_days` model should become a richer rules layer rather than the sole scheduling source

#### 2. Compliance Status Dashboard

Goal:

- give occ health and management a real-time traffic-light view of compliance across the workforce

Recommended status model:

- `green`: all assigned surveillance types current
- `amber`: one or more assigned surveillance types due within threshold
- `red`: one or more assigned surveillance types overdue
- `grey`: enrolled but baseline not yet complete

Required dashboard capabilities:

- worker-level compliance rollup
- aggregate compliance percentage
- filters for site, project, department, workgroup, SEG, hazard, surveillance type, provider, contractor company, and roster pattern
- site dashboard and corporate rollup views

Implementation note:

- this should be derived from worker enrolment + baseline state + next due date + overdue threshold, not stored as manual status

#### 3. Automated Reminder and Escalation Notifications

Goal:

- automate the worker and management follow-up path so compliance does not depend on manual chasing

Required support:

- worker reminders at configurable intervals before due date
- day-of reminders
- overdue worker reminders
- supervisor and occ health coordinator notifications when overdue
- escalation to Safety Manager and Site/Project Manager after threshold breach
- notification history and delivery outcome logging

Implementation note:

- notifications should be configuration-driven by business/site, not hard-coded
- worker delivery should support iOS push first, with email/SMS extensibility if added later

#### 4. Appointment Outcome Tracking

Goal:

- track administrative completion without storing health information

Required status coverage:

- `scheduled`
- `confirmed_by_worker`
- `attended_completed`
- `rescheduled`
- `did_not_attend`
- `cancelled`

Required supporting fields:

- reason code for reschedule/cancel/DNA
- completion confirmed by
- actual completion date
- provider acknowledgement flag
- notification history per appointment

Implementation note:

- the current appointment status enum is close, but needs separate reason-code support and stronger operational auditability

#### 5. Workgroup and Exposure-Based Enrolment

Goal:

- make enrolment driven by exposure assessment and work assignment, not only self-selection

Required support:

- bulk enrolment by SEG
- bulk enrolment by role code
- bulk enrolment by site or operational area
- suggested enrolment from worker self-declaration
- review queue for unresolved worker-role mappings

Implementation note:

- worker self-selection should remain useful, but should never be the only path into surveillance

### Tier 2: High-Value Additions

#### 6. Roster and Swing Pattern Integration

Goal:

- schedule only when the worker can realistically attend

Required support:

- roster pattern storage
- current swing window data
- shift type handling
- leave and restricted availability flags
- eventual API integration with an external roster source if available

#### 7. Audit Trail and Change Log

Goal:

- make every operational action defensible for internal and regulatory audit

Required support:

- who enrolled or de-enrolled a worker
- who changed a surveillance requirement or frequency
- who created, modified, cancelled, or closed an appointment
- who acknowledged an alert
- previous and new values for significant edits

Implementation note:

- the current `surveillance_audit_events` table is the right base and should be expanded, not replaced

#### 8. Reporting and Analytics

Goal:

- support monthly management reporting, trend analysis, and workload forecasting

Required reports:

- compliance by site, workgroup, SEG, surveillance type, provider, and contractor
- overdue trend over time
- completion rate and DNA rate
- 30/60/90 day demand forecast
- new-starter baseline gap report
- separation and exit-surveillance gap report

#### 9. Provider and Clinic Management

Goal:

- model the operational side of external occupational health providers

Required support:

- approved provider/clinic register
- provider-site mapping
- provider capacity or availability notes
- appointment assignment to provider
- provider completion acknowledgement without clinical content

#### 10. New Starter and Mobilisation Workflow

Goal:

- ensure baseline surveillance is not missed during mobilisation

Required support:

- mobilisation trigger
- automatic baseline-required status
- task queue for occ health scheduling
- compliance status locked at `grey` until baseline completion

#### 11. Role Change and Transfer Triggers

Goal:

- force reassessment when exposures change

Required support:

- role change history
- site transfer history
- exposure review queue
- add/remove surveillance types based on new assignment

### Tier 3: Advanced and Differentiating Features

#### 12. Occupational Hygiene Integration

- ingest workgroup exposure changes from hygiene systems
- trigger surveillance review when exposure category changes
- keep the feed one-way and administrative

#### 13. Corrective Action Tracking

- record that a corrective action is required without storing why
- assign owner, due date, and status
- optionally link to external action systems

#### 14. Contractor and Third-Party Visibility

- allow contractor workers to exist in the same surveillance model
- provide limited access for contractor representatives
- preserve stronger visibility for principal business occ health staff

#### 15. Exit and Cessation-of-Exposure Tracking

- trigger on separation, demobilisation, or exposure cessation
- record exit surveillance offered/completed
- preserve long-term administrative retention

#### 16. Document Acknowledgement

- distribute information sheets, privacy notices, and consent/acknowledgement forms
- capture digital acknowledgement in the worker app

#### 17. Multi-Site and Multi-Project Visibility

- support corporate-level and site-level dashboards
- allow worker compliance continuity across site transfers

#### 18. Offline iOS Support

- cache upcoming appointments and current compliance summary
- queue confirmations and acknowledgements for later sync

## Recommended Domain Model Expansion

The current schema is a strong base, but it needs a more explicit occupational health data model.

### A. Worker Identity and Employment Context

Extend `surveillance_workers` or add a linked worker-context table for:

- `employee_number`
- `employment_type`
- `employing_entity`
- `contractor_company_name`
- `engagement_status`
- `mobilisation_date`
- `demobilisation_date`
- `jurisdiction_code`

Rationale:

- supports contractor handling, onboarding triggers, exit workflows, and multi-entity reporting

### B. Role, Workgroup, and Exposure Context

Add a worker exposure-assignment layer:

- `current_role_title`
- `job_code`
- `department`
- `business_unit`
- `workgroup`
- `seg_id`
- `operational_area`
- `primary_hazard_codes[]`
- `exposure_level_category`
- `hhmp_reference`

Recommended new tables:

- `surveillance_segs`
- `surveillance_hazard_catalog`
- `surveillance_worker_exposure_assignments`
- `surveillance_worker_role_history`

Rationale:

- separates operational identity from exposure logic and makes bulk enrolment rules possible

### C. Surveillance Type Catalogue and Rules

Replace the current coarse program model with a layered configuration model:

- `surveillance_types`
- `surveillance_type_frequency_rules`
- `surveillance_assignment_rules`

Recommended table responsibilities:

- `surveillance_types`: master list of supported surveillance types
- `surveillance_type_frequency_rules`: default recurrence by site, SEG, role, or hazard
- `surveillance_assignment_rules`: determine when a worker should be auto-assigned a surveillance type

Rationale:

- supports site variation, hygiene-led rules, and clinical override without changing code each time

### D. Worker Surveillance Assignments

Evolve `surveillance_enrolments` into worker-surveillance assignments with richer lifecycle data:

- `surveillance_type_id`
- `assignment_source`
- `baseline_required`
- `baseline_completed_at`
- `frequency_override_days`
- `review_required`
- `review_reason_code`
- `compliance_status_derived`

Rationale:

- the current enrolment record can become the primary worker-to-surveillance relationship with additional operational metadata

### E. Appointment and Reminder Model

Extend `surveillance_appointments` and add notification support:

- `provider_id`
- `provider_location_id`
- `status_reason_code`
- `confirmed_by_worker_at`
- `provider_acknowledged_at`
- `rescheduled_from_appointment_id`
- `appointment_window_start`
- `appointment_window_end`

Recommended new table:

- `surveillance_notifications`

Suggested notification fields:

- `notification_type`
- `target_role`
- `delivery_channel`
- `scheduled_for`
- `sent_at`
- `delivery_status`
- `template_version`

Rationale:

- separates reminder orchestration from appointment lifecycle and makes escalation auditable

### F. Corrective Actions and Outcome Workflow

Retain minimal, non-clinical administrative state:

- `outcome_received_at`
- `outcome_communicated_at`
- `corrective_action_required`
- `corrective_action_ref`
- `corrective_action_status`
- `corrective_action_owner_user_id`

Recommended new table:

- `surveillance_corrective_actions`

Rationale:

- supports action tracking without capturing diagnosis or treatment information

### G. Provider and Organisation Layer

Recommended new tables:

- `surveillance_providers`
- `surveillance_provider_locations`
- `surveillance_provider_site_mappings`

Rationale:

- enables clinic assignment, remote provider management, and capacity planning

### H. Roster and Availability Layer

Recommended new tables:

- `surveillance_worker_rosters`
- `surveillance_worker_availability_exceptions`

Rationale:

- supports FIFO scheduling logic and future roster integrations

## Suggested Capability Mapping To Existing Tables

Current table to future role mapping:

- `surveillance_workers`
  - remains the worker directory anchor
  - gains employment and contractor context
- `surveillance_programs`
  - should be repurposed or superseded by `surveillance_types`
  - do not keep adding broad codes here if the platform is moving to surveillance-type precision
- `surveillance_enrolments`
  - becomes the worker surveillance assignment record
- `surveillance_appointments`
  - remains the operational appointment record
- `surveillance_outcomes_minimal`
  - remains a minimal outcome/event record, potentially split if corrective actions need their own lifecycle
- `surveillance_audit_events`
  - remains the central audit ledger, expanded for richer event payloads

## Recommended Access Model

The access model should stay stricter than the operational data model.

### Occupational Health Team

Can:

- create and manage worker surveillance assignments
- view all appointment details
- manage reminders, escalations, providers, and corrective actions

### Supervisors

Can:

- see worker compliance state
- see overdue/escalation status
- see whether an appointment action is outstanding

Cannot:

- see detailed appointment notes
- see provider operational notes beyond the minimum needed to coordinate attendance

### Workers

Can:

- see only their own assigned surveillance types
- see appointment date, location, instructions, and compliance summary
- confirm or acknowledge appointments

### Corporate / Safety / Site Management

Can:

- see aggregated compliance, trends, and escalations
- drill into operational exceptions where needed

Should not:

- receive any clinical detail

### Contractor Representatives

Can:

- see only workers from their organisation
- see limited compliance and scheduling status

## Recommended Phased Roadmap

### Phase 1: Compliance Core

Target outcome:

- move from a simple surveillance tracker to a true occupational health compliance engine

Scope:

- surveillance type catalogue
- assignment rules and frequency engine
- traffic-light compliance dashboard
- richer appointment status model
- notification engine
- reminder and escalation audit log
- baseline compliance logic

Primary deliverables:

- new schema migrations for surveillance types, rules, assignments, and notifications
- dashboard redesign for worker compliance segmentation
- worker app reminder and confirmation support

### Phase 2: Operational Fit For Mining Workflows

Target outcome:

- make scheduling workable for FIFO, multi-site, new-starter, and transfer scenarios

Scope:

- roster and swing support
- provider management
- mobilisation workflow
- role change and transfer triggers
- new-starter baseline gap reporting
- richer audit trail payloads

### Phase 3: Governance, Reporting, and Corporate Visibility

Target outcome:

- improve management reporting and regulatory defensibility

Scope:

- analytics/report exports
- contractor visibility model
- corporate super dashboard
- corrective action tracking
- exit surveillance workflow

### Phase 4: Integration and Differentiation

Target outcome:

- connect the platform to adjacent operational systems while preserving privacy boundaries

Scope:

- hygiene data feed
- external roster integration
- optional external action-system linkage
- offline iOS sync improvements
- document acknowledgement workflows

## Suggested Backlog Structure

### Epic 1: Surveillance Rules Engine

- design surveillance type catalogue
- model assignment rules by role, SEG, site, and hazard
- support worker-specific frequency overrides
- implement due-date calculator service

### Epic 2: Compliance Dashboard

- define derived compliance status rules
- build worker-level and aggregate compliance queries
- add site/workgroup/SEG/type filters
- add corporate rollup cards and trend views

### Epic 3: Notifications and Escalations

- create notification queue and log tables
- build reminder schedule generation
- add escalation chains by role and site
- expose worker push confirmation flows in iOS

### Epic 4: Enrolment and Exposure Assignment

- add SEG, hazard, and role metadata model
- build bulk enrolment tools
- surface self-declared workers as review candidates
- add role-transfer reassessment workflow

### Epic 5: Appointment Operations

- add reason-code catalogue
- add provider and clinic assignment
- add provider acknowledgement state
- track DNA and reschedule trends

### Epic 6: Reporting and Audit

- expand audit event schema and payload standards
- create compliance and workload reports
- add CSV/PDF export paths
- define retention and archival rules for admin records

## Delivery Risks and Design Decisions

### 1. Avoid Mixing Clinical and Administrative State

Risk:

- outcome workflows can accidentally drift into storing health information

Decision:

- keep only coded administrative flags and external references
- never store report content, measurements, diagnoses, or clinical free text

### 2. Avoid Hard-Coding Mining Logic Into UI Components

Risk:

- surveillance rules will vary by site, business, hazard, and regulator

Decision:

- put surveillance assignment and recurrence logic into configuration-backed tables and server-side services

### 3. Preserve Backward Compatibility With Current Foundation

Risk:

- replacing current tables outright would disrupt the existing dashboard and iOS contract

Decision:

- evolve `surveillance_enrolments`, `surveillance_appointments`, and `surveillance_audit_events`
- migrate toward richer models behind stable APIs

### 4. Keep Supervisor Visibility Narrow

Risk:

- operational managers may be given more detail than necessary

Decision:

- define compliance-only views for supervisor roles and keep detailed appointment administration inside occ health access

### 5. Plan For Long-Term Administrative Retention

Risk:

- exit workflows and historical compliance reporting become unreliable if records are soft-deleted or denormalised badly

Decision:

- favor immutable audit records and clear lifecycle statuses over destructive deletion

## Recommended Next Build Order

If delivery needs to start immediately, this is the recommended implementation order:

1. Introduce `surveillance_types`, assignment rules, and frequency overrides.
2. Derive worker compliance status and rebuild the dashboard around `green/amber/red/grey`.
3. Add notification scheduling, delivery logs, and escalation thresholds.
4. Expand appointment statuses, reason codes, and completion confirmation fields.
5. Add SEG/workgroup/hazard assignment and bulk enrolment tooling.
6. Add mobilisation, transfer, and baseline gap workflows.
7. Add provider management, reporting, and corporate rollups.
8. Add contractor visibility, corrective actions, exit workflows, and offline enhancements.

## Final Recommendation

The current MedM8 health surveillance foundation is a credible Phase 0 platform. It already establishes the right privacy boundary, role model, worker directory, and appointment workflow base.

The next step is not a rebuild. It is a controlled expansion into a rules-driven occupational health compliance system with:

- surveillance-type precision
- exposure-driven enrolment
- derived compliance tracking
- automated reminders and escalations
- stronger workforce, provider, and audit workflows

That sequence will deliver the highest operational value first while preserving the platform's non-clinical design boundary.
