select
  m.key,
  m.name,
  m.category,
  m.is_billable,
  m.billing_category,
  m.current_version,
  mfv.status as form_status
from public.modules m
left join public.module_form_versions mfv
  on mfv.module_key = m.key
 and mfv.version = m.current_version
where m.key = 'fatigue_assessment';

select
  bm.business_id,
  bm.enabled,
  bm.config
from public.business_modules bm
where bm.module_key = 'fatigue_assessment'
order by bm.business_id;
