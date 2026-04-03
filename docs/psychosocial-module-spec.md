# Psychosocial Health Module Specification

## Purpose

Create a reusable MedGuard module for psychosocial risk and mental wellbeing workflows that:

- allows workers to submit a check-in anytime
- supports business-configured reminder schedules
- separates de-identified reporting check-ins from worker-identifiable support requests
- gives superusers de-identified, business-ready psychosocial hazard reporting
- preserves stronger privacy and governance controls than a generic survey tool

This should be implemented on the module engine foundation rather than as a one-off legacy form.

## Module Identity

- Module key: `psychosocial_health`
- Category: `custom`
- Submission backend: `module_engine`
- Billable: `yes`, but only for workflows that involve medic or welfare review if the business chooses that billing model
- Exportable: `yes`, but only for reviewed / welfare-managed cases
- Purgeable: `yes`

## Recommended Shape

Treat this as one umbrella module with four linked workflows:

1. `Wellbeing Pulse`
2. `Psychosocial Support Check-In`
3. `Post-Incident Psychological Welfare`
4. `FIFO Psychological Risk Assessment`

This keeps business reporting, privacy rules, export logic, and governance consistent while still allowing different operational paths.

## Recommended Build Order

### Phase 1: Wellbeing Pulse + Psychosocial Support Check-In

Build these together, but as separate privacy tracks.

Why:

- lowest operational friction
- strongest adoption potential
- best first source of de-identified psychosocial metrics
- clearer worker trust boundary between reporting and help-seeking
- safest first workflow because it separates metrics from case management

### Phase 2: Post-Incident Psychological Welfare

Build second.

Why:

- strong clinical and governance value
- medic-led rather than self-diagnostic
- creates a formal handover / referral trail after traumatic events

### Phase 3: FIFO Psychological Risk Assessment

Build last.

Why:

- higher privacy sensitivity
- more complex escalation model
- should only use validated tools once the broader psychosocial governance path is proven

## Key Principles

### Not a diagnostic tool

`Wellbeing Pulse` should be framed as a psychosocial risk check-in for de-identified reporting, not a psychiatric diagnosis.

`Psychosocial Support Check-In` should be framed as a worker-initiated request for review or contact, not a diagnostic tool.

### Worker autonomy + business cadence

Workers should be able to submit:

- a `Wellbeing Pulse` anytime and when prompted by scheduled business cadence
- a `Psychosocial Support Check-In` anytime they want contact, help, or review

### De-identified reporting by psychosocial domain

Superuser reporting must not expose raw worker-level responses. It should aggregate results into recognised psychosocial hazard domains.

### Stronger privacy posture

Psychosocial workflows should be treated as highly sensitive PHI-bearing forms. Access, exports, and audit should be tighter than general operational forms.

## Workflow 1: Wellbeing Pulse

## Worker Experience

Workers can:

- open the pulse manually from the dashboard at any time
- receive reminder prompts according to business configuration
- submit a short check-in in under 2 minutes

The worker should see:

- a supportive tone
- plain-language confidentiality explanation
- clear statement that the pulse is not a diagnosis
- clear explanation that this pulse is used for grouped, de-identified reporting rather than individual review by default

## Reminder / Scheduling Model

Business-configurable scheduling:

- `manual_only`
- `weekly`
- `fortnightly`
- `monthly`
- `roster_start`
- `roster_end`
- `custom_days_interval`

Recommended config fields in `business_modules.config`:

- `cadence`
- `interval_days`
- `allow_anytime_submission`
- `reminder_enabled`
- `supports_deidentified_pulse`
- `supports_support_checkin`

Recommended defaults:

- `allow_anytime_submission = true`
- `reminder_enabled = true`
- `cadence = fortnightly`
- `supports_deidentified_pulse = true`
- `supports_support_checkin = true`

## Worker Pulse Form

### Context

- `business_id`
- `site_id`
- `worker_id`
- `worker_name_snapshot`
- `job_role`
- `workgroup`
- `roster_pattern`
- `is_fifo_worker`
- `submission_context`

Recommended `submission_context` values:

- `scheduled_check_in`
- `self_initiated_check_in`
- `post_shift_concern`
- `manager_or_peer_prompted`
- `post_incident_follow_up`

### Core Questions

- `mood_rating`
- `stress_rating`
- `sleep_quality_on_roster`
- `feeling_overwhelmed_by_work_demands`
- `recent_interpersonal_conflict_at_work`
- `recent_concerning_life_event`
- `feeling_socially_isolated`
- `concern_about_workplace_behaviour`
- `concern_about_roster_or_fatigue_pressure`
- `would_like_support_contact`
- `comfortable_speaking_to_medic`
- `comfortable_speaking_to_counsellor`
- `worker_comments`

Recommended answer types:

- simple 5-point scales for mood / stress / sleep quality
- yes / no for support and hazard signal questions
- optional free text comments

### Optional Safety Flag Questions

Use only if clinically/governance-approved for the first release:

- `would_like_urgent_contact_today`
- `feels_unsafe_at_work_today`

These should not attempt to diagnose. They should only act as escalation triggers.

If a worker wants individual follow-up, the pulse should direct them into the separate `Psychosocial Support Check-In` workflow rather than silently opening an identifiable review case from the reporting pulse alone.

## Workflow 2: Psychosocial Support Check-In

This is the identifiable, worker-to-medic or worker-to-welfare pathway.

### Worker Experience

Workers can:

- open it anytime from the dashboard
- use it when they want contact, advice, or support
- be directed into it after a de-identified pulse if they ask for follow-up

The worker should see:

- a clear statement that this path is reviewed by a medic or welfare contact
- reassurance that it still contributes to grouped de-identified reporting as well
- explanation that they are deliberately requesting or allowing individual follow-up

### Support Check-In Fields

The support check-in can reuse most of the psychosocial hazard questions from the pulse, but it should also capture:

- `worker_requests_follow_up`
- `preferred_contact_path`
- `contact_is_urgent_today`
- `feels_unsafe_at_work_today`
- `free_text_support_concern`

Recommended `preferred_contact_path` values:

- `medic`
- `welfare_or_counsellor`
- `either`
- `not_sure`

### Support Check-In Behaviour

- all submissions enter a reviewable queue
- higher-risk responses increase urgency
- all responses still contribute to de-identified hazard reporting
- only the review workflow and export path remain worker-identifiable

## Recognised Hazard Mapping

Each question should map into one or more recognised psychosocial hazards so reporting aligns with the Safe Work Australia / Commonwealth framing rather than an internal-only grouping.

The reporting model should support these 17 hazard groups:

### Work Design & Organisation

1. `high_job_demands`
- excessive workload
- time pressure
- unrealistic deadlines

2. `low_job_demands`
- under-stimulation
- skill under-utilisation
- lack of meaningful work

3. `low_job_control`
- little control over how work is done
- little control over when work is done

4. `poor_support`
- inadequate supervisor support
- inadequate peer support
- lack of practical resources

5. `lack_of_role_clarity`
- unclear responsibilities
- conflicting instructions
- no clear expectations

6. `poor_organisational_change_management`
- poorly communicated change
- restructuring handled badly
- uncertainty created by organisational change

7. `poor_organisational_justice`
- unfair treatment
- inconsistent processes
- lack of transparency

8. `low_reward_and_recognition`
- effort-reward imbalance
- not feeling valued
- poor recognition for work performed

9. `job_insecurity`
- concerns about continued employment
- uncertainty about roster continuity or job future

### Workplace Behaviours & Interactions

10. `violence_and_aggression`
- threats
- intimidation
- physical aggression

11. `bullying`
- repeated unreasonable behaviour
- persistent mistreatment

12. `harassment_including_sexual_harassment`
- unwanted conduct
- discriminatory behaviour
- sexual harassment signals

### Environmental & Situational

13. `remote_or_isolated_work`
- limited support access
- communication barriers
- FIFO / camp isolation
- remote work strain

14. `poor_physical_environment`
- noise
- heat / cold extremes
- poor workspace conditions

15. `traumatic_events_or_material`
- exposure to death
- serious injury
- distressing incidents
- CPR / critical event involvement

### Additional Commonwealth / Comcare Hazards

16. `fatigue`
- insufficient rest
- shift strain
- excessive hours
- roster-related fatigue pressure

17. `intrusive_surveillance`
- monitoring that undermines trust
- excessive scrutiny
- surveillance-driven stress

## Question Coverage Strategy

The module should not attempt to ask 17 separate “tick yes/no” hazard questions in a blunt way. Instead, the question set should be designed so responses can be mapped across these recognised hazards.

Recommended approach:

- a short core pulse for every worker
- optional branching questions when a core signal is raised
- explicit hazard-domain mapping behind the scenes

### Coverage Matrix

Each recognised hazard should have at least one direct capture point in the pulse flow.

| Hazard | Core capture | Suggested branch / clarifier |
| --- | --- | --- |
| `high_job_demands` | feeling overwhelmed by workload or pace | workload or deadlines unmanageable |
| `low_job_demands` | feeling under-used or disengaged | not enough meaningful work |
| `low_job_control` | feeling able to control how work is done | enough say in how work is carried out |
| `poor_support` | feeling supported by supervisor / team | supervisor support and peer support separately |
| `lack_of_role_clarity` | clarity of role and expectations | unclear or conflicting instructions |
| `poor_organisational_change_management` | concerns about poor communication | recent change handled poorly |
| `poor_organisational_justice` | concerns about unfair treatment | decisions or processes felt unfair |
| `low_reward_and_recognition` | current mood / coping plus fairness signal | feeling effort is recognised appropriately |
| `job_insecurity` | stress level plus communication / fairness signal | worried about employment or roster continuity |
| `violence_and_aggression` | recent interpersonal conflict or inappropriate behaviour | threats, intimidation, or aggression |
| `bullying` | recent interpersonal conflict or inappropriate behaviour | repeated unreasonable behaviour |
| `harassment_including_sexual_harassment` | recent interpersonal conflict or inappropriate behaviour | unwelcome conduct or harassment |
| `remote_or_isolated_work` | feeling isolated because of roster / remote / FIFO setting | remote or FIFO work left worker isolated |
| `poor_physical_environment` | concern about physical environment affecting wellbeing | environment negatively affected wellbeing |
| `traumatic_events_or_material` | exposure to a distressing or traumatic event | witnessed serious injury, death, CPR, or other distressing incident |
| `fatigue` | sleep quality on roster and concern about roster-related fatigue | roster or work pattern left worker significantly fatigued |
| `intrusive_surveillance` | concern about monitoring / surveillance pressure | monitoring made worker feel pressured or distrusted |

### Core Pulse Questions

These should cover the highest-yield signals:

- current mood / coping
- current stress level
- sleep quality on roster
- feeling overwhelmed by workload or pace
- feeling under-used or disengaged
- feeling able to control how work is done
- feeling supported by supervisor / team
- clarity of role and expectations
- concerns about unfair treatment or poor communication
- recent interpersonal conflict or inappropriate behaviour
- feeling isolated because of roster / remote / FIFO setting
- concern about physical environment affecting wellbeing
- exposure to a distressing or traumatic event
- concern about roster-related fatigue
- concern about monitoring / surveillance pressure
- whether support contact would be helpful

This means the implementation should deliberately include the following worker-facing fields in the first `Wellbeing Pulse` schema:

- `mood_rating`
- `stress_rating`
- `sleep_quality_on_roster`
- `feeling_overwhelmed_by_work_demands`
- `feeling_under_used_or_disengaged`
- `feeling_able_to_control_work`
- `feeling_supported_by_supervisor_or_team`
- `role_and_expectations_are_clear`
- `concern_about_unfair_treatment_or_poor_communication`
- `recent_interpersonal_conflict_or_inappropriate_behaviour`
- `feeling_isolated_due_to_remote_or_fifo_work`
- `physical_environment_affecting_wellbeing`
- `exposed_to_distressing_or_traumatic_event`
- `concern_about_roster_or_fatigue_pressure`
- `concern_about_monitoring_or_surveillance_pressure`
- `would_like_support_contact`
- `worker_comments`

These core fields should then unlock targeted branch questions only when needed, so the worker experience stays short while still covering the recognised hazard set.

### Suggested Branching Logic

If a worker signals concern in a domain, ask one or two clarifying questions only.

Examples:

- `high_job_demands`:
  - “Have workload or deadlines felt unmanageable recently?”
  - “Has this affected your ability to recover between shifts?”

- `low_job_demands`:
  - “Have you felt under-used, disengaged, or lacking meaningful work?”

- `low_job_control`:
  - “Do you feel you have enough say in how your work is carried out?”

- `poor_support`:
  - “Do you feel you can get help from your supervisor when needed?”
  - “Do you feel supported by your team?”

- `lack_of_role_clarity`:
  - “Have expectations or instructions been unclear or conflicting?”

- `poor_organisational_change_management`:
  - “Has workplace change recently caused stress because it was poorly explained or managed?”

- `poor_organisational_justice`:
  - “Have you felt processes or decisions at work have been unfair?”

- `low_reward_and_recognition`:
  - “Do you feel your effort is recognised appropriately?”

- `job_insecurity`:
  - “Have you been worried about ongoing employment or roster continuity?”

- `violence_and_aggression`:
  - “Have you experienced threats, intimidation, or aggression at work?”

- `bullying`:
  - “Have you experienced repeated unreasonable behaviour from others at work?”

- `harassment_including_sexual_harassment`:
  - “Have you experienced unwelcome conduct or harassment at work?”

- `remote_or_isolated_work`:
  - “Has remote or FIFO work left you feeling isolated or unsupported?”

- `poor_physical_environment`:
  - “Has the physical work environment negatively affected your wellbeing?”

- `traumatic_events_or_material`:
  - “Have you recently been exposed to a distressing or traumatic event at work?”

- `fatigue`:
  - “Has your roster or work pattern left you significantly fatigued?”

- `intrusive_surveillance`:
  - “Has monitoring or surveillance at work made you feel pressured or distrusted?”

## Reporting Model

Superuser reporting should roll up into these recognised hazards first, then optionally into broader summary groups for executive readability.

### Primary Report Layer

The primary layer should show the 17 recognised psychosocial hazards directly.

### Secondary Summary Layer

For easier executive reading, these can also be grouped into:

- `work_design_and_organisation`
- `workplace_behaviours_and_interactions`
- `environmental_and_situational`
- `additional_commonwealth_hazards`

The detailed report should still preserve the individual hazard breakdown underneath.

## Escalation Logic

### Wellbeing Pulse

### Low

- stays as worker history item
- included in de-identified reporting
- no queue escalation

### Moderate

- worker receives supportive advice
- worker can be invited to open a `Psychosocial Support Check-In`
- included in de-identified reporting

### High

- stronger worker guidance shown immediately
- worker can be directed into a `Psychosocial Support Check-In`
- still counted in de-identified reporting

### Critical

Only include this category if governance approves explicit same-day welfare escalation logic.

- urgent worker guidance
- direct worker into the support check-in flow
- cannot rely on passive dashboard review

### Psychosocial Support Check-In

- all submissions create a reviewable queue item
- higher-risk responses increase urgency
- all submissions still contribute to de-identified psychosocial reporting
- only the reviewed case path remains worker-identifiable

## Suggested Risk Outputs

Store computed values:

- `derived_pulse_risk_level`
- `domain_signal_counts`
- `requested_support`
- `requires_review`
- `requires_urgent_follow_up`

Recommended risk values:

- `low`
- `moderate`
- `high`
- `critical`

## Workflow 3: Post-Incident Psychological Welfare

This should be medic-led and activated after a traumatic or clinically significant event.

### Key Fields

- `linked_incident_or_case_id`
- `worker_id`
- `worker_name_snapshot`
- `event_type`
- `event_datetime`
- `nature_of_exposure`
- `initial_defusing_offered`
- `normal_reactions_explained`
- `support_person_contacted`
- `eap_referral_offered`
- `external_psychology_referral_offered`
- `follow_up_scheduled_at`
- `confidentiality_acknowledged`
- `review_notes`
- `reviewed_by_user_id`
- `reviewed_by_name`

Recommended `event_type` values:

- `witnessed_serious_injury`
- `witnessed_death`
- `involved_in_cpr`
- `personally_injured`
- `serious_near_miss`
- `distressing_behavioural_incident`
- `other`

## Workflow 4: FIFO Psychological Risk Assessment

This is the higher-sensitivity workflow.

For the first design pass, treat it as a structured review path rather than automatically shipping validated diagnostic tools on day one.

Possible future structured sections:

- distress screening
- sleep / roster strain
- isolation / separation impacts
- alcohol / coping concerns
- support preference
- review escalation

If validated tools like `K10` or `PHQ-9` are used later, that decision should be explicitly approved by governance and reflected in privacy, escalation, and clinician workflow design.

## Module Submission Model

Recommended `module_submissions` usage:

- one case row per pulse / welfare event / assessment
- one payload with workflow-specific sections
- one review payload for medic / welfare follow-up

Recommended structure:

```json
{
  "workflow_type": "wellbeing_pulse",
  "worker_check_in": {},
  "computed_summary": {
    "derivedPulseRiskLevel": "moderate",
    "domainSignalCounts": {},
    "requestedSupport": true,
    "requiresReview": true
  },
  "review_payload": {}
}
```

## Export Rules

### Wellbeing Pulse

- pulse responses are not exported as individual worker forms
- pulse data is used for de-identified reporting only

### Psychosocial Support Check-In

- reviewed support check-ins are exportable if they form part of an actioned case
- support check-ins still contribute to grouped de-identified reporting

### Post-Incident Psychological Welfare

- exportable by default once reviewed

### FIFO Psychological Risk Assessment

- exportable if reviewed / actioned

High-consequence reviewed outcomes should strongly prompt export, similar to the fatigue pattern.

## Purge Rules

Psychosocial module forms should follow the same export-retention governance pattern as other PHI-bearing forms:

- export timestamp
- purge countdown
- purge audit log
- PHI wipe after retention window

## Superuser Reporting

Superuser reports should be:

- business-scoped
- site-filterable
- date-range filterable
- de-identified only
- small-cell suppressed

### Recommended Report Sections

1. `Psychosocial Hazard Domains`
- percent of workers with signals in each domain

2. `Support Signals`
- percent requesting counsellor or medic contact
- percent opening support check-ins

3. `Roster / FIFO Pressure`
- fatigue / sleep pressure signals
- isolation / roster strain signals

4. `Post-Incident Welfare`
- count of post-incident welfare forms
- follow-up scheduled rates
- referral offered rates

### Example Business-Ready Metrics

- `% showing elevated job demand / workload strain`
- `% showing fatigue / sleep pressure`
- `% reporting interpersonal conflict`
- `% reporting psychosocial safety concerns`
- `% indicating isolation or FIFO strain`
- `% opening support check-ins`
- `% support check-ins needing clinician / welfare review`

## Privacy / Governance Boundaries

- workers should never see business-level reporting
- businesses should never receive worker-identifiable psychosocial reports
- only superusers should be able to run business-level aggregated psychosocial reports
- medic review access must stay business/site scoped
- exports should require a reviewed case, not raw worker pulse data alone

## Recommended MVP

Build first:

1. `Wellbeing Pulse`
2. `Psychosocial Support Check-In`
3. business-configured reminder cadence
4. worker-anytime submission
5. superuser de-identified domain reporting

Then add:

6. `Post-Incident Psychological Welfare`

Then later:

7. `FIFO Psychological Risk Assessment`

## Why This Module Matters

- strong alignment with current mining-sector psychosocial risk expectations
- high business demand for measurable psychosocial risk metrics
- strong differentiation for MedGuard / MedPass
- powerful de-identified reporting story without exposing worker identities
