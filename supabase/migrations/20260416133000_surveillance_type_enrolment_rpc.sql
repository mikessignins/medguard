begin;

drop index if exists public.surveillance_enrolments_active_program_idx;

create unique index if not exists surveillance_enrolments_active_program_worker_idx
  on public.surveillance_enrolments (business_id, surveillance_worker_id, program_id)
  where status in ('active', 'paused')
    and surveillance_type_id is null;

create unique index if not exists surveillance_enrolments_active_type_worker_idx
  on public.surveillance_enrolments (business_id, surveillance_worker_id, surveillance_type_id)
  where status in ('active', 'paused')
    and surveillance_type_id is not null;

create or replace function public.resolve_surveillance_program_for_type(
  p_business_id text,
  p_surveillance_type_id uuid
)
returns public.surveillance_programs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_type public.surveillance_types%rowtype;
  v_program public.surveillance_programs%rowtype;
begin
  select *
    into v_type
    from public.surveillance_types st
   where st.id = p_surveillance_type_id
     and st.business_id = p_business_id
     and st.is_active = true
   limit 1;

  if v_type.id is null then
    raise exception 'Surveillance type not found for this business.'
      using errcode = 'P0001';
  end if;

  if v_type.legacy_program_code is not null then
    select *
      into v_program
      from public.surveillance_programs sp
     where sp.business_id = p_business_id
       and sp.code = v_type.legacy_program_code
       and sp.is_active = true
     limit 1;
  end if;

  if v_program.id is null then
    select *
      into v_program
      from public.surveillance_programs sp
     where sp.business_id = p_business_id
       and sp.code = 'other'::public.surveillance_program_code
       and sp.is_active = true
     limit 1;
  end if;

  if v_program.id is null then
    select *
      into v_program
      from public.surveillance_programs sp
     where sp.business_id = p_business_id
       and sp.code = 'general'::public.surveillance_program_code
       and sp.is_active = true
     limit 1;
  end if;

  if v_program.id is null then
    raise exception 'No compatible surveillance program exists for this surveillance type.'
      using errcode = 'P0001';
  end if;

  return v_program;
end;
$function$;

revoke all on function public.resolve_surveillance_program_for_type(text, uuid) from public;
grant execute on function public.resolve_surveillance_program_for_type(text, uuid) to authenticated;

create or replace function public.enroll_surveillance_worker_record_by_type(
  p_surveillance_type_id uuid,
  p_surveillance_worker_id uuid,
  p_next_due_at timestamptz default null,
  p_baseline_required boolean default false
)
returns public.surveillance_enrolments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_type public.surveillance_types%rowtype;
  v_program public.surveillance_programs%rowtype;
  v_worker public.surveillance_workers%rowtype;
  v_enrolment public.surveillance_enrolments%rowtype;
begin
  select *
    into v_type
    from public.surveillance_types st
   where st.id = p_surveillance_type_id
     and st.is_active = true;

  if v_type.id is null then
    raise exception 'Surveillance type not found.'
      using errcode = 'P0001';
  end if;

  if not public.can_manage_surveillance_business(v_type.business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  if not public.is_business_module_enabled(v_type.business_id, 'health_surveillance') then
    raise exception 'Health surveillance module is not enabled for this business.'
      using errcode = 'P0001';
  end if;

  select *
    into v_worker
    from public.surveillance_workers sw
   where sw.id = p_surveillance_worker_id
     and sw.business_id = v_type.business_id
     and sw.is_active = true;

  if v_worker.id is null then
    raise exception 'Worker not found for this business.'
      using errcode = 'P0001';
  end if;

  select *
    into v_program
    from public.resolve_surveillance_program_for_type(v_type.business_id, v_type.id);

  insert into public.surveillance_enrolments (
    business_id,
    surveillance_worker_id,
    worker_user_id,
    worker_display_name,
    program_id,
    surveillance_type_id,
    assignment_source,
    baseline_required,
    status,
    enrolled_at,
    next_due_at,
    created_by,
    updated_by
  )
  values (
    v_type.business_id,
    v_worker.id,
    v_worker.app_user_id,
    v_worker.display_name,
    v_program.id,
    v_type.id,
    'manual_type_assignment',
    coalesce(p_baseline_required, false),
    'active',
    now(),
    p_next_due_at,
    auth.uid(),
    auth.uid()
  )
  returning *
    into v_enrolment;

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    enrolment_id,
    event_type,
    entity_type,
    entity_id,
    new_value,
    event_payload
  )
  values (
    v_type.business_id,
    auth.uid(),
    v_worker.app_user_id,
    v_worker.id,
    v_enrolment.id,
    'worker_enrolled_by_type',
    'surveillance_enrolment',
    v_enrolment.id,
    jsonb_build_object(
      'surveillance_type_id', v_type.id,
      'program_id', v_program.id,
      'assignment_source', 'manual_type_assignment',
      'baseline_required', coalesce(p_baseline_required, false),
      'next_due_at', p_next_due_at
    ),
    jsonb_build_object(
      'surveillance_type_id', v_type.id,
      'program_id', v_program.id,
      'next_due_at', p_next_due_at
    )
  );

  return v_enrolment;
exception
  when unique_violation then
    raise exception 'Worker is already actively enrolled in this surveillance type.'
      using errcode = 'P0001';
end;
$function$;

revoke all on function public.enroll_surveillance_worker_record_by_type(uuid, uuid, timestamptz, boolean) from public;
grant execute on function public.enroll_surveillance_worker_record_by_type(uuid, uuid, timestamptz, boolean) to authenticated;

create or replace function public.enroll_worker_in_surveillance_by_type(
  p_surveillance_type_id uuid,
  p_worker_user_id uuid,
  p_next_due_at timestamptz default null,
  p_baseline_required boolean default false
)
returns public.surveillance_enrolments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker public.user_accounts%rowtype;
  v_profile public.worker_operational_profiles%rowtype;
  v_surveillance_worker public.surveillance_workers%rowtype;
  v_type public.surveillance_types%rowtype;
begin
  select *
    into v_type
    from public.surveillance_types st
   where st.id = p_surveillance_type_id
   limit 1;

  if v_type.id is null then
    raise exception 'Surveillance type not found.'
      using errcode = 'P0001';
  end if;

  select *
    into v_worker
    from public.user_accounts ua
   where ua.id = p_worker_user_id
     and ua.business_id = v_type.business_id
   limit 1;

  if v_worker.id is null then
    raise exception 'Worker not found for this business.'
      using errcode = 'P0001';
  end if;

  if v_worker.role <> 'worker' then
    raise exception 'Only workers can be enrolled in surveillance.'
      using errcode = 'P0001';
  end if;

  select *
    into v_profile
    from public.worker_operational_profiles wop
   where wop.worker_user_id = p_worker_user_id
     and wop.business_id = v_worker.business_id
   limit 1;

  select *
    into v_surveillance_worker
    from public.upsert_surveillance_worker_for_app_user(
      v_worker.business_id,
      v_worker.id,
      coalesce(v_profile.worker_display_name, v_worker.display_name),
      v_profile.selected_worker_role_id,
      coalesce(v_profile.job_role_name, 'Worker'),
      coalesce(v_profile.requires_health_surveillance, true)
    );

  return public.enroll_surveillance_worker_record_by_type(
    p_surveillance_type_id,
    v_surveillance_worker.id,
    p_next_due_at,
    p_baseline_required
  );
end;
$function$;

revoke all on function public.enroll_worker_in_surveillance_by_type(uuid, uuid, timestamptz, boolean) from public;
grant execute on function public.enroll_worker_in_surveillance_by_type(uuid, uuid, timestamptz, boolean) to authenticated;

commit;
