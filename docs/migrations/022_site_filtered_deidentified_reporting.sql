begin;

create or replace function public.get_business_deidentified_condition_prevalence_filtered(
  p_business_id text,
  p_site_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_min_cohort integer default 5
)
returns table (
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
  with latest_worker_snapshot as (
    select distinct on (s.worker_id)
      s.worker_id,
      s.worker_snapshot
    from public.submissions s
    where s.business_id = p_business_id
      and s.worker_id is not null
      and s.worker_snapshot is not null
      and s.is_test = false
      and s.status <> 'Recalled'
      and (p_site_id is null or s.site_id = p_site_id)
      and (p_from is null or s.submitted_at >= p_from)
      and (p_to is null or s.submitted_at <= p_to)
    order by s.worker_id, s.submitted_at desc
  ),
  worker_flags as (
    select
      lws.worker_id,
      coalesce((lws.worker_snapshot ->> 'anaphylactic')::boolean, false) as anaphylaxis_risk,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,highBloodPressure,answer}')::boolean, false) as hypertension,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,mentalHealth,answer}')::boolean, false) as mental_health,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,diabetes,answer}')::boolean, false) as diabetes,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,angina,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,cardiacArrest,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,strokeOrTIA,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,highBloodPressure,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,irregularHeartbeat,answer}')::boolean, false)
      ) as cardiovascular,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,respiratoryDisease,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,sleepApnoea,answer}')::boolean, false)
      ) as respiratory,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,epilepsyOrSeizures,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,vertigo,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,strokeOrTIA,answer}')::boolean, false)
      ) as neurological,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,backPain,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,jointOrBoneDisease,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,musculoskeletalDisorders,answer}')::boolean, false)
      ) as musculoskeletal,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,bloodBorneDiseases,answer}')::boolean, false) as haematological_or_blood_borne,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,bloodBorneDiseases,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,respiratoryDisease,answer}')::boolean, false)
      ) as immune_or_infectious_signal,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,majorSurgery,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,seriousInjury,answer}')::boolean, false)
      ) as surgical_or_implants_signal,
      exists (
        select 1
        from jsonb_array_elements(coalesce(lws.worker_snapshot -> 'currentMedications', '[]'::jsonb)) as med
        where lower(coalesce(med ->> 'reviewFlag', 'none')) <> 'none'
      ) as flagged_medication
    from latest_worker_snapshot lws
  ),
  cohort as (
    select count(*)::bigint as total_workers
    from worker_flags
  ),
  metrics as (
    select 'hypertension'::text as metric_key, 'Hypertension'::text as metric_label,
      count(*) filter (where wf.hypertension)::bigint as affected_workers
    from worker_flags wf
    union all
    select 'mental_health', 'Mental Health Conditions',
      count(*) filter (where wf.mental_health)::bigint
    from worker_flags wf
    union all
    select 'diabetes', 'Diabetes',
      count(*) filter (where wf.diabetes)::bigint
    from worker_flags wf
    union all
    select 'anaphylaxis_risk', 'Anaphylaxis Risk',
      count(*) filter (where wf.anaphylaxis_risk)::bigint
    from worker_flags wf
    union all
    select 'flagged_medication', 'Flagged Medication (Drug Screen/Clinical Review)',
      count(*) filter (where wf.flagged_medication)::bigint
    from worker_flags wf
    union all
    select 'cardiovascular', 'Cardiovascular Conditions',
      count(*) filter (where wf.cardiovascular)::bigint
    from worker_flags wf
    union all
    select 'respiratory', 'Respiratory Conditions',
      count(*) filter (where wf.respiratory)::bigint
    from worker_flags wf
    union all
    select 'neurological', 'Neurological Conditions',
      count(*) filter (where wf.neurological)::bigint
    from worker_flags wf
    union all
    select 'musculoskeletal', 'Musculoskeletal Conditions',
      count(*) filter (where wf.musculoskeletal)::bigint
    from worker_flags wf
    union all
    select 'haematological_or_blood_borne', 'Haematological/Blood-Borne Conditions',
      count(*) filter (where wf.haematological_or_blood_borne)::bigint
    from worker_flags wf
    union all
    select 'immune_or_infectious_signal', 'Immune/Infectious Signal',
      count(*) filter (where wf.immune_or_infectious_signal)::bigint
    from worker_flags wf
    union all
    select 'surgical_or_implants_signal', 'Surgical/Implants Signal',
      count(*) filter (where wf.surgical_or_implants_signal)::bigint
    from worker_flags wf
  )
  select
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
  order by m.metric_label;
end;
$function$;

revoke all on function public.get_business_deidentified_condition_prevalence_filtered(text, text, timestamptz, timestamptz, integer) from public;
grant execute on function public.get_business_deidentified_condition_prevalence_filtered(text, text, timestamptz, timestamptz, integer) to authenticated;

comment on function public.get_business_deidentified_condition_prevalence_filtered(text, text, timestamptz, timestamptz, integer) is
  'Superuser-only, business/site/date filtered de-identified worker condition prevalence metrics using latest non-test emergency declaration snapshot per worker. Suppresses metrics when cohort size is below threshold.';

commit;
