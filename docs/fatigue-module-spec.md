# Fatigue Module Specification

## Purpose

Digitise the current site fatigue workflow as a reusable MedGuard module with:

- a worker self-assessment
- a linked medic / ESO assessment when risk is raised
- de-identified reporting for business and superuser use
- consistent billing, audit, and export behavior

This module should be implemented on the module engine foundation rather than as a new legacy one-off table.

## Module Identity

- Module key: `fatigue_assessment`
- Category: `custom`
- Submission backend: `module_engine`
- Billable: `yes`, but only when a medic / ESO assessment is completed
- Exportable: `yes`
- Purgeable: `yes`

## Recommended Shape

Treat fatigue as one module with two linked workflows:

1. `Fatigue Self-Assessment`
2. `Fatigue Medic / ESO Assessment`

This keeps the business workflow together while still separating worker triage from clinician / responder decision-making.

## Why This Is The Right First New Module

- High operational value on mine sites.
- Familiar existing paper workflow.
- Lower privacy complexity than refusal forms.
- Strong fit for de-identified reporting and site trend analysis.
- Good test case for the reusable module engine.

## Workflow Summary

### Worker Path

Worker starts a fatigue check from the worker dashboard.

The app:

- captures the self-assessment
- calculates a fatigue score
- derives a fatigue risk level
- saves a worker-stage fatigue submission

If the result is:

- `Low`: record is saved and visible in worker history
- `Medium`: record is escalated into the medic queue
- `High`: record is escalated urgently into the medic queue and marked not fit for safety-critical work until reviewed

### Medic / ESO Path

Medic or ESO opens the linked fatigue case and completes a structured assessment.

The app:

- records clinical / operational findings
- captures the fit-for-work decision
- captures transport / supervisor handover decisions
- closes the case with an outcome

## Worker Self-Assessment Form

### Worker Context

- `business_id`
- `site_id`
- `worker_id`
- `worker_name_snapshot`
- `job_role`
- `workgroup`
- `roster_pattern`
- `current_shift_start_at`
- `planned_shift_end_at`
- `assessment_context`

Recommended `assessment_context` values:

- `pre_shift`
- `during_shift`
- `post_shift`
- `journey_management`
- `peer_or_supervisor_concern`
- `other`

### Worker Questions

- `sleep_hours_last_24h`
- `sleep_hours_last_48h`
- `hours_awake_by_end_of_shift`
- `alertness_rating`
- `alcohol_before_sleep_band`
- `drowsy_medication_or_substance`
- `stress_or_health_issue_affecting_sleep_or_concentration`
- `driving_after_shift`
- `commute_duration_minutes`
- `worker_comments`

### Alertness Rating

Use the existing paper intent:

- `a_active_alert_wide_awake`
- `b_functioning_well_not_peak`
- `c_ok_but_not_fully_alert`
- `d_groggy_hard_to_concentrate`
- `e_sleepy_would_like_to_lie_down`

### Scoring

Keep the existing employer scoring logic:

- low answer = `0`
- medium answer = `1`
- high answer = `2`

Stored computed values:

- `fatigue_score_total`
- `has_any_high_risk_answer`
- `derived_risk_level`

Recommended derived risk values:

- `low`
- `medium`
- `high`

### Worker Outcome Logic

- `low` if total score `0-3` and no high-risk answer
- `medium` if total score `4-7` or worker reports fatigue concerns
- `high` if total score `8+` or any configured critical response threshold is met

The exact final threshold mapping should mirror the current business paper form unless clinical governance decides to change it.

## Medic / ESO Assessment Form

This should only be available when:

- a worker fatigue submission is escalated, or
- a medic / ESO manually opens a fatigue case linked to a worker

### Referral Context

- `linked_worker_submission_id`
- `referred_by`
- `review_started_at`
- `reviewed_by_user_id`
- `reviewed_by_name`
- `review_role`

Recommended `referred_by` values:

- `self`
- `supervisor`
- `peer`
- `medic`
- `eso`
- `system_escalation`

### Clinical / Operational Findings

- `symptom_yawning`
- `symptom_slowed_response`
- `symptom_wandering_thoughts`
- `symptom_irritability`
- `symptom_fixed_stare`
- `symptom_microsleep_concern`
- `symptom_poor_coordination`
- `appearance_notes`
- `speech_notes`
- `gait_notes`
- `cognition_notes`

### Contributing Factors

- `factor_sleep_debt`
- `factor_extended_shift`
- `factor_recent_call_out`
- `factor_heat_or_environment`
- `factor_illness`
- `factor_medication`
- `factor_alcohol_or_other_substance`
- `factor_stress`
- `factor_long_commute`
- `factor_other_notes`

### Decision

- `fit_for_work_decision`
- `restrictions`
- `driving_decision`
- `transport_arranged`
- `sent_to_room`
- `sent_home`
- `requires_higher_medical_review`
- `requires_follow_up`
- `follow_up_due_at`
- `supervisor_notified`
- `supervisor_name`
- `handover_notes`
- `medic_or_eso_comments`

Recommended `fit_for_work_decision` values:

- `fit_normal_duties`
- `fit_restricted_duties`
- `not_fit_for_work`
- `sent_to_room`
- `sent_home`
- `requires_escalation`

Recommended `driving_decision` values:

- `safe_to_drive`
- `not_safe_to_drive`
- `transport_required`

### Signatures

- `worker_signature`
- `medic_signature`
- `witness_name`
- `witness_signature`

Witness should be optional, but available if required by site procedure.

## Module Submission Model

Recommended `module_submissions` usage:

- one worker submission row for self-assessment
- optional linked medic review row, or a single case row with stage-specific payload blocks

Recommended shape for the MVP:

- one case id
- one payload object with:
  - `worker_assessment`
  - `worker_score_summary`
  - `medic_assessment`
  - `final_outcome`

This is cleaner for reporting and queue state than two unrelated rows.

### Suggested Payload Sections

```json
{
  "worker_assessment": {},
  "worker_score_summary": {
    "fatigue_score_total": 0,
    "has_any_high_risk_answer": false,
    "derived_risk_level": "low"
  },
  "medic_assessment": null,
  "final_outcome": {
    "status": "worker_only_complete"
  }
}
```

Later states:

- `worker_only_complete`
- `awaiting_medic_review`
- `in_medic_review`
- `resolved`

## Dashboard Behavior

### Worker Dashboard

Show a module card:

- title: `Fatigue Check`
- subtitle: `Quick self-assessment before or during shift`
- CTA: `Start Check`

Also show:

- most recent fatigue result
- whether a medic review is pending

### Medic Dashboard

Show a fatigue queue section when enabled:

- `Awaiting Review`
- `In Review`
- `Resolved today`

Use visible severity chips:

- `Low`
- `Medium`
- `High`

### Admin Dashboard

Admins should see business-level fatigue metrics only, not detailed worker health content unless policy explicitly allows it.

Suggested metrics:

- total fatigue checks
- medium risk count
- high risk count
- sent home count
- transport arranged count
- repeat fatigue event count

### Superuser Dashboard

Superusers should be able to:

- filter by business
- filter by site / all sites
- filter by date range
- export de-identified PDF reports

## Reporting

### Business-Useful Metrics

- fatigue checks by month
- fatigue checks by site
- medium/high fatigue prevalence
- common fatigue contributors
- transport required count
- sent-home count
- repeat fatigue events per swing
- pre-shift vs during-shift fatigue events

### De-Identification Rules

Only de-identified reporting should be available to superusers for business reporting:

- counts
- percentages
- trends
- no worker-level rows
- small-cohort suppression for sensitive breakdowns

## Billing

Recommended billing rule:

- worker self-assessment alone is **not** billable
- medic / ESO completed fatigue assessment is billable

Reason:

- better alignment with actual professional review workload
- avoids charging businesses for high-volume low-touch self-checks

## Export / Purge

Recommended export behavior:

- only exportable once a medic / ESO assessment exists
- PDF export available for a limited retention window
- standard purge/export audit rules should apply

## MVP Delivery Order

### Phase 1

- worker self-assessment
- auto scoring
- medic queue escalation

### Phase 2

- medic / ESO review form
- fit-for-work and transport decision flow
- PDF export

### Phase 3

- reporting
- billing integration
- trend dashboards

## Open Decisions

These should be confirmed before implementation:

1. Whether admins can view any row-level fatigue case outcomes or only aggregates.
2. Whether ESO is represented as the existing `medic` role or a future dedicated role.
3. Whether `high` fatigue should always create a “not fit for work until reviewed” banner.
4. Whether repeat fatigue within the same swing should be auto-counted from roster dates or explicitly recorded.
5. Whether commute / driving risk is mandatory when the worker indicates they are driving after shift.

## Recommended Follow-On Module

After fatigue, the next strong module is:

- `refusal_form`

But it should come second because it has higher medico-legal sensitivity and will benefit from the module framework being proven first.
