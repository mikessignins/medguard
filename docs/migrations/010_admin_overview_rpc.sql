begin;

drop function if exists public.get_admin_business_overview(text);

create function public.get_admin_business_overview(p_business_id text)
returns table (
  worker_count bigint,
  medic_count bigint,
  pending_medic_count bigint,
  site_count bigint,
  declarations_this_month bigint,
  stale_forms bigint,
  purge_cron_last_run_at timestamptz,
  purge_cron_last_result text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_first_of_month timestamptz := date_trunc('month', now());
  v_stale_threshold timestamptz := now() - interval '24 hours';
begin
  perform public.assert_can_read_business_submission_metrics(p_business_id);

  return query
  with cron as (
    select chl.last_run_at, chl.last_result
    from public.cron_health_log chl
    where chl.cron_name = 'purge-exports'
    order by chl.last_run_at desc
    limit 1
  )
  select
    (select count(*) from public.user_accounts ua where ua.business_id = p_business_id and ua.role = 'worker')::bigint as worker_count,
    (select count(*) from public.user_accounts ua where ua.business_id = p_business_id and ua.role = 'medic')::bigint as medic_count,
    (select count(*) from public.user_accounts ua where ua.business_id = p_business_id and ua.role = 'pending_medic')::bigint as pending_medic_count,
    (select count(*) from public.sites s where s.business_id = p_business_id)::bigint as site_count,
    (select count(*) from public.submissions sub where sub.business_id = p_business_id and sub.submitted_at >= v_first_of_month)::bigint as declarations_this_month,
    (
      select count(*)
      from public.submissions sub
      where sub.business_id = p_business_id
        and sub.status in ('New', 'In Review')
        and sub.exported_at is null
        and sub.submitted_at < v_stale_threshold
    )::bigint as stale_forms,
    (select cron.last_run_at from cron) as purge_cron_last_run_at,
    (select cron.last_result from cron) as purge_cron_last_result;
end;
$function$;

revoke all on function public.get_admin_business_overview(text) from public;
grant execute on function public.get_admin_business_overview(text) to authenticated;

commit;
