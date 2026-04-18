begin;

alter table public.medication_declarations
  add column if not exists medical_officer_review_required boolean not null default false,
  add column if not exists medical_officer_name text,
  add column if not exists medical_officer_practice text;

update public.medication_declarations
   set medical_officer_review_required = coalesce(review_required, false)
 where medical_officer_review_required is distinct from coalesce(review_required, false);

alter table public.purge_audit_log
  add column if not exists medical_officer_name text,
  add column if not exists medical_officer_practice text;

comment on column public.medication_declarations.medical_officer_review_required is
  'Whether the medication declaration required a Medical Officer Review before a final outcome was recorded.';
comment on column public.medication_declarations.medical_officer_name is
  'The reviewing medical officer name recorded by the medic when Medical Officer Review is required.';
comment on column public.medication_declarations.medical_officer_practice is
  'The reviewing medical officer practice recorded by the medic when Medical Officer Review is required.';

create or replace function public.prevent_direct_clinical_review_update()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if coalesce(current_setting('medguard.authorized_clinical_write', true), '') = 'on' then
    return new;
  end if;

  if tg_table_name = 'submissions'
     and (
       old.status is distinct from new.status
       or old.decision is distinct from new.decision
     ) then
    raise exception 'Clinical review state must be changed through an approved review RPC.'
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'medication_declarations'
     and (
       old.medic_review_status is distinct from new.medic_review_status
       or old.medic_comments is distinct from new.medic_comments
       or old.review_required is distinct from new.review_required
       or old.medical_officer_review_required is distinct from new.medical_officer_review_required
       or old.medical_officer_name is distinct from new.medical_officer_name
       or old.medical_officer_practice is distinct from new.medical_officer_practice
       or old.medic_name is distinct from new.medic_name
       or old.medic_reviewed_at is distinct from new.medic_reviewed_at
     ) then
    raise exception 'Medication review state must be changed through an approved review RPC.'
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'module_submissions'
     and (
       old.status is distinct from new.status
       or old.review_payload is distinct from new.review_payload
       or old.reviewed_at is distinct from new.reviewed_at
       or old.reviewed_by is distinct from new.reviewed_by
     ) then
    raise exception 'Module review state must be changed through an approved review RPC.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

drop trigger if exists medication_declarations_prevent_direct_review_update on public.medication_declarations;
create trigger medication_declarations_prevent_direct_review_update
  before update of medic_review_status, medic_comments, review_required, medical_officer_review_required, medical_officer_name, medical_officer_practice, medic_name, medic_reviewed_at
  on public.medication_declarations
  for each row execute function public.prevent_direct_clinical_review_update();

create or replace function public.review_medication_declaration(
  p_declaration_id text,
  p_medic_review_status text,
  p_medic_comments text default null,
  p_review_required boolean default false,
  p_expected_status text default null,
  p_medical_officer_name text default null,
  p_medical_officer_practice text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_declaration record;
  v_requires_mro boolean := coalesce(p_review_required, false);
  v_officer_name text := nullif(btrim(coalesce(p_medical_officer_name, '')), '');
  v_officer_practice text := nullif(btrim(coalesce(p_medical_officer_practice, '')), '');
begin
  if p_medic_review_status not in ('Pending', 'In Review', 'Normal Duties', 'Restricted Duties', 'Unfit for Work') then
    raise exception 'Invalid medication review status.' using errcode = 'P0001';
  end if;

  select id, role, display_name, business_id, site_ids, is_inactive, contract_end_date
    into v_actor
    from public.user_accounts
   where id = auth.uid();

  if v_actor.id is null
     or v_actor.role <> 'medic'
     or coalesce(v_actor.is_inactive, false)
     or (v_actor.contract_end_date is not null and v_actor.contract_end_date < now()) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  select id, business_id, site_id, medic_review_status
    into v_declaration
    from public.medication_declarations
   where id = p_declaration_id
   for update;

  if v_declaration.id is null then
    raise exception 'Medication declaration not found.' using errcode = 'P0001';
  end if;

  if v_declaration.business_id is distinct from v_actor.business_id
     or not coalesce(v_declaration.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if p_expected_status is not null and v_declaration.medic_review_status is distinct from p_expected_status then
    raise exception 'This medication declaration was updated by another user.' using errcode = 'P0001';
  end if;

  if v_declaration.medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work') then
    raise exception 'Medication review is already finalised.' using errcode = 'P0001';
  end if;

  if v_requires_mro and (v_officer_name is null or v_officer_practice is null) and p_medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work') then
    raise exception 'Medical Officer Review details are required before a final medication outcome can be recorded.' using errcode = 'P0001';
  end if;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  update public.medication_declarations
     set medic_review_status = p_medic_review_status,
         medic_comments = nullif(btrim(coalesce(p_medic_comments, '')), ''),
         review_required = v_requires_mro,
         medical_officer_review_required = v_requires_mro,
         medical_officer_name = case when v_requires_mro then v_officer_name else null end,
         medical_officer_practice = case when v_requires_mro then v_officer_practice else null end,
         medic_name = v_actor.display_name,
         medic_reviewed_at = now()
   where id = v_declaration.id;

  perform public.write_security_audit_event(
    'database',
    'medication_review_saved',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_declaration.business_id,
    'confidential_medication',
    'rpc/review_medication_declaration',
    v_declaration.id,
    null,
    jsonb_build_object(
      'medic_review_status', p_medic_review_status,
      'previous_status', v_declaration.medic_review_status,
      'medical_officer_review_required', v_requires_mro,
      'medical_officer_name', v_officer_name,
      'medical_officer_practice', v_officer_practice
    )
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.review_medication_declaration(text, text, text, boolean, text, text, text) from public;
grant execute on function public.review_medication_declaration(text, text, text, boolean, text, text, text) to authenticated;

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
    if coalesce(v_row.medical_officer_review_required, false)
       and (
         nullif(btrim(coalesce(v_row.medical_officer_name, '')), '') is null
         or nullif(btrim(coalesce(v_row.medical_officer_practice, '')), '') is null
       ) then
      raise exception 'Medical Officer Review details must be recorded before PHI can be removed.' using errcode = 'P0001';
    end if;

    insert into public.purge_audit_log (
      submission_id, worker_name, worker_dob, site_id, site_name, business_id,
      medic_user_id, medic_name, purged_at, form_type, exported_at, exported_by_name,
      export_confirmed_at, export_confirmed_by_name, approved_by_name, approved_at,
      medical_officer_name, medical_officer_practice
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
      v_row.medic_reviewed_at,
      v_row.medical_officer_name,
      v_row.medical_officer_practice
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
      coalesce(v_payload #>> '{workerSnapshot,fullName}', v_payload ->> 'workerNameSnapshot'),
      coalesce(v_payload #>> '{workerSnapshot,dateOfBirth}', v_payload ->> 'workerDobSnapshot'),
      v_row.site_id,
      v_payload ->> 'siteName',
      v_row.business_id,
      v_actor_id,
      v_actor.display_name,
      v_now,
      v_form_type,
      v_row.exported_at,
      v_row.exported_by_name,
      v_now,
      v_actor.display_name,
      coalesce(v_review_payload ->> 'reviewedByName', v_actor.display_name),
      v_row.reviewed_at
    );

    update public.module_submissions
    set export_confirmed_at = v_now,
        export_confirmed_by = v_actor_id,
        export_confirmed_by_name = v_actor.display_name,
        phi_purged_at = v_now,
        payload = '{}'::jsonb,
        review_payload = jsonb_build_object(
          'status', v_row.status,
          'reviewedAt', v_row.reviewed_at,
          'reviewedBy', v_row.reviewed_by,
          'phi_purged', true
        )
    where id = v_row.id;

  else
    raise exception 'Unsupported form type: %', p_form_type using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'status', 'purged',
    'form_type', p_form_type,
    'record_id', p_record_id,
    'purged_at', v_now
  );
end;
$function$;

revoke all on function public.confirm_export_and_purge_phi(text, text) from public;
grant execute on function public.confirm_export_and_purge_phi(text, text) to authenticated;

commit;
