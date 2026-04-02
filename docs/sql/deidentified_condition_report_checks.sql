-- Run after migration 020_superuser_deidentified_condition_reporting.sql
-- Replace business id as needed.

-- 1) Baseline report (all time for business)
select *
from public.get_business_deidentified_condition_prevalence(
  p_business_id := 'mineralresources'
);

-- 2) Month-bounded report
select *
from public.get_business_deidentified_condition_prevalence(
  p_business_id := 'mineralresources',
  p_from := '2026-04-01T00:00:00Z'::timestamptz,
  p_to := '2026-04-30T23:59:59Z'::timestamptz
);

-- 3) Suppression test: force suppression with a high threshold
select *
from public.get_business_deidentified_condition_prevalence(
  p_business_id := 'mineralresources',
  p_min_cohort := 999
);
