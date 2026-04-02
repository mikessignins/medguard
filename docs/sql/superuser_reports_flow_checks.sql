-- Run after migration 022_site_filtered_deidentified_reporting.sql

-- 1) All sites, all time
select *
from public.get_business_deidentified_condition_prevalence_filtered(
  p_business_id := 'mineralresources'
);

-- 2) Specific site, bounded date range
select *
from public.get_business_deidentified_condition_prevalence_filtered(
  p_business_id := 'mineralresources',
  p_site_id := 'walters-drive',
  p_from := '2026-03-01T00:00:00Z'::timestamptz,
  p_to := '2026-04-30T23:59:59Z'::timestamptz
);
