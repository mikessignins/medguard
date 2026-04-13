-- Move exported forms from time-based PHI retention to explicit export confirmation.
-- The RPC keeps the audit shell while removing PHI-bearing payloads in one transaction.

alter table public.submissions
  add column if not exists export_confirmed_at timestamptz,
  add column if not exists export_confirmed_by uuid,
  add column if not exists export_confirmed_by_name text;

alter table public.medication_declarations
  add column if not exists export_confirmed_at timestamptz,
  add column if not exists export_confirmed_by uuid,
  add column if not exists export_confirmed_by_name text;

alter table public.module_submissions
  add column if not exists export_confirmed_at timestamptz,
  add column if not exists export_confirmed_by uuid,
  add column if not exists export_confirmed_by_name text;

alter table public.purge_audit_log
  add column if not exists export_confirmed_at timestamptz,
  add column if not exists export_confirmed_by_name text;

comment on column public.submissions.export_confirmed_at is
  'Medic confirmation that the exported PDF was saved before PHI was purged.';
comment on column public.medication_declarations.export_confirmed_at is
  'Medic confirmation that the exported PDF was saved before PHI was purged.';
comment on column public.module_submissions.export_confirmed_at is
  'Medic confirmation that the exported PDF was saved before PHI was purged.';

create index if not exists submissions_export_confirmation_idx
  on public.submissions (exported_at, export_confirmed_at, phi_purged_at);

create index if not exists medication_declarations_export_confirmation_idx
  on public.medication_declarations (exported_at, export_confirmed_at, phi_purged_at);

create index if not exists module_submissions_export_confirmation_idx
  on public.module_submissions (module_key, exported_at, export_confirmed_at, phi_purged_at);

create or replace function public.confirm_export_and_purge_phi(
  p_form_type text,
  p_record_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor record;
  v_now timestamptz := timezone('utc', now());
  v_row record;
  v_worker_snapshot jsonb;
  v_decision jsonb;
  v_payload jsonb;
  v_review_payload jsonb;
  v_form_type text;
begin
  if v_actor_id is null then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;

  select id, role, display_name, business_id, site_ids, is_inactive, contract_end_date
  into v_actor
  from public.user_accounts
  where id = v_actor_id;

  if v_actor.id is null
     or v_actor.role <> 'medic'
     or coalesce(v_actor.is_inactive, false)
     or (v_actor.contract_end_date is not null and v_actor.contract_end_date < now()) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  if p_form_type = 'emergency_declaration' then
    select *
    into v_row
    from public.submissions
    where id = p_record_id
    for update;

    if v_row.id is null then
      raise exception 'Record not found' using errcode = 'P0001';
    end if;
    if v_row.business_id is distinct from v_actor.business_id
       or not coalesce(v_row.site_id = any(v_actor.site_ids), false) then
      raise exception 'Forbidden' using errcode = 'P0001';
    end if;
    if v_row.phi_purged_at is not null then
      return jsonb_build_object('status', 'already_purged', 'purged_at', v_row.phi_purged_at);
    end if;
    if v_row.exported_at is null then
      raise exception 'Export must be generated before confirmation.' using errcode = 'P0001';
    end if;
    if v_row.status not in ('Approved', 'Requires Follow-up') then
      raise exception 'Only final reviewed emergency declarations can be confirmed and purged.' using errcode = 'P0001';
    end if;

    v_worker_snapshot := coalesce(v_row.worker_snapshot, '{}'::jsonb);
    v_decision := coalesce(v_row.decision, '{}'::jsonb);

    insert into public.purge_audit_log (
      submission_id, worker_name, worker_dob, site_id, site_name, business_id,
      medic_user_id, medic_name, purged_at, form_type, exported_at, exported_by_name,
      export_confirmed_at, export_confirmed_by_name, approved_by_name, approved_at
    ) values (
      v_row.id,
      v_worker_snapshot ->> 'fullName',
      v_worker_snapshot ->> 'dateOfBirth',
      v_row.site_id,
      v_row.site_name,
      v_row.business_id,
      v_actor_id,
      v_actor.display_name,
      v_now,
      'emergency_declaration',
      v_row.exported_at,
      v_row.exported_by_name,
      v_now,
      v_actor.display_name,
      v_decision ->> 'decided_by_name',
      nullif(v_decision ->> 'decided_at', '')::timestamptz
    );

    update public.submissions
    set export_confirmed_at = v_now,
        export_confirmed_by = v_actor_id,
        export_confirmed_by_name = v_actor.display_name,
        phi_purged_at = v_now,
        worker_snapshot = '{}'::jsonb,
        site_specific_answers = '{}'::jsonb,
        script_uploads = '[]'::jsonb,
        comments = '[]'::jsonb,
        decision = jsonb_build_object(
          'outcome', v_row.status,
          'decided_at', v_decision ->> 'decided_at',
          'decided_by_name', v_decision ->> 'decided_by_name',
          'phi_purged', true
        )
    where id = v_row.id;

  elsif p_form_type = 'medication_declaration' then
    select *
    into v_row
    from public.medication_declarations
    where id = p_record_id
    for update;

    if v_row.id is null then
      raise exception 'Record not found' using errcode = 'P0001';
    end if;
    if v_row.business_id is distinct from v_actor.business_id
       or not coalesce(v_row.site_id = any(v_actor.site_ids), false) then
      raise exception 'Forbidden' using errcode = 'P0001';
    end if;
    if v_row.phi_purged_at is not null then
      return jsonb_build_object('status', 'already_purged', 'purged_at', v_row.phi_purged_at);
    end if;
    if v_row.exported_at is null then
      raise exception 'Export must be generated before confirmation.' using errcode = 'P0001';
    end if;
    if v_row.medic_review_status not in ('Normal Duties', 'Restricted Duties', 'Unfit for Work') then
      raise exception 'Only final reviewed medication declarations can be confirmed and purged.' using errcode = 'P0001';
    end if;

    insert into public.purge_audit_log (
      submission_id, worker_name, worker_dob, site_id, site_name, business_id,
      medic_user_id, medic_name, purged_at, form_type, exported_at, exported_by_name,
      export_confirmed_at, export_confirmed_by_name, approved_by_name, approved_at
    ) values (
      v_row.id,
      v_row.worker_name,
      v_row.worker_dob,
      v_row.site_id,
      v_row.site_name,
      v_row.business_id,
      v_actor_id,
      v_actor.display_name,
      v_now,
      'medication_declaration',
      v_row.exported_at,
      v_row.exported_by_name,
      v_now,
      v_actor.display_name,
      v_row.medic_name,
      v_row.medic_reviewed_at
    );

    update public.medication_declarations
    set export_confirmed_at = v_now,
        export_confirmed_by = v_actor_id,
        export_confirmed_by_name = v_actor.display_name,
        phi_purged_at = v_now,
        worker_name = '',
        worker_dob = '',
        employer = '',
        department = '',
        job_title = '',
        has_recent_injury_or_illness = false,
        has_side_effects = false,
        medications = '[]'::jsonb,
        medic_comments = '',
        script_uploads = '[]'::jsonb
    where id = v_row.id;

  elsif p_form_type in ('fatigue_assessment', 'psychosocial_health') then
    select *
    into v_row
    from public.module_submissions
    where id = p_record_id::uuid
      and module_key = p_form_type
    for update;

    if v_row.id is null then
      raise exception 'Record not found' using errcode = 'P0001';
    end if;
    if v_row.business_id is distinct from v_actor.business_id
       or (v_row.site_id is not null and not coalesce(v_row.site_id = any(v_actor.site_ids), false)) then
      raise exception 'Forbidden' using errcode = 'P0001';
    end if;
    if v_row.phi_purged_at is not null then
      return jsonb_build_object('status', 'already_purged', 'purged_at', v_row.phi_purged_at);
    end if;
    if v_row.exported_at is null then
      raise exception 'Export must be generated before confirmation.' using errcode = 'P0001';
    end if;
    if v_row.status <> 'resolved' then
      raise exception 'Only final reviewed module submissions can be confirmed and purged.' using errcode = 'P0001';
    end if;

    v_payload := coalesce(v_row.payload, '{}'::jsonb);
    v_review_payload := coalesce(v_row.review_payload, '{}'::jsonb);
    v_form_type := case
      when p_form_type = 'fatigue_assessment' then 'fatigue_assessment'
      when v_payload ? 'postIncidentWelfare' then 'psychosocial_post_incident_welfare'
      else 'psychosocial_support_checkin'
    end;

    insert into public.purge_audit_log (
      submission_id, worker_name, worker_dob, site_id, site_name, business_id,
      medic_user_id, medic_name, purged_at, form_type, exported_at, exported_by_name,
      export_confirmed_at, export_confirmed_by_name, approved_by_name, approved_at
    ) values (
      v_row.id::text,
      coalesce(
        v_payload #>> '{workerAssessment,workerNameSnapshot}',
        v_payload #>> '{workerPulse,workerNameSnapshot}',
        v_payload #>> '{postIncidentWelfare,workerNameSnapshot}'
      ),
      null,
      v_row.site_id,
      null,
      v_row.business_id,
      v_actor_id,
      v_actor.display_name,
      v_now,
      v_form_type,
      v_row.exported_at,
      v_row.exported_by_name,
      v_now,
      v_actor.display_name,
      v_review_payload ->> 'reviewedByName',
      v_row.reviewed_at
    );

    update public.module_submissions
    set export_confirmed_at = v_now,
        export_confirmed_by = v_actor_id,
        export_confirmed_by_name = v_actor.display_name,
        phi_purged_at = v_now,
        payload = '{}'::jsonb,
        review_payload = jsonb_build_object(
          'fitForWorkDecision', v_review_payload ->> 'fitForWorkDecision',
          'reviewedByName', v_review_payload ->> 'reviewedByName',
          'phi_purged', true
        )
    where id = v_row.id;

  else
    raise exception 'Unsupported form type.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('status', 'purged', 'purged_at', v_now);
end;
$function$;

grant execute on function public.confirm_export_and_purge_phi(text, text) to authenticated;
