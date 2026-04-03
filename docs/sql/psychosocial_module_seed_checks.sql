select
  m.key,
  m.name,
  m.category,
  m.is_billable,
  m.billing_category,
  m.current_version,
  mfv.status as form_status,
  mfv.pdf_template_key
from public.modules m
left join public.module_form_versions mfv
  on mfv.module_key = m.key
 and mfv.version = m.current_version
where m.key = 'psychosocial_health';

select
  bm.business_id,
  bm.enabled,
  bm.config
from public.business_modules bm
where bm.module_key = 'psychosocial_health'
order by bm.business_id;
