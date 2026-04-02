begin;

drop view if exists public.platform_metrics;
drop view if exists public.business_monthly_billables;

create view public.business_monthly_billables as
with billable_forms as (
  select
    s.business_id,
    date_trunc('month', s.submitted_at at time zone 'UTC')::date as bill_month
  from public.submissions s
  where s.is_test = false
    and s.status <> 'Recalled'

  union all

  select
    m.business_id,
    date_trunc('month', m.submitted_at at time zone 'UTC')::date as bill_month
  from public.medication_declarations m
  where m.is_test = false
)
select
  bf.business_id,
  bf.bill_month,
  count(*)::bigint as billable_forms
from billable_forms bf
group by bf.business_id, bf.bill_month;

comment on view public.business_monthly_billables is
  'Monthly billable form counts per business. Billables include non-test emergency submissions excluding Recalled, and non-test medication declarations.';

create view public.platform_metrics as
with
business_stats as (
  select
    count(*)::bigint as total_businesses,
    count(*) filter (where is_suspended)::bigint as suspended_businesses,
    count(*) filter (where not is_suspended)::bigint as active_businesses,
    count(*) filter (where trial_until is not null and trial_until > now())::bigint as businesses_in_trial,
    count(*) filter (where coalesce(nullif(logo_url_light, ''), nullif(logo_url_dark, ''), nullif(logo_url, '')) is not null)::bigint as businesses_with_logo
  from public.businesses
),
user_stats as (
  select
    count(*)::bigint as total_user_accounts,
    count(*) filter (where role = 'worker')::bigint as workers,
    count(*) filter (where role = 'medic')::bigint as medics,
    count(*) filter (where role = 'pending_medic')::bigint as pending_medics,
    count(*) filter (where role = 'admin')::bigint as admins,
    count(*) filter (where role = 'superuser')::bigint as superusers
  from public.user_accounts
),
site_stats as (
  select count(*)::bigint as total_sites
  from public.sites
),
submission_stats as (
  select
    count(*)::bigint as total_emergency_submissions,
    count(*) filter (where is_test = false and status <> 'Recalled')::bigint as billable_emergency_submissions
  from public.submissions
),
medication_stats as (
  select
    count(*)::bigint as total_medication_declarations,
    count(*) filter (where is_test = false)::bigint as billable_medication_declarations
  from public.medication_declarations
),
module_stats as (
  select
    count(*) filter (where bm.module_key = 'confidential_medication' and bm.enabled)::bigint as businesses_with_confidential_medication_module,
    count(*) filter (where bm.enabled)::bigint as total_enabled_business_modules
  from public.business_modules bm
),
monthly_billables as (
  select
    coalesce(sum(b.billable_forms) filter (where b.bill_month = date_trunc('month', now() at time zone 'UTC')::date), 0)::bigint as billable_forms_current_month,
    coalesce(sum(b.billable_forms) filter (where b.bill_month = (date_trunc('month', now() at time zone 'UTC')::date - interval '1 month')::date), 0)::bigint as billable_forms_previous_month
  from public.business_monthly_billables b
)
select
  now() as generated_at,
  b.total_businesses,
  b.active_businesses,
  b.suspended_businesses,
  b.businesses_in_trial,
  b.businesses_with_logo,
  s.total_sites,
  u.total_user_accounts,
  u.workers,
  u.medics,
  u.pending_medics,
  u.admins,
  u.superusers,
  sub.total_emergency_submissions,
  med.total_medication_declarations,
  sub.billable_emergency_submissions,
  med.billable_medication_declarations,
  (sub.billable_emergency_submissions + med.billable_medication_declarations) as total_billable_forms,
  mb.billable_forms_current_month,
  mb.billable_forms_previous_month,
  m.businesses_with_confidential_medication_module,
  m.total_enabled_business_modules
from business_stats b
cross join user_stats u
cross join site_stats s
cross join submission_stats sub
cross join medication_stats med
cross join module_stats m
cross join monthly_billables mb;

comment on view public.platform_metrics is
  'Module-aware aggregate platform metrics with billing totals and monthly billable form counts.';

commit;
