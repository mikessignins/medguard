begin;

create or replace function public.create_surveillance_provider(
  p_business_id text,
  p_name text,
  p_provider_type text default null,
  p_contact_email text default null,
  p_contact_phone text default null
)
returns public.surveillance_providers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider public.surveillance_providers%rowtype;
begin
  if not public.can_manage_surveillance_business(p_business_id) then
    raise exception 'Forbidden';
  end if;

  insert into public.surveillance_providers (
    business_id,
    name,
    provider_type,
    contact_email,
    contact_phone,
    is_active,
    created_by,
    updated_by
  )
  values (
    p_business_id,
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(p_provider_type, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), ''),
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    true,
    auth.uid(),
    auth.uid()
  )
  returning * into v_provider;

  return v_provider;
end;
$function$;

revoke all on function public.create_surveillance_provider(text, text, text, text, text) from public;
grant execute on function public.create_surveillance_provider(text, text, text, text, text) to authenticated;

create or replace function public.set_surveillance_provider_active(
  p_provider_id uuid,
  p_is_active boolean
)
returns public.surveillance_providers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider public.surveillance_providers%rowtype;
begin
  select * into v_provider
    from public.surveillance_providers sp
   where sp.id = p_provider_id
   for update;

  if v_provider.id is null then
    raise exception 'Provider not found.';
  end if;

  if not public.can_manage_surveillance_business(v_provider.business_id) then
    raise exception 'Forbidden';
  end if;

  update public.surveillance_providers
     set is_active = p_is_active,
         updated_by = auth.uid()
   where id = p_provider_id
   returning * into v_provider;

  return v_provider;
end;
$function$;

revoke all on function public.set_surveillance_provider_active(uuid, boolean) from public;
grant execute on function public.set_surveillance_provider_active(uuid, boolean) to authenticated;

create or replace function public.upsert_surveillance_worker_roster(
  p_surveillance_worker_id uuid,
  p_roster_pattern text,
  p_shift_type text default null,
  p_current_swing_start date default null,
  p_current_swing_end date default null,
  p_source_system text default null,
  p_source_ref text default null
)
returns public.surveillance_worker_rosters
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker public.surveillance_workers%rowtype;
  v_roster public.surveillance_worker_rosters%rowtype;
begin
  select * into v_worker
    from public.surveillance_workers sw
   where sw.id = p_surveillance_worker_id
   for update;

  if v_worker.id is null then
    raise exception 'Worker not found.';
  end if;

  if not public.can_manage_surveillance_business(v_worker.business_id) then
    raise exception 'Forbidden';
  end if;

  select * into v_roster
    from public.surveillance_worker_rosters swr
   where swr.surveillance_worker_id = p_surveillance_worker_id
   order by swr.updated_at desc
   limit 1;

  if v_roster.id is null then
    insert into public.surveillance_worker_rosters (
      business_id,
      surveillance_worker_id,
      roster_pattern,
      shift_type,
      current_swing_start,
      current_swing_end,
      source_system,
      source_ref,
      created_by,
      updated_by
    )
    values (
      v_worker.business_id,
      p_surveillance_worker_id,
      nullif(btrim(coalesce(p_roster_pattern, '')), ''),
      nullif(btrim(coalesce(p_shift_type, '')), ''),
      p_current_swing_start,
      p_current_swing_end,
      nullif(btrim(coalesce(p_source_system, '')), ''),
      nullif(btrim(coalesce(p_source_ref, '')), ''),
      auth.uid(),
      auth.uid()
    )
    returning * into v_roster;
  else
    update public.surveillance_worker_rosters
       set roster_pattern = nullif(btrim(coalesce(p_roster_pattern, '')), ''),
           shift_type = nullif(btrim(coalesce(p_shift_type, '')), ''),
           current_swing_start = p_current_swing_start,
           current_swing_end = p_current_swing_end,
           source_system = nullif(btrim(coalesce(p_source_system, '')), ''),
           source_ref = nullif(btrim(coalesce(p_source_ref, '')), ''),
           updated_by = auth.uid()
     where id = v_roster.id
     returning * into v_roster;
  end if;

  return v_roster;
end;
$function$;

revoke all on function public.upsert_surveillance_worker_roster(uuid, text, text, date, date, text, text) from public;
grant execute on function public.upsert_surveillance_worker_roster(uuid, text, text, date, date, text, text) to authenticated;

create or replace function public.add_surveillance_worker_availability_exception(
  p_surveillance_worker_id uuid,
  p_exception_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes_operational text default null
)
returns public.surveillance_worker_availability_exceptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker public.surveillance_workers%rowtype;
  v_exception public.surveillance_worker_availability_exceptions%rowtype;
begin
  select * into v_worker
    from public.surveillance_workers sw
   where sw.id = p_surveillance_worker_id;

  if v_worker.id is null then
    raise exception 'Worker not found.';
  end if;

  if not public.can_manage_surveillance_business(v_worker.business_id) then
    raise exception 'Forbidden';
  end if;

  insert into public.surveillance_worker_availability_exceptions (
    business_id,
    surveillance_worker_id,
    exception_type,
    starts_at,
    ends_at,
    notes_operational,
    created_by
  )
  values (
    v_worker.business_id,
    p_surveillance_worker_id,
    p_exception_type,
    p_starts_at,
    p_ends_at,
    nullif(btrim(coalesce(p_notes_operational, '')), ''),
    auth.uid()
  )
  returning * into v_exception;

  return v_exception;
end;
$function$;

revoke all on function public.add_surveillance_worker_availability_exception(uuid, text, timestamptz, timestamptz, text) from public;
grant execute on function public.add_surveillance_worker_availability_exception(uuid, text, timestamptz, timestamptz, text) to authenticated;

create or replace function public.create_surveillance_review_task(
  p_surveillance_worker_id uuid,
  p_task_type text,
  p_due_at timestamptz default null,
  p_notes_operational text default null,
  p_enrolment_id uuid default null,
  p_assigned_to uuid default null
)
returns public.surveillance_review_tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker public.surveillance_workers%rowtype;
  v_task public.surveillance_review_tasks%rowtype;
begin
  select * into v_worker
    from public.surveillance_workers sw
   where sw.id = p_surveillance_worker_id;

  if v_worker.id is null then
    raise exception 'Worker not found.';
  end if;

  if not public.can_manage_surveillance_business(v_worker.business_id) then
    raise exception 'Forbidden';
  end if;

  insert into public.surveillance_review_tasks (
    business_id,
    surveillance_worker_id,
    enrolment_id,
    task_type,
    status,
    assigned_to,
    due_at,
    notes_operational,
    created_by,
    updated_by
  )
  values (
    v_worker.business_id,
    p_surveillance_worker_id,
    p_enrolment_id,
    p_task_type,
    'open',
    p_assigned_to,
    p_due_at,
    nullif(btrim(coalesce(p_notes_operational, '')), ''),
    auth.uid(),
    auth.uid()
  )
  returning * into v_task;

  return v_task;
end;
$function$;

revoke all on function public.create_surveillance_review_task(uuid, text, timestamptz, text, uuid, uuid) from public;
grant execute on function public.create_surveillance_review_task(uuid, text, timestamptz, text, uuid, uuid) to authenticated;

create or replace function public.update_surveillance_review_task_status(
  p_task_id uuid,
  p_status text,
  p_notes_operational text default null
)
returns public.surveillance_review_tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_task public.surveillance_review_tasks%rowtype;
begin
  select * into v_task
    from public.surveillance_review_tasks srt
   where srt.id = p_task_id
   for update;

  if v_task.id is null then
    raise exception 'Review task not found.';
  end if;

  if not public.can_manage_surveillance_business(v_task.business_id) then
    raise exception 'Forbidden';
  end if;

  update public.surveillance_review_tasks
     set status = p_status,
         notes_operational = coalesce(nullif(btrim(coalesce(p_notes_operational, '')), ''), notes_operational),
         updated_by = auth.uid()
   where id = p_task_id
   returning * into v_task;

  return v_task;
end;
$function$;

revoke all on function public.update_surveillance_review_task_status(uuid, text, text) from public;
grant execute on function public.update_surveillance_review_task_status(uuid, text, text) to authenticated;

create or replace function public.bulk_enroll_surveillance_workers_by_type(
  p_business_id text,
  p_surveillance_type_id uuid,
  p_site_id text default null,
  p_selected_worker_role_id uuid default null,
  p_baseline_required boolean default false,
  p_next_due_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker record;
  v_count integer := 0;
begin
  if not public.can_manage_surveillance_business(p_business_id) then
    raise exception 'Forbidden';
  end if;

  for v_worker in
    select sw.id
      from public.surveillance_workers sw
     where sw.business_id = p_business_id
       and sw.is_active = true
       and sw.requires_health_surveillance = true
       and (p_site_id is null or sw.site_id = p_site_id)
       and (p_selected_worker_role_id is null or sw.selected_worker_role_id = p_selected_worker_role_id)
  loop
    begin
      perform public.enroll_surveillance_worker_record_by_type(
        p_surveillance_type_id,
        v_worker.id,
        p_next_due_at,
        p_baseline_required
      );
      v_count := v_count + 1;
    exception
      when others then
        continue;
    end;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.bulk_enroll_surveillance_workers_by_type(text, uuid, text, uuid, boolean, timestamptz) from public;
grant execute on function public.bulk_enroll_surveillance_workers_by_type(text, uuid, text, uuid, boolean, timestamptz) to authenticated;

create or replace function public.generate_surveillance_notifications(
  p_business_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrolment record;
  v_appointment record;
  v_count integer := 0;
  v_notification_id uuid;
begin
  if not public.can_manage_surveillance_business(p_business_id) then
    raise exception 'Forbidden';
  end if;

  for v_enrolment in
    select se.id, se.business_id, se.surveillance_worker_id, se.worker_user_id, se.next_due_at
      from public.surveillance_enrolments se
     where se.business_id = p_business_id
       and se.status = 'active'
       and se.next_due_at is not null
  loop
    if v_enrolment.next_due_at <= now() then
      if not exists (
        select 1 from public.surveillance_notifications sn
         where sn.business_id = p_business_id
           and sn.enrolment_id = v_enrolment.id
           and sn.notification_type = 'overdue_worker'
           and sn.delivery_status in ('pending', 'sent', 'acknowledged')
      ) then
        insert into public.surveillance_notifications (
          business_id, surveillance_worker_id, enrolment_id, notification_type, delivery_channel, scheduled_for, sent_at, delivery_status, template_version, created_by
        ) values (
          p_business_id, v_enrolment.surveillance_worker_id, v_enrolment.id, 'overdue_worker', 'app_push', now(), now(), 'sent', 'v1', auth.uid()
        ) returning id into v_notification_id;

        insert into public.surveillance_notification_recipients (
          notification_id, business_id, target_user_id, target_role, delivery_address
        ) values (
          v_notification_id, p_business_id, v_enrolment.worker_user_id, 'worker', null
        );
        v_count := v_count + 1;
      end if;
    elsif v_enrolment.next_due_at <= now() + interval '30 days' then
      if not exists (
        select 1 from public.surveillance_notifications sn
         where sn.business_id = p_business_id
           and sn.enrolment_id = v_enrolment.id
           and sn.notification_type = 'due_30_day'
           and sn.delivery_status in ('pending', 'sent', 'acknowledged')
      ) then
        insert into public.surveillance_notifications (
          business_id, surveillance_worker_id, enrolment_id, notification_type, delivery_channel, scheduled_for, sent_at, delivery_status, template_version, created_by
        ) values (
          p_business_id, v_enrolment.surveillance_worker_id, v_enrolment.id, 'due_30_day', 'app_push', now(), now(), 'sent', 'v1', auth.uid()
        ) returning id into v_notification_id;

        insert into public.surveillance_notification_recipients (
          notification_id, business_id, target_user_id, target_role, delivery_address
        ) values (
          v_notification_id, p_business_id, v_enrolment.worker_user_id, 'worker', null
        );
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  for v_appointment in
    select sa.id, sa.business_id, sa.surveillance_worker_id, sa.worker_user_id, sa.scheduled_at
      from public.surveillance_appointments sa
     where sa.business_id = p_business_id
       and sa.status in ('scheduled', 'confirmed', 'rescheduled')
       and sa.scheduled_at >= date_trunc('day', now())
       and sa.scheduled_at < date_trunc('day', now()) + interval '1 day'
  loop
    if not exists (
      select 1 from public.surveillance_notifications sn
       where sn.business_id = p_business_id
         and sn.appointment_id = v_appointment.id
         and sn.notification_type = 'day_of'
         and sn.delivery_status in ('pending', 'sent', 'acknowledged')
    ) then
      insert into public.surveillance_notifications (
        business_id, surveillance_worker_id, appointment_id, notification_type, delivery_channel, scheduled_for, sent_at, delivery_status, template_version, created_by
      ) values (
        p_business_id, v_appointment.surveillance_worker_id, v_appointment.id, 'day_of', 'app_push', now(), now(), 'sent', 'v1', auth.uid()
      ) returning id into v_notification_id;

      insert into public.surveillance_notification_recipients (
        notification_id, business_id, target_user_id, target_role, delivery_address
      ) values (
        v_notification_id, p_business_id, v_appointment.worker_user_id, 'worker', null
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.generate_surveillance_notifications(text) from public;
grant execute on function public.generate_surveillance_notifications(text) to authenticated;

commit;
