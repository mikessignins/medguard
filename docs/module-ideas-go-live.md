# Module Ideas For Go-Live (No Critical DB Changes)

This shortlist is designed to plug into `module_catalog` + `business_modules` and store payloads in `module_submissions` or existing `site_specific_answers` where appropriate.

## 1) Fatigue Fit-For-Shift
- Why: high-frequency operational risk.
- Core fields:
  - sleep_hours_last_24h
  - sleep_quality
  - hours_awake
  - self_assessed_fatigue_level
  - alertness_concerns_free_text
- Workflow: worker submit -> medic/admin review rule-based thresholds.

## 2) Heat Stress / Hydration Check
- Why: common site health and safety control.
- Core fields:
  - hydration_status
  - heat_exposure_last_shift
  - symptoms_checklist
  - fluid_intake_estimate
  - supervisor_notified
- Workflow: fast triage and trend reporting by site.

## 3) Respiratory / Fit-Test Declaration
- Why: role-specific compliance for PPE-intensive work.
- Core fields:
  - respirator_type
  - fit_test_date
  - fit_test_result
  - facial_hair_status
  - contraindications
- Workflow: compliance status + expiry reminder.

## 4) Injury / Incident Self-Report
- Why: early capture before shift escalation.
- Core fields:
  - incident_datetime
  - body_area
  - mechanism
  - immediate_symptoms
  - treatment_received
- Workflow: submit -> medic follow-up -> export/audit.

## 5) Return-To-Work Check-In
- Why: controlled follow-up after restricted/unfit decisions.
- Core fields:
  - linked_case_id
  - current_symptoms
  - medication_changes
  - capacity_self_assessment
  - restrictions_acknowledged
- Workflow: recurring submissions until clearance.

## Implementation Pattern
- Entitlement:
  - Toggle in `business_modules`.
- Form definition:
  - Version in `module_versions` with JSON schema.
- Data:
  - Store in `module_submissions.payload`.
- Review:
  - Keep role/site RLS identical to existing medic flow.
- Billing:
  - Only include modules explicitly marked billable in one shared monthly billing view.
