begin;

insert into public.modules (
  key,
  name,
  category,
  status,
  is_billable,
  billing_category,
  current_version
)
values (
  'psychosocial_health',
  'Psychosocial Health & Wellbeing',
  'custom',
  'active',
  true,
  'psychosocial',
  1
)
on conflict (key) do update
set
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  is_billable = excluded.is_billable,
  billing_category = excluded.billing_category,
  current_version = excluded.current_version;

insert into public.business_modules (
  business_id,
  module_key,
  enabled,
  config,
  enabled_at,
  disabled_at
)
select
  b.id,
  'psychosocial_health',
  false,
  jsonb_build_object(
    'workflow', 'worker_anytime_pulse_with_review_escalation',
    'bill_on', 'review_complete_if_enabled',
    'supports_worker_start', true,
    'supports_medic_review', true,
    'supports_superuser_reporting', true,
    'supports_pdf_export', true,
    'allow_anytime_submission', true,
    'reminder_enabled', true,
    'cadence', 'fortnightly',
    'interval_days', null,
    'escalation_contact_mode', 'medic_or_welfare_queue',
    'high_risk_auto_queue', true,
    'critical_risk_immediate_guidance', true,
    'default_export_retention_days', 7
  ),
  now(),
  now()
from public.businesses b
on conflict (business_id, module_key) do update
set
  config = excluded.config,
  enabled_at = case
    when public.business_modules.enabled then public.business_modules.enabled_at
    else coalesce(public.business_modules.enabled_at, excluded.enabled_at)
  end,
  disabled_at = case
    when public.business_modules.enabled then null
    else coalesce(public.business_modules.disabled_at, excluded.disabled_at, now())
  end;

insert into public.module_form_versions (
  module_key,
  version,
  form_schema,
  workflow_schema,
  pdf_template_key,
  status
)
values (
  'psychosocial_health',
  1,
  $json$
  {
    "moduleKey": "psychosocial_health",
    "title": "Wellbeing Pulse",
    "stage": "worker_self_check_in",
    "workflowType": "wellbeing_pulse",
    "sections": [
      {
        "key": "worker_context",
        "title": "Context",
        "fields": [
          { "key": "submission_context", "type": "enum", "required": true, "options": ["scheduled_check_in", "self_initiated_check_in", "post_shift_concern", "manager_or_peer_prompted", "post_incident_follow_up"] },
          { "key": "job_role", "type": "text", "required": true },
          { "key": "workgroup", "type": "text", "required": false },
          { "key": "roster_pattern", "type": "text", "required": false },
          { "key": "is_fifo_worker", "type": "boolean", "required": true }
        ]
      },
      {
        "key": "core_pulse",
        "title": "Wellbeing Pulse",
        "fields": [
          { "key": "mood_rating", "type": "scale", "required": true, "min": 1, "max": 5, "labelMin": "Very low", "labelMax": "Very good" },
          { "key": "stress_rating", "type": "scale", "required": true, "min": 1, "max": 5, "labelMin": "Very low", "labelMax": "Very high" },
          { "key": "sleep_quality_on_roster", "type": "scale", "required": true, "min": 1, "max": 5, "labelMin": "Very poor", "labelMax": "Very good" },
          { "key": "feeling_overwhelmed_by_work_demands", "type": "enum", "required": true, "options": ["not_at_all", "a_little", "sometimes", "often", "very_often"] },
          { "key": "feeling_under_used_or_disengaged", "type": "enum", "required": true, "options": ["not_at_all", "a_little", "sometimes", "often", "very_often"] },
          { "key": "feeling_able_to_control_work", "type": "enum", "required": true, "options": ["always", "mostly", "sometimes", "rarely", "never"] },
          { "key": "feeling_supported_by_supervisor_or_team", "type": "enum", "required": true, "options": ["always", "mostly", "sometimes", "rarely", "never"] },
          { "key": "role_and_expectations_are_clear", "type": "enum", "required": true, "options": ["always", "mostly", "sometimes", "rarely", "never"] },
          { "key": "concern_about_unfair_treatment_or_poor_communication", "type": "boolean", "required": true },
          { "key": "recent_interpersonal_conflict_or_inappropriate_behaviour", "type": "boolean", "required": true },
          { "key": "feeling_isolated_due_to_remote_or_fifo_work", "type": "boolean", "required": true },
          { "key": "physical_environment_affecting_wellbeing", "type": "boolean", "required": true },
          { "key": "exposed_to_distressing_or_traumatic_event", "type": "boolean", "required": true },
          { "key": "concern_about_roster_or_fatigue_pressure", "type": "boolean", "required": true },
          { "key": "concern_about_monitoring_or_surveillance_pressure", "type": "boolean", "required": true },
          { "key": "would_like_support_contact", "type": "enum", "required": true, "options": ["no", "maybe", "yes"] },
          { "key": "worker_comments", "type": "textarea", "required": false }
        ]
      },
      {
        "key": "hazard_clarifiers",
        "title": "Optional Clarifiers",
        "fields": [
          { "key": "high_job_demands_detail", "type": "boolean", "required": false, "showWhen": { "field": "feeling_overwhelmed_by_work_demands", "in": ["sometimes", "often", "very_often"] } },
          { "key": "low_job_demands_detail", "type": "boolean", "required": false, "showWhen": { "field": "feeling_under_used_or_disengaged", "in": ["sometimes", "often", "very_often"] } },
          { "key": "low_job_control_detail", "type": "boolean", "required": false, "showWhen": { "field": "feeling_able_to_control_work", "in": ["rarely", "never"] } },
          { "key": "poor_support_detail", "type": "boolean", "required": false, "showWhen": { "field": "feeling_supported_by_supervisor_or_team", "in": ["rarely", "never"] } },
          { "key": "lack_of_role_clarity_detail", "type": "boolean", "required": false, "showWhen": { "field": "role_and_expectations_are_clear", "in": ["rarely", "never"] } },
          { "key": "poor_change_management_detail", "type": "boolean", "required": false, "showWhen": { "field": "concern_about_unfair_treatment_or_poor_communication", "equals": true } },
          { "key": "poor_organisational_justice_detail", "type": "boolean", "required": false, "showWhen": { "field": "concern_about_unfair_treatment_or_poor_communication", "equals": true } },
          { "key": "low_reward_and_recognition_detail", "type": "boolean", "required": false, "showWhen": { "field": "concern_about_unfair_treatment_or_poor_communication", "equals": true } },
          { "key": "job_insecurity_detail", "type": "boolean", "required": false, "showWhen": { "field": "concern_about_unfair_treatment_or_poor_communication", "equals": true } },
          { "key": "violence_and_aggression_detail", "type": "boolean", "required": false, "showWhen": { "field": "recent_interpersonal_conflict_or_inappropriate_behaviour", "equals": true } },
          { "key": "bullying_detail", "type": "boolean", "required": false, "showWhen": { "field": "recent_interpersonal_conflict_or_inappropriate_behaviour", "equals": true } },
          { "key": "harassment_detail", "type": "boolean", "required": false, "showWhen": { "field": "recent_interpersonal_conflict_or_inappropriate_behaviour", "equals": true } },
          { "key": "remote_or_isolated_work_detail", "type": "boolean", "required": false, "showWhen": { "field": "feeling_isolated_due_to_remote_or_fifo_work", "equals": true } },
          { "key": "poor_physical_environment_detail", "type": "boolean", "required": false, "showWhen": { "field": "physical_environment_affecting_wellbeing", "equals": true } },
          { "key": "traumatic_events_or_material_detail", "type": "boolean", "required": false, "showWhen": { "field": "exposed_to_distressing_or_traumatic_event", "equals": true } },
          { "key": "fatigue_detail", "type": "boolean", "required": false, "showWhen": { "field": "concern_about_roster_or_fatigue_pressure", "equals": true } },
          { "key": "intrusive_surveillance_detail", "type": "boolean", "required": false, "showWhen": { "field": "concern_about_monitoring_or_surveillance_pressure", "equals": true } }
        ]
      },
      {
        "key": "support_and_safety",
        "title": "Support",
        "fields": [
          { "key": "comfortable_speaking_to_medic", "type": "boolean", "required": true },
          { "key": "comfortable_speaking_to_counsellor", "type": "boolean", "required": true },
          { "key": "would_like_urgent_contact_today", "type": "boolean", "required": false },
          { "key": "feels_unsafe_at_work_today", "type": "boolean", "required": false }
        ]
      }
    ],
    "computed": [
      "derived_pulse_risk_level",
      "domain_signal_counts",
      "requested_support",
      "requires_review",
      "requires_urgent_follow_up"
    ],
    "reportingDomains": [
      "high_job_demands",
      "low_job_demands",
      "low_job_control",
      "poor_support",
      "lack_of_role_clarity",
      "poor_organisational_change_management",
      "poor_organisational_justice",
      "low_reward_and_recognition",
      "job_insecurity",
      "violence_and_aggression",
      "bullying",
      "harassment_including_sexual_harassment",
      "remote_or_isolated_work",
      "poor_physical_environment",
      "traumatic_events_or_material",
      "fatigue",
      "intrusive_surveillance"
    ]
  }
  $json$::jsonb,
  $json$
  {
    "workerStage": {
      "initialStatus": "worker_only_complete",
      "riskOutcomes": {
        "low": {
          "status": "worker_only_complete",
          "queueReview": false
        },
        "moderate": {
          "status": "review_recommended",
          "queueReviewIfConfigEnabled": true
        },
        "high": {
          "status": "awaiting_medic_review",
          "queueReview": true
        },
        "critical": {
          "status": "awaiting_medic_review",
          "queueReview": true,
          "priority": "urgent",
          "showImmediateGuidance": true
        }
      }
    },
    "reviewStage": {
      "enabled": true,
      "reviewTypes": [
        "medic_review",
        "welfare_review"
      ],
      "reviewPayloadSections": [
        "initial_contact",
        "support_actions",
        "referrals",
        "follow_up_plan",
        "review_notes"
      ],
      "finalStatuses": [
        "resolved"
      ]
    },
    "billing": {
      "billOn": "review_complete_if_enabled",
      "nonBillableStatuses": [
        "worker_only_complete",
        "review_recommended"
      ]
    },
    "export": {
      "enabled": true,
      "onlyReviewedCases": true,
      "purgeRetentionDays": 7
    }
  }
  $json$::jsonb,
  'psychosocial_wellbeing_pulse_v1',
  'active'
)
on conflict (module_key, version) do update
set
  form_schema = excluded.form_schema,
  workflow_schema = excluded.workflow_schema,
  pdf_template_key = excluded.pdf_template_key,
  status = excluded.status;

commit;
