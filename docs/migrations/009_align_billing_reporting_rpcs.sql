begin;

drop function if exists public.get_business_submission_summary(text);
drop function if exists public.get_business_monthly_submission_counts(text);
drop function if exists public.get_business_site_submission_counts(text);

create or replace function public.get_business_submission_summary(p_business_id text)
returns table (
  total_billable bigint,
  emergency_count bigint,
  medication_count bigint,
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
  with emergency as (
    select s.status
    from public.submissions s
    where s.business_id = p_business_id
      and s.is_test = false
      and s.status <> 'Recalled'
  ),
  med_decs as (
    select md.id
    from public.medication_declarations md
    where md.business_id = p_business_id
      and md.is_test = false
  )
  select
    ((select count(*) from emergency) + (select count(*) from med_decs))::bigint as total_billable,
    (select count(*) from emergency)::bigint as emergency_count,
    (select count(*) from med_decs)::bigint as medication_count,
    (select count(*) from emergency where status = 'Approved')::bigint as approved_count,
    (select count(*) from emergency where status = 'Requires Follow-up')::bigint as follow_up_count,
    (select count(*) from emergency where status = 'In Review')::bigint as in_review_count;
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
  with billable_forms as (
    select s.submitted_at
    from public.submissions s
    where s.business_id = p_business_id
      and s.is_test = false
      and s.status <> 'Recalled'

    union all

    select md.submitted_at
    from public.medication_declarations md
    where md.business_id = p_business_id
      and md.is_test = false
  )
  select
    to_char(date_trunc('month', bf.submitted_at at time zone 'UTC'), 'YYYY-MM') as month,
    count(*)::bigint as count
  from billable_forms bf
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
  with billable_forms as (
    select s.site_id
    from public.submissions s
    where s.business_id = p_business_id
      and s.is_test = false
      and s.status <> 'Recalled'
      and s.site_id is not null

    union all

    select md.site_id
    from public.medication_declarations md
    where md.business_id = p_business_id
      and md.is_test = false
      and md.site_id is not null
  )
  select
    bf.site_id,
    count(*)::bigint as count
  from billable_forms bf
  group by bf.site_id
  order by bf.site_id;
end;
$function$;

commit;
