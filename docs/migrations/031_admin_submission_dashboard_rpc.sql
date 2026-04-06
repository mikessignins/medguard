begin;

drop function if exists public.get_admin_submission_dashboard(text);

create function public.get_admin_submission_dashboard(p_business_id text)
returns table (
  emergency_new_count bigint,
  emergency_in_review_count bigint,
  emergency_approved_count bigint,
  emergency_follow_up_count bigint,
  emergency_total_actioned bigint,
  emergency_monthly_rows jsonb,
  emergency_site_rows jsonb,
  medication_pending_count bigint,
  medication_in_review_count bigint,
  medication_reviewed_count bigint,
  medication_total_visible bigint,
  medication_monthly_rows jsonb,
  medication_site_rows jsonb
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_can_read_business_submission_metrics(p_business_id);

  return query
  with emergency_base as (
    select s.status, s.site_id, s.submitted_at
    from public.submissions s
    where s.business_id = p_business_id
      and s.status <> 'Recalled'
  ),
  emergency_actioned as (
    select *
    from emergency_base
    where status in ('In Review', 'Approved', 'Requires Follow-up')
  ),
  emergency_monthly as (
    select
      to_char(date_trunc('month', submitted_at at time zone 'UTC'), 'YYYY-MM') as month,
      count(*)::bigint as value
    from emergency_actioned
    group by 1
    order by 1 desc
  ),
  emergency_site as (
    select site_id, count(*)::bigint as value
    from emergency_actioned
    group by site_id
    order by value desc, site_id
  ),
  medication_base as (
    select md.medic_review_status, md.site_id, md.submitted_at
    from public.medication_declarations md
    where md.business_id = p_business_id
  ),
  medication_monthly as (
    select
      to_char(date_trunc('month', submitted_at at time zone 'UTC'), 'YYYY-MM') as month,
      count(*)::bigint as value
    from medication_base
    group by 1
    order by 1 desc
  ),
  medication_site as (
    select site_id, count(*)::bigint as value
    from medication_base
    group by site_id
    order by value desc, site_id
  )
  select
    (select count(*) from emergency_base where status = 'New')::bigint,
    (select count(*) from emergency_base where status = 'In Review')::bigint,
    (select count(*) from emergency_base where status = 'Approved')::bigint,
    (select count(*) from emergency_base where status = 'Requires Follow-up')::bigint,
    (select count(*) from emergency_actioned)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('label', month, 'value', value)) from emergency_monthly), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('site_id', site_id, 'value', value)) from emergency_site), '[]'::jsonb),
    (select count(*) from medication_base where medic_review_status is null or medic_review_status = 'Pending')::bigint,
    (select count(*) from medication_base where medic_review_status = 'In Review')::bigint,
    (select count(*) from medication_base where medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work'))::bigint,
    (select count(*) from medication_base)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('label', month, 'value', value)) from medication_monthly), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('site_id', site_id, 'value', value)) from medication_site), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_admin_submission_dashboard(text) from public;
grant execute on function public.get_admin_submission_dashboard(text) to authenticated;

commit;
