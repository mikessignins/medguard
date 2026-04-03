begin;

create or replace function public.get_business_deidentified_health_report_filtered(
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
      lower(coalesce(lws.worker_snapshot ->> 'adrenalineDeviceType', '')) = 'no' as anaphylaxis_without_device,
      coalesce((lws.worker_snapshot ->> 'interpreterRequired')::boolean, false) as interpreter_support,
      coalesce((lws.worker_snapshot ->> 'noEmergencyContactAcknowledged')::boolean, false) as no_emergency_contact,
      coalesce((lws.worker_snapshot ->> 'hasHearingLoss')::boolean, false) as hearing_loss,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,highBloodPressure,answer}')::boolean, false) as hypertension,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,mentalHealth,answer}')::boolean, false) as mental_health,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,diabetes,answer}')::boolean, false) as diabetes,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,angina,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,cardiacArrest,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,cardiacStent,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,strokeOrTIA,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,highBloodPressure,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,irregularHeartbeat,answer}')::boolean, false)
      ) as cardiovascular,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,respiratoryDisease,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,sleepApnoea,answer}')::boolean, false)
      ) as respiratory,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,sleepApnoea,answer}')::boolean, false) as sleep_apnoea,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,epilepsyOrSeizures,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,vertigo,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,strokeOrTIA,answer}')::boolean, false)
      ) as neurological,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,epilepsyOrSeizures,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,vertigo,answer}')::boolean, false)
      ) as sudden_incapacity_signal,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,backPain,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,jointOrBoneDisease,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,musculoskeletalDisorders,answer}')::boolean, false)
      ) as musculoskeletal,
      coalesce((lws.worker_snapshot #>> '{conditionChecklist,bloodBorneDiseases,answer}')::boolean, false) as blood_borne_or_haematological,
      jsonb_array_length(coalesce(lws.worker_snapshot -> 'bloodBorneVirusTypes', '[]'::jsonb)) > 0 as blood_borne_virus_disclosure,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,bloodBorneDiseases,answer}')::boolean, false)
        or jsonb_array_length(coalesce(lws.worker_snapshot -> 'bloodBorneVirusTypes', '[]'::jsonb)) > 0
      ) as immune_or_infectious_signal,
      (
        coalesce((lws.worker_snapshot #>> '{conditionChecklist,majorSurgery,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,seriousInjury,answer}')::boolean, false)
        or coalesce((lws.worker_snapshot #>> '{conditionChecklist,cardiacStent,answer}')::boolean, false)
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
    select
      'Emergency Planning'::text as metric_group,
      10 as display_order,
      'anaphylaxis_risk'::text as metric_key,
      'Anaphylaxis risk'::text as metric_label,
      count(*) filter (where wf.anaphylaxis_risk)::bigint as affected_workers
    from worker_flags wf
    union all select 'Emergency Planning', 20, 'anaphylaxis_without_device', 'Anaphylaxis risk with no adrenaline device recorded', count(*) filter (where wf.anaphylaxis_risk and wf.anaphylaxis_without_device)::bigint from worker_flags wf
    union all select 'Emergency Planning', 30, 'flagged_medication', 'Medication requiring drug screen / clinical review', count(*) filter (where wf.flagged_medication)::bigint from worker_flags wf
    union all select 'Emergency Planning', 40, 'sudden_incapacity_signal', 'Condition with sudden incapacity signal', count(*) filter (where wf.sudden_incapacity_signal)::bigint from worker_flags wf
    union all select 'Emergency Planning', 50, 'interpreter_support', 'Interpreter support required', count(*) filter (where wf.interpreter_support)::bigint from worker_flags wf
    union all select 'Emergency Planning', 60, 'no_emergency_contact', 'No emergency contact recorded', count(*) filter (where wf.no_emergency_contact)::bigint from worker_flags wf
    union all select 'Emergency Planning', 70, 'hearing_loss', 'Hearing loss disclosed', count(*) filter (where wf.hearing_loss)::bigint from worker_flags wf

    union all select 'Condition Prevalence', 110, 'cardiovascular', 'Cardiovascular conditions', count(*) filter (where wf.cardiovascular)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 120, 'hypertension', 'Hypertension', count(*) filter (where wf.hypertension)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 130, 'respiratory', 'Respiratory conditions', count(*) filter (where wf.respiratory)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 140, 'sleep_apnoea', 'Sleep apnoea', count(*) filter (where wf.sleep_apnoea)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 150, 'diabetes', 'Diabetes', count(*) filter (where wf.diabetes)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 160, 'neurological', 'Neurological conditions', count(*) filter (where wf.neurological)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 170, 'mental_health', 'Mental health conditions', count(*) filter (where wf.mental_health)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 180, 'musculoskeletal', 'Musculoskeletal conditions', count(*) filter (where wf.musculoskeletal)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 190, 'blood_borne_or_haematological', 'Haematological or blood-borne condition signal', count(*) filter (where wf.blood_borne_or_haematological)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 200, 'blood_borne_virus_disclosure', 'Specific blood-borne virus disclosure recorded', count(*) filter (where wf.blood_borne_virus_disclosure)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 210, 'immune_or_infectious_signal', 'Immune or infectious signal', count(*) filter (where wf.immune_or_infectious_signal)::bigint from worker_flags wf
    union all select 'Condition Prevalence', 220, 'surgical_or_implants_signal', 'Surgical / implant signal', count(*) filter (where wf.surgical_or_implants_signal)::bigint from worker_flags wf
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

revoke all on function public.get_business_deidentified_health_report_filtered(text, text, timestamptz, timestamptz, integer) from public;
grant execute on function public.get_business_deidentified_health_report_filtered(text, text, timestamptz, timestamptz, integer) to authenticated;

comment on function public.get_business_deidentified_health_report_filtered(text, text, timestamptz, timestamptz, integer) is
  'Superuser-only, business/site/date filtered de-identified health report metrics using latest non-test emergency declaration snapshot per worker. Includes emergency planning and condition prevalence groupings, with suppression below minimum cohort threshold.';

commit;
