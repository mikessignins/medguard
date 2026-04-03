-- 025_add_fatigue_governance_retention.sql
-- Bring fatigue module submissions into the same purge/readiness governance path
-- as other exported PHI-bearing clinical forms.

drop view if exists public.purge_pipeline_health;

create view public.purge_pipeline_health
with (security_invoker = true) as
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
fatigue_backlog as (
  select
    count(*)::bigint as fatigue_waiting_purge
  from public.module_submissions ms
  where ms.module_key = 'fatigue_assessment'
    and ms.exported_at is not null
    and ms.phi_purged_at is null
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
  fatigue_backlog.fatigue_waiting_purge,
  (
    emergency_backlog.emergency_waiting_purge
    + med_backlog.med_waiting_purge
    + fatigue_backlog.fatigue_waiting_purge
  )::bigint as total_waiting_purge,
  cron.last_result
from cron
cross join emergency_backlog
cross join med_backlog
cross join fatigue_backlog;

comment on view public.purge_pipeline_health is
  'Operational status for purge cron + exported-not-yet-purged backlog counts across emergency, medication, and fatigue PHI-bearing forms.';
