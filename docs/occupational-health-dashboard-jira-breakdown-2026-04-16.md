# Occupational Health Dashboard Jira Breakdown

Date: 2026-04-16
Repo: `/Volumes/1tbusb/MedM8_WebApp`
Related:

- [occupational-health-dashboard-platform-plan-2026-04-16.md](/Volumes/1tbusb/MedM8_WebApp/docs/occupational-health-dashboard-platform-plan-2026-04-16.md:1)
- [health-surveillance-implementation-tracker-2026-04-15.md](/Volumes/1tbusb/MedM8_WebApp/docs/health-surveillance-implementation-tracker-2026-04-15.md:1)

## Purpose

This document converts the occupational health platform roadmap into Jira-ready epics and stories sized for staged delivery on the existing MedM8 surveillance foundation.

## Suggested Jira Structure

Project hierarchy:

- Initiative: `Occupational Health Dashboard Platform`
- Epics:
  - `OHD-EPIC-01` Compliance Rules Engine
  - `OHD-EPIC-02` Compliance Dashboard and Filtering
  - `OHD-EPIC-03` Notifications and Escalations
  - `OHD-EPIC-04` Exposure-Driven Enrolment
  - `OHD-EPIC-05` Appointment Operations
  - `OHD-EPIC-06` Provider and Roster Operations
  - `OHD-EPIC-07` Reporting, Audit, and Governance
  - `OHD-EPIC-08` Worker App and Offline Experience
  - `OHD-EPIC-09` Advanced Integrations and Contractor Visibility

## Epic 1: Compliance Rules Engine

Outcome:

- the platform can assign surveillance requirements by type and calculate due dates consistently

### Story 1.1: Create surveillance type catalogue

Description:

- introduce a configurable catalogue for discrete surveillance types instead of relying only on broad programs

Acceptance criteria:

- admin or occ health can configure active surveillance types
- types support code, display name, description, default interval, and active flag
- the initial seeded list includes spirometry, audiometry, biological monitoring, musculoskeletal screening, skin surveillance, vision screening, and radiation health monitoring
- no clinical fields are introduced

Dependencies:

- schema changes for `surveillance_types`

### Story 1.2: Add frequency rule configuration

Description:

- support default surveillance frequency by site, SEG, role, or hazard

Acceptance criteria:

- rules can be defined with scope by business and optionally by site, SEG, role code, and hazard code
- rules can define baseline and recurring frequency separately
- rules can be activated and deactivated without data deletion
- due-date calculation uses the highest-priority applicable rule

### Story 1.3: Add worker-specific frequency override

Description:

- allow occ health to override standard surveillance frequency for a specific worker assignment

Acceptance criteria:

- worker assignment supports frequency override in days
- override is visible in worker detail
- audit event is created when override is added, changed, or removed
- next due date recalculates using the override

### Story 1.4: Build server-side due-date calculator

Description:

- implement a shared service for baseline, recurring, and completion-based due date calculation

Acceptance criteria:

- calculation uses actual completion date where present
- baseline-required workers remain grey until baseline completion
- due status can be derived consistently across dashboard, worker detail, exports, and notifications
- unit tests cover common scheduling cases

## Epic 2: Compliance Dashboard and Filtering

Outcome:

- occ health, site leadership, and corporate stakeholders can see real-time compliance status

### Story 2.1: Add traffic-light compliance rollup

Description:

- derive worker-level compliance status as green, amber, red, or grey

Acceptance criteria:

- each worker has a derived compliance status based on all active surveillance assignments
- grey is used when baseline is required and not complete
- amber threshold is configurable
- dashboard summary cards show count and percentage by status

### Story 2.2: Expand dashboard filters

Description:

- allow filtering by operational and surveillance dimensions

Acceptance criteria:

- filters support site, project, department, workgroup, SEG, hazard, surveillance type, provider, contractor company, and roster pattern
- selected filters persist in the URL
- filtered counts and worker lists match the active filter set

### Story 2.3: Create site and corporate rollup views

Description:

- add separate views for site-level operations and all-sites oversight

Acceptance criteria:

- site health teams can view only their scoped site data if required by role policy
- corporate users can view aggregate compliance across all sites in the business
- workers moving between sites remain visible historically and in their current site assignment

### Story 2.4: Replace current metrics cards with compliance cards

Description:

- move the current count-only dashboard toward compliance-first metrics

Acceptance criteria:

- `/surveillance` shows green, amber, red, grey, active assignments, and upcoming workload counts
- cards support click-through to filtered lists
- current cards remain available only where still useful operationally

## Epic 3: Notifications and Escalations

Outcome:

- due and overdue surveillance actions trigger accountable reminders and escalation paths

### Story 3.1: Add notification configuration model

Description:

- define reminder cadence and escalation settings by business and site

Acceptance criteria:

- business/site configuration supports reminder offsets such as 30, 14, and 7 days
- overdue escalation thresholds can be configured
- recipient roles can be configured by event type
- configuration changes are audited

### Story 3.2: Build notification queue and delivery log

Description:

- persist pending, sent, failed, and acknowledged notification events

Acceptance criteria:

- each notification stores target user or role, delivery channel, event type, scheduled time, and delivery status
- duplicate reminders for the same event window are prevented
- occ health users can see notification history from the worker or appointment context

### Story 3.3: Send worker reminders to iOS app

Description:

- deliver pre-due and day-of notifications to workers via push

Acceptance criteria:

- worker receives push notifications when eligible appointment or due event windows are reached
- worker can open the app into the relevant appointment or surveillance summary
- failed deliveries are recorded

### Story 3.4: Add overdue escalation workflow

Description:

- escalate overdue appointments and surveillance obligations to supervisors and managers

Acceptance criteria:

- first overdue alert goes to worker and occ health coordinator
- next threshold includes supervisor
- final threshold includes Safety Manager and Site/Project Manager
- acknowledgement of an overdue alert is tracked

## Epic 4: Exposure-Driven Enrolment

Outcome:

- the platform enrols workers based on exposure and organisational assignment, not only self-declaration

### Story 4.1: Add SEG and hazard data model

Description:

- create the exposure metadata needed to drive assignment rules

Acceptance criteria:

- worker exposure assignments can store SEG, workgroup, hazard codes, and exposure category
- hazard data is coded, not free-text only
- worker role history can be retained over time

### Story 4.2: Build bulk enrolment tools

Description:

- allow occ health to enrol by role, SEG, site, or workgroup

Acceptance criteria:

- occ health user can select a cohort and preview impacted workers before enrolment
- bulk enrolment creates one audit event per worker or a parent batch event with child details
- duplicate active enrolments are prevented

### Story 4.3: Create worker self-declaration review queue

Description:

- convert the current worker toggle into an intake signal rather than the sole enrolment mechanism

Acceptance criteria:

- workers who self-declare become visible in a review queue
- occ health can confirm, adjust, or reject the assignment recommendation
- unresolved `Other` role entries can be reviewed alongside enrolment decisions

### Story 4.4: Add role-change reassessment trigger

Description:

- reassess surveillance requirements when a worker changes role, site, or workgroup

Acceptance criteria:

- role or site change creates a review task for occ health
- changed exposure profile can add or retire surveillance assignments
- prior history remains auditable

## Epic 5: Appointment Operations

Outcome:

- appointment lifecycle is operationally complete without crossing into clinical recordkeeping

### Story 5.1: Expand appointment status model

Description:

- distinguish between worker-confirmed and attended-completed states more clearly

Acceptance criteria:

- appointment workflow supports scheduled, confirmed by worker, rescheduled, did not attend, cancelled, and attended/completed
- status transitions are validated server-side
- all status changes produce audit entries

### Story 5.2: Add reason code catalogue

Description:

- support structured reasons for cancellation, DNA, and reschedule

Acceptance criteria:

- reason codes are configurable and can be reported on
- free text remains optional and constrained
- DNA and cancellation trend reporting uses reason codes

### Story 5.3: Add provider acknowledgement fields

Description:

- record that a provider confirmed completion without storing clinical details

Acceptance criteria:

- appointment supports provider, provider location, and acknowledgement timestamp
- occ health can mark completion confirmed by provider
- provider acknowledgement is separate from outcome details

### Story 5.4: Add appointment window and availability support

Description:

- support planned booking windows before a specific time slot is allocated

Acceptance criteria:

- worker or assignment can hold an appointment window start and end
- system can report items that are due for booking but not yet scheduled
- reminders respect the final booked appointment time when available

## Epic 6: Provider and Roster Operations

Outcome:

- appointment scheduling fits FIFO and remote provider realities

### Story 6.1: Create provider and clinic directory

Description:

- register approved providers and locations

Acceptance criteria:

- provider records support business, site mapping, location, contact details, and active flag
- appointment creation can select a provider and location
- provider filters appear in dashboard and reports

### Story 6.2: Add roster pattern support

Description:

- store enough roster information to plan appointments realistically

Acceptance criteria:

- worker roster model supports pattern, shift type, and current swing window
- availability exceptions support leave and restricted availability
- scheduling views can show workers on site in the next 30 days

### Story 6.3: Create mobilisation workflow

Description:

- trigger baseline surveillance tasks for new starters and mobilised workers

Acceptance criteria:

- mobilisation event can create baseline-required assignments
- worker remains grey until baseline is complete
- occ health queue highlights new starters missing baseline scheduling

## Epic 7: Reporting, Audit, and Governance

Outcome:

- the platform can support management reporting and scrutiny with a defensible audit trail

### Story 7.1: Expand surveillance audit payloads

Description:

- capture before-and-after values and event context for key changes

Acceptance criteria:

- audit record supports actor, worker, action, timestamp, entity, previous value, new value, and reason/comment
- critical changes create immutable audit entries
- audit filters support worker, site, and date range

### Story 7.2: Deliver compliance summary exports

Description:

- export operational compliance reports in CSV and PDF form

Acceptance criteria:

- exports support site, period, workgroup, and surveillance type filters
- CSV export is machine-readable
- PDF export is management-report friendly

### Story 7.3: Deliver workload and gap reports

Description:

- add forecasting and exception reporting

Acceptance criteria:

- upcoming workload forecast covers 30, 60, and 90 days
- new-starter baseline gap report exists
- exit-surveillance gap report exists
- DNA rate and overdue trend reports exist

### Story 7.4: Publish governance and retention settings

Description:

- align operational retention and access configuration to the non-clinical data boundary

Acceptance criteria:

- retention policy can be documented and applied to admin records
- governance docs clearly state clinical data exclusions
- access controls distinguish occ health, supervisors, workers, and contractor reps

## Epic 8: Worker App and Offline Experience

Outcome:

- workers can see and action their surveillance obligations from the iOS app, including low-connectivity scenarios

### Story 8.1: Add worker surveillance summary card

Description:

- expand current next-appointment support into a broader compliance summary

Acceptance criteria:

- worker home shows next appointment plus compliance status summary when health surveillance is enabled
- worker can see assigned surveillance types and due states without clinical detail
- copy reinforces administrative-only design

### Story 8.2: Add appointment confirmation flow

Description:

- allow worker to confirm attendance intention from the app

Acceptance criteria:

- worker can acknowledge an appointment
- confirmation timestamp syncs to the server
- occ health dashboard reflects confirmed-by-worker state

### Story 8.3: Add offline caching and sync queue

Description:

- make surveillance data usable on remote sites with intermittent connectivity

Acceptance criteria:

- app caches upcoming appointments and current compliance summary
- confirmation and acknowledgement actions queue locally when offline
- queued actions sync safely when connection returns

## Epic 9: Advanced Integrations and Contractor Visibility

Outcome:

- the platform can support broader workforce and integration needs without losing privacy discipline

### Story 9.1: Add contractor visibility model

Description:

- support contractor representatives with limited access

Acceptance criteria:

- contractor representative can view only workers from their contractor organisation
- access is limited to compliance/scheduling metadata
- contractor workers remain visible to the principal occ health team

### Story 9.2: Add corrective action tracking

Description:

- track non-clinical corrective actions raised from surveillance outcomes

Acceptance criteria:

- corrective action stores owner, due date, status, and external reference
- no clinical reason text is required or exposed
- overdue corrective actions appear in occ health dashboards

### Story 9.3: Add occupational hygiene integration hook

Description:

- support one-way ingestion of hygiene changes that may trigger surveillance review

Acceptance criteria:

- exposure change events can create reassessment tasks
- hygiene data remains separate from worker clinical records
- integration can be disabled per business/site

### Story 9.4: Add exit surveillance workflow

Description:

- track administrative completion of post-exposure or separation obligations

Acceptance criteria:

- worker separation or de-enrolment can trigger exit surveillance review
- platform can record offered/completed/not completed administrative status
- admin record remains retained according to policy

## Recommended Delivery Sequence

Sprint grouping:

- Wave 1:
  - Epic 1
  - Epic 2
  - Epic 3
  - Story 5.1
  - Story 5.2
- Wave 2:
  - Epic 4
  - Story 5.3
  - Story 5.4
  - Epic 6
- Wave 3:
  - Epic 7
  - Epic 8
- Wave 4:
  - Epic 9

## Suggested Definition Of Done

Each story should not be closed until:

- schema and API changes are documented
- web UI behavior is tested
- iOS behavior is tested where applicable
- RLS and role-scoped access are validated
- audit behavior is verified for write-path stories
- privacy review confirms no clinical data was added
