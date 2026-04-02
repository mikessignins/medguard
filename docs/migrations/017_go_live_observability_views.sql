-- 017_go_live_observability_views.sql
-- Go-live operational readiness helpers.
-- Non-destructive: creates monitoring-only views.

create or replace view public.business_current_month_billables as
select
  bmb.business_id,
  b.name as business_name,
  bmb.bill_month,
  bmb.billable_forms
from public.business_monthly_billables bmb
join public.businesses b
  on b.id = bmb.business_id
where bmb.bill_month = date_trunc('month', timezone('utc', now()))::date;

comment on view public.business_current_month_billables is
  'Current UTC-month billable forms per business (single billing source: business_monthly_billables).';

create or replace view public.purge_pipeline_health as
with emergency_backlog as (
  select
    count(*)::bigint as emergency_waiting_purge
  from public.submissions s
  where s.exported_at is not null
    and s.phi_purged_at is null
    and s.status <> 'Recalled'
),
med_backlog as (
  select
    count(*)::bigint as med_waiting_purge
  from public.medication_declarations md
  where md.exported_at is not null
    and md.phi_purged_at is null
),
cron as (
  select
    c.last_run_at,
    c.last_result
  from public.cron_health_log c
  where c.cron_name = 'purge-exports'
)
select
  timezone('utc', now()) as checked_at,
  cron.last_run_at,
  case
    when cron.last_run_at is null then 'missing'
    when timezone('utc', now()) - cron.last_run_at > interval '25 hours' then 'stale'
    else 'healthy'
  end as cron_status,
  emergency_backlog.emergency_waiting_purge,
  med_backlog.med_waiting_purge,
  (emergency_backlog.emergency_waiting_purge + med_backlog.med_waiting_purge)::bigint as total_waiting_purge,
  cron.last_result
from cron
cross join emergency_backlog
cross join med_backlog;

comment on view public.purge_pipeline_health is
  'Operational status for purge cron + exported-not-yet-purged backlog counts.';
