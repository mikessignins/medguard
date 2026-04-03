begin;

create or replace function public.get_business_deidentified_psychosocial_hazard_report_filtered(
  p_business_id text,
  p_site_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_min_cohort integer default 5
)
returns table (
  metric_group text,
  display_order integer,
  metric_key text,
  metric_label text,
  affected_workers bigint,
  cohort_workers bigint,
  prevalence_percent numeric(6,2),
  is_suppressed boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_current_user_is_superuser();

  return query
  with filtered_submissions as (
    select
      ms.worker_id,
      ms.payload
    from public.module_submissions ms
    where ms.business_id = p_business_id
      and ms.module_key = 'psychosocial_health'
      and coalesce(ms.is_test, false) = false
      and ms.phi_purged_at is null
      and (p_site_id is null or ms.site_id = p_site_id)
      and (p_from is null or ms.submitted_at >= p_from)
      and (p_to is null or ms.submitted_at <= p_to)
  ),
  cohort as (
    select count(distinct fs.worker_id)::bigint as total_workers
    from filtered_submissions fs
    where fs.worker_id is not null
  ),
  worker_hazard_flags as (
    select distinct
      fs.worker_id,
      hazard.key as hazard_key
    from filtered_submissions fs
    cross join lateral (
      values
        ('high_job_demands'::text, 'High job demands'::text, 'Work Design & Organisation'::text, 1),
        ('low_job_demands', 'Low job demands', 'Work Design & Organisation', 2),
        ('low_job_control', 'Low job control', 'Work Design & Organisation', 3),
        ('poor_support', 'Poor support', 'Work Design & Organisation', 4),
        ('lack_of_role_clarity', 'Lack of role clarity', 'Work Design & Organisation', 5),
        ('poor_organisational_change_management', 'Poor organisational change management', 'Work Design & Organisation', 6),
        ('poor_organisational_justice', 'Poor organisational justice', 'Work Design & Organisation', 7),
        ('low_reward_and_recognition', 'Low reward and recognition', 'Work Design & Organisation', 8),
        ('job_insecurity', 'Job insecurity', 'Work Design & Organisation', 9),
        ('violence_and_aggression', 'Violence and aggression', 'Workplace Behaviours & Interactions', 10),
        ('bullying', 'Bullying', 'Workplace Behaviours & Interactions', 11),
        ('harassment_including_sexual_harassment', 'Harassment including sexual harassment', 'Workplace Behaviours & Interactions', 12),
        ('remote_or_isolated_work', 'Remote or isolated work', 'Environmental & Situational', 13),
        ('poor_physical_environment', 'Poor physical environment', 'Environmental & Situational', 14),
        ('traumatic_events_or_material', 'Traumatic events or material', 'Environmental & Situational', 15),
        ('fatigue', 'Fatigue', 'Additional', 16),
        ('intrusive_surveillance', 'Intrusive surveillance', 'Additional', 17)
    ) as hazard(key, label, metric_group, display_order)
    where fs.worker_id is not null
      and coalesce((fs.payload -> 'scoreSummary' -> 'domainSignalCounts' ->> hazard.key)::integer, 0) > 0
  ),
  metrics as (
    select
      hazard.metric_group,
      hazard.display_order,
      hazard.key as metric_key,
      hazard.label as metric_label,
      count(distinct whf.worker_id)::bigint as affected_workers
    from (
      values
        ('high_job_demands'::text, 'High job demands'::text, 'Work Design & Organisation'::text, 1),
        ('low_job_demands', 'Low job demands', 'Work Design & Organisation', 2),
        ('low_job_control', 'Low job control', 'Work Design & Organisation', 3),
        ('poor_support', 'Poor support', 'Work Design & Organisation', 4),
        ('lack_of_role_clarity', 'Lack of role clarity', 'Work Design & Organisation', 5),
        ('poor_organisational_change_management', 'Poor organisational change management', 'Work Design & Organisation', 6),
        ('poor_organisational_justice', 'Poor organisational justice', 'Work Design & Organisation', 7),
        ('low_reward_and_recognition', 'Low reward and recognition', 'Work Design & Organisation', 8),
        ('job_insecurity', 'Job insecurity', 'Work Design & Organisation', 9),
        ('violence_and_aggression', 'Violence and aggression', 'Workplace Behaviours & Interactions', 10),
        ('bullying', 'Bullying', 'Workplace Behaviours & Interactions', 11),
        ('harassment_including_sexual_harassment', 'Harassment including sexual harassment', 'Workplace Behaviours & Interactions', 12),
        ('remote_or_isolated_work', 'Remote or isolated work', 'Environmental & Situational', 13),
        ('poor_physical_environment', 'Poor physical environment', 'Environmental & Situational', 14),
        ('traumatic_events_or_material', 'Traumatic events or material', 'Environmental & Situational', 15),
        ('fatigue', 'Fatigue', 'Additional', 16),
        ('intrusive_surveillance', 'Intrusive surveillance', 'Additional', 17)
    ) as hazard(key, label, metric_group, display_order)
    left join worker_hazard_flags whf
      on whf.hazard_key = hazard.key
    group by hazard.metric_group, hazard.display_order, hazard.key, hazard.label
  )
  select
    m.metric_group,
    m.display_order,
    m.metric_key,
    m.metric_label,
    case when c.total_workers < greatest(p_min_cohort, 1) then null else m.affected_workers end as affected_workers,
    case when c.total_workers < greatest(p_min_cohort, 1) then null else c.total_workers end as cohort_workers,
    case
      when c.total_workers < greatest(p_min_cohort, 1) or c.total_workers = 0 then null
      else round((m.affected_workers::numeric * 100.0) / c.total_workers::numeric, 2)
    end as prevalence_percent,
    (c.total_workers < greatest(p_min_cohort, 1)) as is_suppressed
  from metrics m
  cross join cohort c
  order by m.display_order, m.metric_label;
end;
$function$;

create or replace function public.get_business_deidentified_psychosocial_summary_filtered(
  p_business_id text,
  p_site_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_min_cohort integer default 5
)
returns table (
  cohort_workers bigint,
  total_submissions bigint,
  wellbeing_pulse_count bigint,
  support_check_in_count bigint,
  post_incident_count bigint,
  post_incident_follow_up_rate numeric(6,2),
  post_incident_referral_rate numeric(6,2),
  is_suppressed boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_current_user_is_superuser();

  return query
  with filtered_submissions as (
    select
      ms.worker_id,
      case
        when ms.payload -> 'workerPulse' ->> 'workflowKind' is not null then ms.payload -> 'workerPulse' ->> 'workflowKind'
        when ms.payload ? 'postIncidentWelfare' then 'post_incident_psychological_welfare'
        else null
      end as workflow_kind,
      (ms.review_payload ->> 'followUpScheduledAt') is not null
        or (ms.payload -> 'postIncidentWelfare' ->> 'followUpScheduledAt') is not null as post_incident_follow_up,
      coalesce((ms.review_payload ->> 'eapReferralOffered')::boolean, false)
        or coalesce((ms.review_payload ->> 'externalPsychologyReferralOffered')::boolean, false)
        or coalesce((ms.payload -> 'postIncidentWelfare' ->> 'eapReferralOffered')::boolean, false)
        or coalesce((ms.payload -> 'postIncidentWelfare' ->> 'externalPsychologyReferralOffered')::boolean, false) as post_incident_referral
    from public.module_submissions ms
    where ms.business_id = p_business_id
      and ms.module_key = 'psychosocial_health'
      and coalesce(ms.is_test, false) = false
      and ms.phi_purged_at is null
      and (p_site_id is null or ms.site_id = p_site_id)
      and (p_from is null or ms.submitted_at >= p_from)
      and (p_to is null or ms.submitted_at <= p_to)
  ),
  totals as (
    select
      count(distinct fs.worker_id)::bigint as cohort_workers,
      count(*)::bigint as total_submissions,
      count(*) filter (where fs.workflow_kind = 'wellbeing_pulse')::bigint as wellbeing_pulse_count,
      count(*) filter (where fs.workflow_kind = 'support_check_in')::bigint as support_check_in_count,
      count(*) filter (where fs.workflow_kind = 'post_incident_psychological_welfare')::bigint as post_incident_count,
      count(*) filter (
        where fs.workflow_kind = 'post_incident_psychological_welfare'
          and fs.post_incident_follow_up
      )::bigint as post_incident_follow_up_count,
      count(*) filter (
        where fs.workflow_kind = 'post_incident_psychological_welfare'
          and fs.post_incident_referral
      )::bigint as post_incident_referral_count
    from filtered_submissions fs
    where fs.workflow_kind is not null
  )
  select
    case when t.cohort_workers < greatest(p_min_cohort, 1) then null else t.cohort_workers end as cohort_workers,
    case when t.cohort_workers < greatest(p_min_cohort, 1) then null else t.total_submissions end as total_submissions,
    case when t.cohort_workers < greatest(p_min_cohort, 1) then null else t.wellbeing_pulse_count end as wellbeing_pulse_count,
    case when t.cohort_workers < greatest(p_min_cohort, 1) then null else t.support_check_in_count end as support_check_in_count,
    case when t.cohort_workers < greatest(p_min_cohort, 1) then null else t.post_incident_count end as post_incident_count,
    case
      when t.cohort_workers < greatest(p_min_cohort, 1) or t.post_incident_count = 0 then null
      else round((t.post_incident_follow_up_count::numeric * 100.0) / t.post_incident_count::numeric, 2)
    end as post_incident_follow_up_rate,
    case
      when t.cohort_workers < greatest(p_min_cohort, 1) or t.post_incident_count = 0 then null
      else round((t.post_incident_referral_count::numeric * 100.0) / t.post_incident_count::numeric, 2)
    end as post_incident_referral_rate,
    (t.cohort_workers < greatest(p_min_cohort, 1)) as is_suppressed
  from totals t;
end;
$function$;

revoke all on function public.get_business_deidentified_psychosocial_hazard_report_filtered(text, text, timestamptz, timestamptz, integer) from public;
grant execute on function public.get_business_deidentified_psychosocial_hazard_report_filtered(text, text, timestamptz, timestamptz, integer) to authenticated;

revoke all on function public.get_business_deidentified_psychosocial_summary_filtered(text, text, timestamptz, timestamptz, integer) from public;
grant execute on function public.get_business_deidentified_psychosocial_summary_filtered(text, text, timestamptz, timestamptz, integer) to authenticated;

comment on function public.get_business_deidentified_psychosocial_hazard_report_filtered(text, text, timestamptz, timestamptz, integer) is
  'Superuser-only, business/site/date filtered de-identified psychosocial hazard metrics aggregated from psychosocial module submissions. Returns hazard-level prevalence without exposing row-level identifiable submissions.';

comment on function public.get_business_deidentified_psychosocial_summary_filtered(text, text, timestamptz, timestamptz, integer) is
  'Superuser-only, business/site/date filtered aggregate psychosocial workflow summary for pulse, support, and post-incident welfare submissions. Returns only de-identified counts and rates.';

commit;
