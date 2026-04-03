-- fatigue_governance_checks.sql
-- Run after 025_add_fatigue_governance_retention.sql

-- 1) Purge health view now includes fatigue backlog.
select *
from public.purge_pipeline_health;

-- 2) Any exported fatigue assessments still awaiting purge.
select
  id,
  business_id,
  site_id,
  status,
  exported_at,
  reviewed_at,
  phi_purged_at
from public.module_submissions
where module_key = 'fatigue_assessment'
  and exported_at is not null
order by exported_at desc;
