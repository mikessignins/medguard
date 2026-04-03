-- Run after migration 023_business_ready_deidentified_health_reports.sql

select *
from public.get_business_deidentified_health_report_filtered(
  p_business_id := 'mineralresources'
);

select *
from public.get_business_deidentified_health_report_filtered(
  p_business_id := 'mineralresources',
  p_site_id := 'walters-drive',
  p_min_cohort := 1
);
