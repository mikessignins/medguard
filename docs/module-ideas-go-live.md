# Module Ideas For Go-Live (No Critical DB Changes)

This shortlist is designed to plug into `module_catalog` + `business_modules` and store payloads in `module_submissions` or existing `site_specific_answers` where appropriate.

## 1) Fatigue Fit-For-Shift
- Why: high-frequency operational risk.
- Core fields:
  - sleep_hours_last_24h
  - sleep_hours_last_48h
  - hours_awake
  - self_assessed_fatigue_level
  - drowsy_medication_or_substance
  - stress_or_health_issue_affecting_sleep_or_concentration
  - driving_after_shift
- Workflow:
  - worker self-assessment -> auto score -> medic / ESO review if medium/high.
- Spec:
  - [fatigue-module-spec.md](/Volumes/1tbusb/MedM8_WebApp/docs/fatigue-module-spec.md)

## 2) Psychosocial Health & Wellbeing
- Why: fastest-growing governance area for mine operators and a major business-reporting need.
- Core workflows:
  - Wellbeing Pulse
  - Post-Incident Psychological Welfare
  - FIFO Psychological Risk Assessment
- Core MVP fields:
  - mood_rating
  - stress_rating
  - sleep_quality_on_roster
  - feeling_overwhelmed_by_work_demands
  - recent_interpersonal_conflict_at_work
  - recent_concerning_life_event
  - feeling_socially_isolated
  - concern_about_workplace_behaviour
  - concern_about_roster_or_fatigue_pressure
  - would_like_support_contact
- Workflow:
  - worker can submit anytime
  - business-configured reminders
  - higher-risk responses create medic / welfare review items
  - superuser reporting rolls up into recognised psychosocial hazard domains
- Spec:
  - [psychosocial-module-spec.md](/Volumes/1tbusb/MedM8_WebApp/docs/psychosocial-module-spec.md)

## 3) Heat Stress / Hydration Check
- Why: common site health and safety control.
- Core fields:
  - hydration_status
  - heat_exposure_last_shift
  - symptoms_checklist
  - fluid_intake_estimate
  - supervisor_notified
- Workflow: fast triage and trend reporting by site.

## 4) Respiratory / Fit-Test Declaration
- Why: role-specific compliance for PPE-intensive work.
- Core fields:
  - respirator_type
  - fit_test_date
  - fit_test_result
  - facial_hair_status
  - contraindications
- Workflow: compliance status + expiry reminder.

## 5) Injury / Incident Self-Report
- Why: early capture before shift escalation.
- Core fields:
  - incident_datetime
  - body_area
  - mechanism
  - immediate_symptoms
  - treatment_received
- Workflow: submit -> medic follow-up -> export/audit.

## 6) Return-To-Work Check-In
- Why: controlled follow-up after restricted/unfit decisions.
- Core fields:
  - linked_case_id
  - current_symptoms
  - medication_changes
  - capacity_self_assessment
  - restrictions_acknowledged
- Workflow: recurring submissions until clearance.

## 7) Refusal Of Assessment / Treatment
- Why: strong medico-legal value when a worker declines assessment, tests, treatment, or transfer.
- Core fields:
  - refusal_context
  - options_offered
  - risks_explained
  - worker_reason_optional
  - worker_signature
  - medic_signature
  - witness_signature
  - transport_or_escalation_advice
- Workflow:
  - medic-led or medic-supported completion -> signed PDF record -> audit-safe retention.
- Recommendation:
  - build after fatigue, once the module execution path is proven.

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
