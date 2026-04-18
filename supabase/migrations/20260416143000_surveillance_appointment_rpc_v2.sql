begin;

create or replace function public.schedule_surveillance_appointment_v2(
  p_enrolment_id uuid,
  p_scheduled_at timestamptz,
  p_location text default null,
  p_appointment_type text default 'periodic',
  p_instructions text default null,
  p_provider_id uuid default null,
  p_provider_location_id uuid default null
)
returns public.surveillance_appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrolment public.surveillance_enrolments%rowtype;
  v_program public.surveillance_programs%rowtype;
  v_actor public.user_accounts%rowtype;
  v_existing uuid;
  v_appointment public.surveillance_appointments%rowtype;
  v_provider public.surveillance_providers%rowtype;
  v_provider_location public.surveillance_provider_locations%rowtype;
begin
  if p_scheduled_at <= now() - interval '1 day' then
    raise exception 'Scheduled time is invalid.';
  end if;

  select * into v_enrolment from public.surveillance_enrolments se where se.id = p_enrolment_id;
  if v_enrolment.id is null then raise exception 'Enrolment not found.'; end if;
  if v_enrolment.status <> 'active' then raise exception 'Only active enrolments can be scheduled.'; end if;
  if not public.can_manage_surveillance_business(v_enrolment.business_id) then raise exception 'Forbidden'; end if;
  if not public.is_business_module_enabled(v_enrolment.business_id, 'health_surveillance') then
    raise exception 'Health surveillance module is not enabled for this business.';
  end if;

  if p_provider_id is not null then
    select * into v_provider
      from public.surveillance_providers sp
     where sp.id = p_provider_id
       and sp.business_id = v_enrolment.business_id
       and sp.is_active = true;

    if v_provider.id is null then
      raise exception 'Provider not found for this business.';
    end if;
  end if;

  if p_provider_location_id is not null then
    select * into v_provider_location
      from public.surveillance_provider_locations spl
     where spl.id = p_provider_location_id
       and spl.business_id = v_enrolment.business_id
       and spl.is_active = true;

    if v_provider_location.id is null then
      raise exception 'Provider location not found for this business.';
    end if;

    if p_provider_id is not null and v_provider_location.provider_id <> p_provider_id then
      raise exception 'Provider location does not belong to the selected provider.';
    end if;
  end if;

  select * into v_program from public.surveillance_programs sp where sp.id = v_enrolment.program_id;
  select * into v_actor from public.user_accounts ua where ua.id = auth.uid();

  select sa.id
    into v_existing
    from public.surveillance_appointments sa
   where sa.enrolment_id = v_enrolment.id
     and sa.status in ('scheduled', 'confirmed', 'rescheduled')
   order by sa.scheduled_at asc
   limit 1;

  if v_existing is not null then raise exception 'This enrolment already has an open appointment.'; end if;

  insert into public.surveillance_appointments (
    business_id,
    enrolment_id,
    surveillance_worker_id,
    worker_user_id,
    worker_display_name,
    program_id,
    surveillance_type_id,
    assigned_staff_user_id,
    assigned_staff_name,
    provider_id,
    provider_location_id,
    scheduled_at,
    location,
    appointment_type,
    status,
    pre_appointment_instructions,
    created_by,
    updated_by
  )
  values (
    v_enrolment.business_id,
    v_enrolment.id,
    v_enrolment.surveillance_worker_id,
    v_enrolment.worker_user_id,
    v_enrolment.worker_display_name,
    v_program.id,
    v_enrolment.surveillance_type_id,
    case when v_actor.role = 'occ_health' then v_actor.id else null end,
    case when v_actor.role = 'occ_health' then v_actor.display_name else null end,
    p_provider_id,
    p_provider_location_id,
    p_scheduled_at,
    nullif(btrim(coalesce(p_location, '')), ''),
    coalesce(nullif(btrim(coalesce(p_appointment_type, '')), ''), 'periodic'),
    'scheduled',
    nullif(btrim(coalesce(p_instructions, '')), ''),
    auth.uid(),
    auth.uid()
  )
  returning * into v_appointment;

  update public.surveillance_enrolments
     set next_appointment_at = v_appointment.scheduled_at,
         updated_by = auth.uid()
   where id = v_enrolment.id;

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    appointment_id,
    enrolment_id,
    event_type,
    entity_type,
    entity_id,
    new_value,
    event_payload
  )
  values (
    v_enrolment.business_id,
    auth.uid(),
    v_enrolment.worker_user_id,
    v_enrolment.surveillance_worker_id,
    v_appointment.id,
    v_enrolment.id,
    'appointment_scheduled',
    'surveillance_appointment',
    v_appointment.id,
    jsonb_build_object(
      'scheduled_at', p_scheduled_at,
      'program_id', v_program.id,
      'surveillance_type_id', v_enrolment.surveillance_type_id,
      'provider_id', p_provider_id,
      'provider_location_id', p_provider_location_id,
      'appointment_type', coalesce(nullif(btrim(coalesce(p_appointment_type, '')), ''), 'periodic')
    ),
    jsonb_build_object(
      'scheduled_at', p_scheduled_at,
      'program_id', v_program.id,
      'surveillance_type_id', v_enrolment.surveillance_type_id,
      'provider_id', p_provider_id,
      'provider_location_id', p_provider_location_id,
      'appointment_type', coalesce(nullif(btrim(coalesce(p_appointment_type, '')), ''), 'periodic')
    )
  );

  return v_appointment;
end;
$function$;

revoke all on function public.schedule_surveillance_appointment_v2(uuid, timestamptz, text, text, text, uuid, uuid) from public;
grant execute on function public.schedule_surveillance_appointment_v2(uuid, timestamptz, text, text, text, uuid, uuid) to authenticated;

create or replace function public.reschedule_surveillance_appointment_v2(
  p_appointment_id uuid,
  p_scheduled_at timestamptz,
  p_location text default null,
  p_status_reason_code_id uuid default null,
  p_provider_id uuid default null,
  p_provider_location_id uuid default null
)
returns public.surveillance_appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appointment public.surveillance_appointments%rowtype;
  v_reason public.surveillance_reason_codes%rowtype;
  v_provider public.surveillance_providers%rowtype;
  v_provider_location public.surveillance_provider_locations%rowtype;
begin
  select * into v_appointment from public.surveillance_appointments sa where sa.id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Appointment not found.'; end if;
  if not public.can_manage_surveillance_business(v_appointment.business_id) then raise exception 'Forbidden'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be rescheduled.';
  end if;

  if p_status_reason_code_id is not null then
    select * into v_reason
      from public.surveillance_reason_codes src
     where src.id = p_status_reason_code_id
       and src.business_id = v_appointment.business_id
       and src.category = 'rescheduled'
       and src.is_active = true;

    if v_reason.id is null then
      raise exception 'Reschedule reason code not found for this business.';
    end if;
  end if;

  if p_provider_id is not null then
    select * into v_provider
      from public.surveillance_providers sp
     where sp.id = p_provider_id
       and sp.business_id = v_appointment.business_id
       and sp.is_active = true;

    if v_provider.id is null then
      raise exception 'Provider not found for this business.';
    end if;
  end if;

  if p_provider_location_id is not null then
    select * into v_provider_location
      from public.surveillance_provider_locations spl
     where spl.id = p_provider_location_id
       and spl.business_id = v_appointment.business_id
       and spl.is_active = true;

    if v_provider_location.id is null then
      raise exception 'Provider location not found for this business.';
    end if;
  end if;

  update public.surveillance_appointments
     set scheduled_at = p_scheduled_at,
         location = nullif(btrim(coalesce(p_location, '')), ''),
         provider_id = p_provider_id,
         provider_location_id = p_provider_location_id,
         status_reason_code_id = p_status_reason_code_id,
         status = 'rescheduled',
         updated_by = auth.uid()
   where id = v_appointment.id
   returning * into v_appointment;

  perform public.refresh_surveillance_enrolment_schedule(v_appointment.enrolment_id);

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    appointment_id,
    enrolment_id,
    event_type,
    entity_type,
    entity_id,
    new_value,
    event_payload
  )
  values (
    v_appointment.business_id,
    auth.uid(),
    v_appointment.worker_user_id,
    v_appointment.surveillance_worker_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    'appointment_rescheduled',
    'surveillance_appointment',
    v_appointment.id,
    jsonb_build_object(
      'scheduled_at', p_scheduled_at,
      'provider_id', p_provider_id,
      'provider_location_id', p_provider_location_id,
      'status_reason_code_id', p_status_reason_code_id
    ),
    jsonb_build_object(
      'scheduled_at', p_scheduled_at,
      'provider_id', p_provider_id,
      'provider_location_id', p_provider_location_id,
      'status_reason_code_id', p_status_reason_code_id
    )
  );

  return v_appointment;
end;
$function$;

revoke all on function public.reschedule_surveillance_appointment_v2(uuid, timestamptz, text, uuid, uuid, uuid) from public;
grant execute on function public.reschedule_surveillance_appointment_v2(uuid, timestamptz, text, uuid, uuid, uuid) to authenticated;

create or replace function public.mark_surveillance_attendance_v2(
  p_appointment_id uuid,
  p_status public.surveillance_appointment_status,
  p_status_reason_code_id uuid default null
)
returns public.surveillance_appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appointment public.surveillance_appointments%rowtype;
  v_reason public.surveillance_reason_codes%rowtype;
begin
  if p_status not in ('confirmed', 'did_not_attend') then
    raise exception 'Attendance status must be confirmed or did_not_attend.';
  end if;

  select * into v_appointment from public.surveillance_appointments sa where sa.id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Appointment not found.'; end if;
  if not public.can_manage_surveillance_business(v_appointment.business_id) then raise exception 'Forbidden'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can have attendance marked.';
  end if;

  if p_status = 'did_not_attend' and p_status_reason_code_id is not null then
    select * into v_reason
      from public.surveillance_reason_codes src
     where src.id = p_status_reason_code_id
       and src.business_id = v_appointment.business_id
       and src.category = 'did_not_attend'
       and src.is_active = true;

    if v_reason.id is null then
      raise exception 'DNA reason code not found for this business.';
    end if;
  end if;

  update public.surveillance_appointments
     set status = p_status,
         status_reason_code_id = p_status_reason_code_id,
         confirmed_by_worker_at = case when p_status = 'confirmed' then now() else confirmed_by_worker_at end,
         updated_by = auth.uid()
   where id = v_appointment.id
   returning * into v_appointment;

  perform public.refresh_surveillance_enrolment_schedule(v_appointment.enrolment_id);

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    appointment_id,
    enrolment_id,
    event_type,
    entity_type,
    entity_id,
    new_value,
    event_payload
  )
  values (
    v_appointment.business_id,
    auth.uid(),
    v_appointment.worker_user_id,
    v_appointment.surveillance_worker_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    'appointment_attendance_marked',
    'surveillance_appointment',
    v_appointment.id,
    jsonb_build_object('status', p_status, 'status_reason_code_id', p_status_reason_code_id),
    jsonb_build_object('status', p_status, 'status_reason_code_id', p_status_reason_code_id)
  );

  return v_appointment;
end;
$function$;

revoke all on function public.mark_surveillance_attendance_v2(uuid, public.surveillance_appointment_status, uuid) from public;
grant execute on function public.mark_surveillance_attendance_v2(uuid, public.surveillance_appointment_status, uuid) to authenticated;

create or replace function public.cancel_surveillance_appointment_v2(
  p_appointment_id uuid,
  p_reason text default null,
  p_status_reason_code_id uuid default null
)
returns public.surveillance_appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appointment public.surveillance_appointments%rowtype;
  v_reason public.surveillance_reason_codes%rowtype;
begin
  select * into v_appointment from public.surveillance_appointments sa where sa.id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Appointment not found.'; end if;
  if not public.can_manage_surveillance_business(v_appointment.business_id) then raise exception 'Forbidden'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be cancelled.';
  end if;

  if p_status_reason_code_id is not null then
    select * into v_reason
      from public.surveillance_reason_codes src
     where src.id = p_status_reason_code_id
       and src.business_id = v_appointment.business_id
       and src.category = 'cancelled'
       and src.is_active = true;

    if v_reason.id is null then
      raise exception 'Cancellation reason code not found for this business.';
    end if;
  end if;

  update public.surveillance_appointments
     set status = 'cancelled',
         cancelled_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         status_reason_code_id = p_status_reason_code_id,
         updated_by = auth.uid()
   where id = v_appointment.id
   returning * into v_appointment;

  perform public.refresh_surveillance_enrolment_schedule(v_appointment.enrolment_id);

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    appointment_id,
    enrolment_id,
    event_type,
    entity_type,
    entity_id,
    new_value,
    event_payload
  )
  values (
    v_appointment.business_id,
    auth.uid(),
    v_appointment.worker_user_id,
    v_appointment.surveillance_worker_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    'appointment_cancelled',
    'surveillance_appointment',
    v_appointment.id,
    jsonb_build_object(
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'status_reason_code_id', p_status_reason_code_id
    ),
    jsonb_build_object(
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'status_reason_code_id', p_status_reason_code_id
    )
  );

  return v_appointment;
end;
$function$;

revoke all on function public.cancel_surveillance_appointment_v2(uuid, text, uuid) from public;
grant execute on function public.cancel_surveillance_appointment_v2(uuid, text, uuid) to authenticated;

commit;
