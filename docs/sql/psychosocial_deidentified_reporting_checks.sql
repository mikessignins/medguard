-- Run after migration 027_psychosocial_deidentified_reporting.sql

select *
from public.get_business_deidentified_psychosocial_hazard_report_filtered(
  'riotinto',
  null,
  null,
  null
);

select *
from public.get_business_deidentified_psychosocial_summary_filtered(
  'riotinto',
  null,
  null,
  null
);
