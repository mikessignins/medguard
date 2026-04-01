begin;

create or replace function public.assert_can_read_business_submission_metrics(p_business_id text)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and (
        ua.role = 'superuser'
        or (ua.role = 'admin' and ua.business_id = p_business_id)
      )
  ) then
    raise exception 'not authorized to read business submission metrics'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.get_business_submission_summary(p_business_id text)
returns table (
  total_actioned bigint,
  approved_count bigint,
  follow_up_count bigint,
  in_review_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_can_read_business_submission_metrics(p_business_id);

  return query
  select
    count(*) filter (where s.status in ('In Review', 'Approved', 'Requires Follow-up'))::bigint as total_actioned,
    count(*) filter (where s.status = 'Approved')::bigint as approved_count,
    count(*) filter (where s.status = 'Requires Follow-up')::bigint as follow_up_count,
    count(*) filter (where s.status = 'In Review')::bigint as in_review_count
  from public.submissions s
  where s.business_id = p_business_id;
end;
$function$;

create or replace function public.get_business_monthly_submission_counts(p_business_id text)
returns table (
  month text,
  count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_can_read_business_submission_metrics(p_business_id);

  return query
  select
    to_char(date_trunc('month', s.submitted_at at time zone 'UTC'), 'YYYY-MM') as month,
    count(*)::bigint as count
  from public.submissions s
  where s.business_id = p_business_id
    and s.status in ('In Review', 'Approved', 'Requires Follow-up')
  group by 1
  order by 1 desc;
end;
$function$;

create or replace function public.get_business_site_submission_counts(p_business_id text)
returns table (
  site_id text,
  count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_can_read_business_submission_metrics(p_business_id);

  return query
  select
    s.site_id,
    count(*)::bigint as count
  from public.submissions s
  where s.business_id = p_business_id
    and s.status in ('In Review', 'Approved', 'Requires Follow-up')
  group by s.site_id
  order by s.site_id;
end;
$function$;

revoke all on function public.assert_can_read_business_submission_metrics(text) from public;
revoke all on function public.get_business_submission_summary(text) from public;
revoke all on function public.get_business_monthly_submission_counts(text) from public;
revoke all on function public.get_business_site_submission_counts(text) from public;

grant execute on function public.assert_can_read_business_submission_metrics(text) to authenticated;
grant execute on function public.get_business_submission_summary(text) to authenticated;
grant execute on function public.get_business_monthly_submission_counts(text) to authenticated;
grant execute on function public.get_business_site_submission_counts(text) to authenticated;

commit;
