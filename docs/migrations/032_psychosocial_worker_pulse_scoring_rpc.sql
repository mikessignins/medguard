begin;

drop function if exists public.score_psychosocial_worker_pulse(jsonb);

create function public.score_psychosocial_worker_pulse(p_payload jsonb)
returns table (
  derived_pulse_risk_level text,
  domain_signal_counts jsonb,
  requested_support boolean,
  requires_review boolean,
  requires_urgent_follow_up boolean
)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_mood_rating integer := greatest(1, least(5, coalesce((p_payload ->> 'moodRating')::integer, 3)));
  v_stress_rating integer := greatest(1, least(5, coalesce((p_payload ->> 'stressRating')::integer, 3)));
  v_sleep_quality integer := greatest(1, least(5, coalesce((p_payload ->> 'sleepQualityOnRoster')::integer, 3)));

  v_overwhelmed text := coalesce(p_payload ->> 'feelingOverwhelmedByWorkDemands', 'sometimes');
  v_under_used text := coalesce(p_payload ->> 'feelingUnderUsedOrDisengaged', 'sometimes');
  v_control text := coalesce(p_payload ->> 'feelingAbleToControlWork', 'sometimes');
  v_supported text := coalesce(p_payload ->> 'feelingSupportedBySupervisorOrTeam', 'sometimes');
  v_role_clarity text := coalesce(p_payload ->> 'roleAndExpectationsAreClear', 'sometimes');
  v_support_contact text := coalesce(p_payload ->> 'wouldLikeSupportContact', 'no');

  v_unfair_treatment boolean := coalesce((p_payload ->> 'concernAboutUnfairTreatmentOrPoorCommunication')::boolean, false);
  v_interpersonal_conflict boolean := coalesce((p_payload ->> 'recentInterpersonalConflictOrInappropriateBehaviour')::boolean, false);
  v_isolated boolean := coalesce((p_payload ->> 'feelingIsolatedDueToRemoteOrFIFOWork')::boolean, false);
  v_physical_environment boolean := coalesce((p_payload ->> 'physicalEnvironmentAffectingWellbeing')::boolean, false);
  v_traumatic_event boolean := coalesce((p_payload ->> 'exposedToDistressingOrTraumaticEvent')::boolean, false);
  v_roster_pressure boolean := coalesce((p_payload ->> 'concernAboutRosterOrFatiguePressure')::boolean, false);
  v_monitoring_pressure boolean := coalesce((p_payload ->> 'concernAboutMonitoringOrSurveillancePressure')::boolean, false);
  v_comfortable_medic boolean := coalesce((p_payload ->> 'comfortableSpeakingToMedic')::boolean, true);
  v_comfortable_counsellor boolean := coalesce((p_payload ->> 'comfortableSpeakingToCounsellor')::boolean, true);
  v_urgent_contact boolean := coalesce((p_payload ->> 'wouldLikeUrgentContactToday')::boolean, false);
  v_feels_unsafe boolean := coalesce((p_payload ->> 'feelsUnsafeAtWorkToday')::boolean, false);

  v_overwhelmed_points integer;
  v_under_used_points integer;
  v_control_points integer;
  v_supported_points integer;
  v_role_clarity_points integer;
  v_requested_support boolean;
  v_risk_score integer;
  v_risk_level text;
  v_domain_counts jsonb;
begin
  v_overwhelmed_points := case v_overwhelmed
    when 'not_at_all' then 0
    when 'a_little' then 1
    when 'sometimes' then 2
    when 'often' then 3
    when 'very_often' then 4
    else 2
  end;

  v_under_used_points := case v_under_used
    when 'not_at_all' then 0
    when 'a_little' then 1
    when 'sometimes' then 2
    when 'often' then 3
    when 'very_often' then 4
    else 2
  end;

  v_control_points := case v_control
    when 'always' then 0
    when 'mostly' then 1
    when 'sometimes' then 2
    when 'rarely' then 3
    when 'never' then 4
    else 2
  end;

  v_supported_points := case v_supported
    when 'always' then 0
    when 'mostly' then 1
    when 'sometimes' then 2
    when 'rarely' then 3
    when 'never' then 4
    else 2
  end;

  v_role_clarity_points := case v_role_clarity
    when 'always' then 0
    when 'mostly' then 1
    when 'sometimes' then 2
    when 'rarely' then 3
    when 'never' then 4
    else 2
  end;

  v_domain_counts := jsonb_strip_nulls(
    jsonb_build_object(
      'high_job_demands', case when v_overwhelmed_points >= 2 then 1 else null end,
      'low_job_demands', case when v_under_used_points >= 2 then 1 else null end,
      'low_job_control', case when v_control_points >= 2 then 1 else null end,
      'poor_support', case when v_supported_points >= 2 then 1 else null end,
      'lack_of_role_clarity', case when v_role_clarity_points >= 2 then 1 else null end,
      'poor_organisational_change_management', case when v_unfair_treatment then 1 else null end,
      'poor_organisational_justice', case when v_unfair_treatment then 1 else null end,
      'low_reward_and_recognition', case when v_unfair_treatment then 1 else null end,
      'job_insecurity', case when v_unfair_treatment then 1 else null end,
      'violence_and_aggression', case when v_interpersonal_conflict then 1 else null end,
      'bullying', case when v_interpersonal_conflict then 1 else null end,
      'harassment_including_sexual_harassment', case when v_interpersonal_conflict then 1 else null end,
      'remote_or_isolated_work', case when v_isolated then 1 else null end,
      'poor_physical_environment', case when v_physical_environment then 1 else null end,
      'traumatic_events_or_material', case when v_traumatic_event then 1 else null end,
      'fatigue', case when v_roster_pressure then 1 else null end,
      'intrusive_surveillance', case when v_monitoring_pressure then 1 else null end
    )
  );

  v_requested_support := v_support_contact = 'yes' or v_urgent_contact;

  v_risk_score :=
    greatest(0, 3 - v_mood_rating)
    + greatest(0, v_stress_rating - 2)
    + greatest(0, 3 - v_sleep_quality)
    + v_overwhelmed_points
    + v_under_used_points
    + v_control_points
    + v_supported_points
    + v_role_clarity_points
    + case when v_unfair_treatment then 2 else 0 end
    + case when v_interpersonal_conflict then 2 else 0 end
    + case when v_isolated then 2 else 0 end
    + case when v_physical_environment then 1 else 0 end
    + case when v_traumatic_event then 3 else 0 end
    + case when v_roster_pressure then 2 else 0 end
    + case when v_monitoring_pressure then 1 else 0 end
    + case v_support_contact
        when 'maybe' then 1
        when 'yes' then 2
        else 0
      end
    + case when not v_comfortable_medic then 1 else 0 end
    + case when not v_comfortable_counsellor then 1 else 0 end
    + case when v_urgent_contact then 4 else 0 end
    + case when v_feels_unsafe then 5 else 0 end;

  if v_feels_unsafe or v_urgent_contact then
    v_risk_level := 'critical';
  elsif v_risk_score >= 18 or v_interpersonal_conflict or v_traumatic_event then
    v_risk_level := 'high';
  elsif v_risk_score >= 9 or v_support_contact <> 'no' then
    v_risk_level := 'moderate';
  else
    v_risk_level := 'low';
  end if;

  return query
  select
    v_risk_level,
    coalesce(v_domain_counts, '{}'::jsonb),
    v_requested_support,
    v_risk_level in ('high', 'critical'),
    v_risk_level = 'critical';
end;
$function$;

revoke all on function public.score_psychosocial_worker_pulse(jsonb) from public;
grant execute on function public.score_psychosocial_worker_pulse(jsonb) to authenticated;

commit;
