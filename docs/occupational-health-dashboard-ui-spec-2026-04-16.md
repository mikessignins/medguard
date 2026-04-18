# Occupational Health Dashboard UI Spec

Date: 2026-04-16
Repo: `/Volumes/1tbusb/MedM8_WebApp`
Related:

- [occupational-health-dashboard-platform-plan-2026-04-16.md](/Volumes/1tbusb/MedM8_WebApp/docs/occupational-health-dashboard-platform-plan-2026-04-16.md:1)
- [occupational-health-dashboard-jira-breakdown-2026-04-16.md](/Volumes/1tbusb/MedM8_WebApp/docs/occupational-health-dashboard-jira-breakdown-2026-04-16.md:1)
- [app/(dashboard)/surveillance/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/page.tsx:1)
- [app/(dashboard)/surveillance/workers/[id]/page.tsx](/Volumes/1tbusb/MedM8_WebApp/app/(dashboard)/surveillance/workers/[id]/page.tsx:1)
- [/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeView.swift](/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeView.swift:1)
- [/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerWorkSetupView.swift](/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerWorkSetupView.swift:1)

## Purpose

This document defines the recommended web and iOS user experience for the occupational health dashboard platform as an extension of the current MedM8 surveillance module.

## Product UX Principles

- keep all language clearly administrative and non-clinical
- make compliance status visible at a glance
- make bulk operational work easy for occ health teams
- keep worker actions lightweight and mobile-first
- expose only the minimum level of detail appropriate to each role
- design for remote operations and intermittent connectivity

## Personas

Primary users:

- occupational health coordinator
- occupational health nurse / administrator
- site health lead

Secondary users:

- safety manager
- site/project manager
- supervisor
- worker
- contractor representative

## Information Architecture

### Web App

Primary navigation under `/surveillance`:

- Overview
- Workers
- Assignments
- Appointments
- Notifications
- Providers
- Reports
- Settings

### iOS App

Worker-facing surveillance surfaces:

- dashboard card on worker home
- surveillance summary screen
- appointment detail / acknowledgement screen
- work setup screen
- document acknowledgement screen in later phase

## Web Dashboard Specification

### 1. Overview Screen

Route:

- `/surveillance`

Current foundation:

- shows counts for enrolments, appointments, due soon, overdue, completed

Target design:

- keep the current high-level summary page but make it compliance-first

Sections:

- page header
- compliance summary cards
- filters bar
- overdue and amber priority panels
- workload forecast panel
- recent escalations panel
- worker exceptions table

#### Header

Primary content:

- title: `Occupational Health`
- subtitle: `Administrative surveillance scheduling, compliance, and follow-up only`
- primary actions:
  - `Add worker`
  - `Bulk enrol`
  - `Create appointment`
  - `Export report`

#### Compliance Summary Cards

Cards:

- `Green`
- `Amber`
- `Red`
- `Grey`
- `Upcoming 30 days`
- `DNA rate`

Behavior:

- clicking a card filters the main worker list below
- percentages should appear under raw counts

#### Filters Bar

Filters:

- site
- project
- department
- workgroup
- SEG
- hazard
- surveillance type
- provider
- contractor company
- roster pattern
- compliance status

Design notes:

- filters should stay in a sticky top row on desktop
- on smaller widths, collapse into a slide-over filter panel

#### Priority Panels

Panels:

- `Overdue now`
- `Due soon`
- `New starters awaiting baseline`
- `Unacknowledged escalations`

Each row should show:

- worker name
- site
- workgroup or SEG
- surveillance type affected
- due date
- days overdue or days until due
- next action owner

#### Workload Forecast

Display:

- 30, 60, and 90 day due volumes
- provider demand split
- site split

Visual style:

- compact bar chart or stacked tiles

#### Exceptions Table

Default columns:

- worker
- employment type
- contractor
- site
- surveillance types assigned
- compliance
- next due
- next appointment
- escalation state

Row actions:

- `Open worker`
- `Schedule`
- `Send reminder`
- `Acknowledge escalation`

### 2. Workers List

Route:

- `/surveillance/workers`

Purpose:

- operational directory and intake queue for surveillance-relevant workers

Tabs:

- `All surveillance workers`
- `Needs review`
- `New starters`
- `Transfers`
- `Inactive / exit`

List columns:

- worker
- source
- role
- workgroup
- SEG
- site
- contractor company
- baseline state
- compliance
- active assignments
- next due

Primary actions:

- add manual worker
- bulk import / bulk enrol
- assign exposure group

### 3. Worker Detail

Route:

- `/surveillance/workers/[id]`

Current foundation:

- worker summary, enrolments, schedule form, recent outcomes, appointment history

Target structure:

- left rail summary + right content workspace on desktop

Sections:

- worker summary card
- compliance and assignment summary
- exposure context
- active surveillance assignments
- appointment timeline
- notifications and escalations
- minimal outcome and corrective action panel
- audit timeline

#### Worker Summary Card

Fields:

- name
- worker source
- employee number
- employment type
- contractor company
- current status
- site
- role
- workgroup
- SEG

Badges:

- `Baseline required`
- `Amber`
- `Red`
- `Contractor`

Actions:

- edit worker context
- deactivate
- trigger exit review

#### Compliance and Assignment Summary

Display as assignment cards, one per surveillance type.

Each assignment card shows:

- surveillance type
- assignment source
- default or overridden frequency
- baseline status
- last completed date
- next due date
- current compliance state

Actions:

- edit frequency
- pause assignment
- remove assignment
- create appointment

#### Exposure Context

Fields:

- role code
- department
- operational area
- workgroup
- SEG
- hazard list
- exposure level category
- HHMP reference

Actions:

- update exposure mapping
- re-run assignment recommendations

#### Appointment Timeline

Display:

- chronological event list

Each event shows:

- scheduled date/time
- provider / location
- status
- reason code if applicable
- completion confirmation

Actions:

- confirm attendance
- reschedule
- cancel
- mark completed

#### Notifications and Escalations

Display:

- reminder history
- overdue alerts sent
- escalation acknowledgements

Columns:

- event type
- recipient
- channel
- sent
- status
- acknowledged

#### Minimal Outcome and Corrective Action Panel

Display only administrative status:

- outcome received
- outcome communicated to worker
- corrective action required
- corrective action ref
- corrective action owner
- corrective action status

### 4. Assignments Screen

Route:

- `/surveillance/assignments`

Purpose:

- manage surveillance rules and active worker assignments separately from appointments

Tabs:

- `Worker assignments`
- `Assignment rules`
- `Frequency rules`
- `Review queue`

#### Assignment Rules View

Columns:

- surveillance type
- site
- role
- SEG
- hazard
- exposure category
- baseline required
- active

Actions:

- create rule
- edit rule
- disable rule
- preview impacted workers

#### Frequency Rules View

Columns:

- surveillance type
- site / SEG scope
- baseline interval
- recurring interval
- priority
- active

### 5. Appointments Screen

Route:

- `/surveillance/appointments`

Current foundation:

- flat appointment table

Target design:

- operational scheduling board with list and calendar modes

Views:

- `List`
- `Calendar`
- `By provider`
- `Unbooked due items`

Default columns:

- worker
- surveillance type
- site
- provider
- location
- scheduled time
- roster availability
- status
- reason code

Primary actions:

- create appointment
- bulk book by site/crew
- reschedule
- cancel

### 6. Notifications Screen

Route:

- `/surveillance/notifications`

Purpose:

- give occ health clear visibility into reminder and escalation activity

Tabs:

- `Scheduled`
- `Sent`
- `Failed`
- `Acknowledged`

Columns:

- type
- worker
- recipient
- channel
- scheduled for
- sent at
- delivery status
- acknowledgement status

### 7. Providers Screen

Route:

- `/surveillance/providers`

Purpose:

- manage approved providers and location capacity

List columns:

- provider
- location
- linked sites
- remote support
- active appointments upcoming
- active

### 8. Reports Screen

Route:

- `/surveillance/reports`

Purpose:

- provide exportable management and operational reporting

Report cards:

- compliance summary
- overdue trend
- DNA analysis
- workload forecast
- new starter baseline gap
- exit surveillance gap
- contractor compliance

For each report:

- filter bar
- preview summary
- `Export CSV`
- `Export PDF`

### 9. Settings Screen

Route:

- `/surveillance/settings`

Purpose:

- configure surveillance types, reminder cadence, escalation roles, and reason codes

Sections:

- surveillance types
- frequency rules
- reminder cadence
- escalation policy
- reason codes
- provider defaults

## iOS Worker Experience Specification

### 1. Worker Home Surveillance Card

Current foundation:

- worker home already surfaces the next surveillance appointment when it exists

Target card title:

- `Health Surveillance`

States:

- `No assignment`
- `Baseline required`
- `Current`
- `Due soon`
- `Overdue`

Card content:

- compliance status badge
- next appointment date/time if booked
- next due date if not booked
- site/provider location summary
- primary action button

Primary actions by state:

- `View details`
- `Confirm appointment`
- `Contact occ health`

Copy guidance:

- avoid clinical wording
- use lines like `Administrative surveillance scheduling only`

### 2. Surveillance Summary Screen

Route concept:

- pushed from the worker home card

Sections:

- compliance summary header
- assigned surveillance types
- next appointment card
- reminder history
- information / privacy notice

Each assignment row:

- surveillance type
- current status
- next due
- baseline complete yes/no

### 3. Appointment Detail Screen

Purpose:

- let the worker understand and acknowledge upcoming appointments

Fields:

- appointment date/time
- location
- provider / clinic name
- simple preparation instructions
- status

Actions:

- confirm appointment
- request reschedule
- acknowledge reminder

Constraints:

- no clinical fields
- request reschedule should use coded reasons where possible

### 4. Work Setup Screen Evolution

Current foundation:

- worker can choose a role and toggle whether surveillance is required

Recommended evolution:

- keep current low-friction flow
- reframe the toggle as a prompt, not as the source of truth

Possible updated copy:

- `My role may require health surveillance`

Later additions:

- selected site
- contractor company
- roster pattern if no integration exists

### 5. Offline Experience

Behavior:

- cache surveillance summary and next appointment locally
- show offline badge when viewing cached info
- queue confirm and acknowledge actions while offline

Failure handling:

- show `Queued for sync` state
- do not pretend the server has accepted an action until sync succeeds

## Role-Based Visibility Rules In UI

### Occupational Health

Can see:

- all worker operational surveillance detail
- assignments
- appointments
- notifications
- providers
- reports
- audit trail

### Supervisors

Should see:

- worker compliance status
- overdue status
- outstanding action required

Should not see:

- provider operational notes
- detailed reminder log unless explicitly required

### Workers

Should see:

- only their own assignments and appointments
- administrative statuses only

### Contractor Representatives

Should see:

- only workers from their company
- compliance status and scheduling state only

## Suggested Component Model For Web

Recommended component additions:

- `ComplianceStatusCard`
- `ComplianceFilterBar`
- `WorkerAssignmentCard`
- `ExposureContextPanel`
- `NotificationHistoryTable`
- `EscalationBadge`
- `ProviderDirectoryTable`
- `RosterAvailabilityBadge`
- `ReportExportCard`

Suggested reuse from current implementation:

- `MetricCard`
- `AppointmentTable`
- `EnrolmentList`
- `StatusBadge`

## Suggested Mobile Component Model For iOS

Recommended additions:

- `WorkerSurveillanceCard`
- `SurveillanceSummaryView`
- `WorkerSurveillanceAssignmentRow`
- `WorkerAppointmentDetailView`
- `OfflineSyncStatusBanner`

Likely current integration points:

- `WorkerHomeView`
- `WorkerWorkSetupView`
- existing repository and Supabase service layers

## UX Risks To Avoid

### 1. Overloading workers with corporate compliance language

Avoid:

- management-heavy wording on worker screens

Prefer:

- short, direct action copy

### 2. Turning the dashboard into a flat table only

Avoid:

- forcing occ health users to do all prioritisation manually

Prefer:

- priority panels and rollup cards above detailed tables

### 3. Blurring admin outcomes with health outcomes

Avoid:

- labels that imply diagnosis or fitness decisions are stored in the platform

Prefer:

- `Outcome received`
- `Outcome communicated`
- `Corrective action required`

### 4. Hiding filter state in large multi-site views

Avoid:

- unclear data scope

Prefer:

- persistent visible filter chips and page-level scope labels

## Recommended UI Delivery Order

1. Rework `/surveillance` overview into compliance-first layout.
2. Expand worker detail into assignment, exposure, notification, and audit sections.
3. Add assignment rules and frequency rules screens.
4. Upgrade appointments into list plus scheduling board.
5. Add notifications, providers, and reports screens.
6. Expand iOS worker home card and add surveillance summary/detail flows.
7. Add offline sync states and later document acknowledgement flows.
