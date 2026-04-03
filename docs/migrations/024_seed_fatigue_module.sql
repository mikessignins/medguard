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
  'fatigue_assessment',
  'Fatigue Assessment',
  'custom',
  'active',
  true,
  'fatigue',
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
  'fatigue_assessment',
  false,
  jsonb_build_object(
    'workflow', 'worker_self_assessment_then_medic_review',
    'bill_on', 'medic_review_complete',
    'supports_worker_start', true,
    'supports_medic_review', true,
    'supports_superuser_reporting', true,
    'supports_pdf_export', true,
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
  'fatigue_assessment',
  1,
  $json$
  {
    "moduleKey": "fatigue_assessment",
    "title": "Fatigue Assessment",
    "stage": "worker_self_assessment",
    "sections": [
      {
        "key": "worker_context",
        "title": "Worker Context",
        "fields": [
          { "key": "assessment_context", "type": "enum", "required": true, "options": ["pre_shift", "during_shift", "post_shift", "journey_management", "peer_or_supervisor_concern", "other"] },
          { "key": "job_role", "type": "text", "required": true },
          { "key": "workgroup", "type": "text", "required": false },
          { "key": "roster_pattern", "type": "text", "required": false },
          { "key": "current_shift_start_at", "type": "datetime", "required": false },
          { "key": "planned_shift_end_at", "type": "datetime", "required": false },
          { "key": "driving_after_shift", "type": "boolean", "required": true },
          { "key": "commute_duration_minutes", "type": "integer", "required": false }
        ]
      },
      {
        "key": "sleep_and_alertness",
        "title": "Sleep And Alertness",
        "fields": [
          { "key": "sleep_hours_last_24h", "type": "decimal", "required": true, "min": 0, "max": 24 },
          { "key": "sleep_hours_last_48h", "type": "decimal", "required": true, "min": 0, "max": 48 },
          { "key": "hours_awake_by_end_of_shift", "type": "decimal", "required": true, "min": 0, "max": 48 },
          { "key": "alertness_rating", "type": "enum", "required": true, "options": ["a_active_alert_wide_awake", "b_functioning_well_not_peak", "c_ok_but_not_fully_alert", "d_groggy_hard_to_concentrate", "e_sleepy_would_like_to_lie_down"] }
        ]
      },
      {
        "key": "fatigue_risk_factors",
        "title": "Fatigue Risk Factors",
        "fields": [
          { "key": "alcohol_before_sleep_band", "type": "enum", "required": true, "options": ["none", "one_to_two", "three_to_four", "five_or_more"] },
          { "key": "drowsy_medication_or_substance", "type": "boolean", "required": true },
          { "key": "stress_or_health_issue_affecting_sleep_or_concentration", "type": "boolean", "required": true },
          { "key": "worker_comments", "type": "textarea", "required": false }
        ]
      }
    ],
    "computed": [
      "fatigue_score_total",
      "has_any_high_risk_answer",
      "derived_risk_level"
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
          "queueMedicReview": false
        },
        "medium": {
          "status": "awaiting_medic_review",
          "queueMedicReview": true
        },
        "high": {
          "status": "awaiting_medic_review",
          "queueMedicReview": true,
          "priority": "urgent"
        }
      }
    },
    "medicStage": {
      "enabled": true,
      "reviewPayloadSections": [
        "symptoms",
        "contributing_factors",
        "fit_for_work_decision",
        "transport_and_handover",
        "signatures"
      ],
      "finalStatuses": [
        "resolved"
      ]
    },
    "billing": {
      "billOn": "medic_review_complete",
      "nonBillableStatuses": [
        "worker_only_complete"
      ]
    },
    "export": {
      "enabled": true,
      "purgeRetentionDays": 7
    }
  }
  $json$::jsonb,
  'fatigue_assessment_v1',
  'active'
)
on conflict (module_key, version) do update
set
  form_schema = excluded.form_schema,
  workflow_schema = excluded.workflow_schema,
  pdf_template_key = excluded.pdf_template_key,
  status = excluded.status;

commit;
