begin;

-- Health surveillance foundation
--
-- Privacy model:
-- - store operational scheduling / workflow metadata only
-- - do not store clinical measurements, reports, diagnoses, or attachments
-- - all state transitions happen through audited RPCs

alter table public.user_accounts
  drop constraint if exists user_accounts_role_check;

alter table public.user_accounts
  add constraint user_accounts_role_check
  check (
    role = any (
      array[
        'worker'::text,
        'medic'::text,
        'admin'::text,
        'pending_medic'::text,
        'occ_health'::text,
        'pending_occ_health'::text,
        'superuser'::text
      ]
    )
  );

alter table public.worker_memberships
  drop constraint if exists worker_memberships_role_check;

alter table public.worker_memberships
  add constraint worker_memberships_role_check
  check (
    role = any (
      array[
        'worker'::text,
        'pending_medic'::text
      ]
    )
  );

drop policy if exists user_accounts_admin_manage_medics on public.user_accounts;

create policy user_accounts_admin_manage_medics
on public.user_accounts
for update
to authenticated
using (
  public.is_admin_for_business(business_id)
  and role in ('medic', 'pending_medic', 'occ_health', 'pending_occ_health')
)
with check (
  public.is_admin_for_business(business_id)
  and role in ('medic', 'pending_medic', 'occ_health', 'pending_occ_health')
);

insert into public.modules (
  key,
  name,
  category,
  status,
  is_billable,
  billing_category,
  current_version
)
values (
  'health_surveillance',
  'Health Surveillance',
  'custom',
  'active',
  true,
  'health_surveillance',
  1
)
on conflict (key) do update
set
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  is_billable = excluded.is_billable,
  billing_category = excluded.billing_category,
  current_version = excluded.current_version,
  updated_at = now();

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'surveillance_program_code'
  ) then
    create type public.surveillance_program_code as enum (
      'general',
      'respiratory',
      'hearing',
      'chemical',
      'dust',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'surveillance_enrolment_status'
  ) then
    create type public.surveillance_enrolment_status as enum (
      'active',
      'paused',
      'completed',
      'removed'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'surveillance_appointment_status'
  ) then
    create type public.surveillance_appointment_status as enum (
      'scheduled',
      'confirmed',
      'completed',
      'rescheduled',
      'cancelled',
      'did_not_attend'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'surveillance_outcome_status'
  ) then
    create type public.surveillance_outcome_status as enum (
      'completed',
      'followup_required',
      'external_review_required',
      'temporary_restriction',
      'cleared'
    );
  end if;
end $$;

create table if not exists public.surveillance_programs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  code public.surveillance_program_code not null,
  name text not null,
  description text null,
  is_active boolean not null default true,
  interval_days integer not null default 365 check (interval_days > 0 and interval_days <= 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table if not exists public.surveillance_enrolments (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  worker_display_name text not null check (btrim(worker_display_name) <> ''),
  program_id uuid not null references public.surveillance_programs(id) on delete restrict,
  status public.surveillance_enrolment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  next_due_at timestamptz null,
  next_appointment_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists surveillance_enrolments_active_program_idx
  on public.surveillance_enrolments (business_id, worker_user_id, program_id)
  where status in ('active', 'paused');

create index if not exists surveillance_enrolments_business_due_idx
  on public.surveillance_enrolments (business_id, next_due_at);

create index if not exists surveillance_enrolments_worker_idx
  on public.surveillance_enrolments (worker_user_id, status, next_due_at);

create table if not exists public.surveillance_appointments (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  enrolment_id uuid not null references public.surveillance_enrolments(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  worker_display_name text not null check (btrim(worker_display_name) <> ''),
  program_id uuid not null references public.surveillance_programs(id) on delete restrict,
  assigned_staff_user_id uuid null references auth.users(id) on delete set null,
  assigned_staff_name text null,
  site_id text null references public.sites(id) on delete set null,
  scheduled_at timestamptz not null,
  location text null,
  appointment_type text not null default 'periodic' check (char_length(appointment_type) <= 64),
  status public.surveillance_appointment_status not null default 'scheduled',
  pre_appointment_instructions text null check (
    pre_appointment_instructions is null or char_length(pre_appointment_instructions) <= 1000
  ),
  cancelled_reason text null check (cancelled_reason is null or char_length(cancelled_reason) <= 240),
  completed_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surveillance_appointments_business_schedule_idx
  on public.surveillance_appointments (business_id, scheduled_at);

create index if not exists surveillance_appointments_worker_schedule_idx
  on public.surveillance_appointments (worker_user_id, scheduled_at desc);

create index if not exists surveillance_appointments_open_status_idx
  on public.surveillance_appointments (business_id, status, scheduled_at)
  where status in ('scheduled', 'confirmed', 'rescheduled');

create table if not exists public.surveillance_outcomes_minimal (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null unique references public.surveillance_appointments(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  worker_display_name text not null check (btrim(worker_display_name) <> ''),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_by_name text null,
  outcome_status public.surveillance_outcome_status not null,
  restriction_flag boolean not null default false,
  next_due_at timestamptz null,
  operational_notes text null check (
    operational_notes is null or char_length(operational_notes) <= 500
  ),
  external_record_ref text null check (
    external_record_ref is null or char_length(external_record_ref) <= 120
  ),
  created_at timestamptz not null default now()
);

create index if not exists surveillance_outcomes_business_created_idx
  on public.surveillance_outcomes_minimal (business_id, created_at desc);

create table if not exists public.surveillance_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  worker_user_id uuid null references auth.users(id) on delete set null,
  appointment_id uuid null references public.surveillance_appointments(id) on delete set null,
  enrolment_id uuid null references public.surveillance_enrolments(id) on delete set null,
  event_type text not null check (btrim(event_type) <> ''),
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint surveillance_audit_events_payload_object
    check (jsonb_typeof(event_payload) = 'object')
);

create index if not exists surveillance_audit_business_created_idx
  on public.surveillance_audit_events (business_id, created_at desc);

drop trigger if exists surveillance_programs_set_updated_at on public.surveillance_programs;
create trigger surveillance_programs_set_updated_at
before update on public.surveillance_programs
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_enrolments_set_updated_at on public.surveillance_enrolments;
create trigger surveillance_enrolments_set_updated_at
before update on public.surveillance_enrolments
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_appointments_set_updated_at on public.surveillance_appointments;
create trigger surveillance_appointments_set_updated_at
before update on public.surveillance_appointments
for each row
execute function public.set_updated_at_timestamp();

create or replace function public.is_occ_health_for_business(p_business_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and ua.role = 'occ_health'
      and ua.business_id = p_business_id
      and coalesce(ua.is_inactive, false) = false
      and (ua.contract_end_date is null or ua.contract_end_date >= now())
  );
$function$;

revoke all on function public.is_occ_health_for_business(text) from public;
grant execute on function public.is_occ_health_for_business(text) to authenticated;

create or replace function public.can_manage_surveillance_business(p_business_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and (
        (ua.role = 'admin' and ua.business_id = p_business_id)
        or (
          ua.role = 'occ_health'
          and ua.business_id = p_business_id
          and coalesce(ua.is_inactive, false) = false
          and (ua.contract_end_date is null or ua.contract_end_date >= now())
        )
        or ua.role = 'superuser'
      )
  );
$function$;

revoke all on function public.can_manage_surveillance_business(text) from public;
grant execute on function public.can_manage_surveillance_business(text) to authenticated;

create or replace function public.can_read_surveillance_business(p_business_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.can_manage_surveillance_business(p_business_id);
$function$;

revoke all on function public.can_read_surveillance_business(text) from public;
grant execute on function public.can_read_surveillance_business(text) to authenticated;

create or replace function public.log_surveillance_audit_event(
  p_business_id text,
  p_event_type text,
  p_worker_user_id uuid default null,
  p_appointment_id uuid default null,
  p_enrolment_id uuid default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    appointment_id,
    enrolment_id,
    event_type,
    event_payload
  )
  values (
    p_business_id,
    auth.uid(),
    p_worker_user_id,
    p_appointment_id,
    p_enrolment_id,
    p_event_type,
    coalesce(p_event_payload, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.log_surveillance_audit_event(text, text, uuid, uuid, uuid, jsonb) from public;
grant execute on function public.log_surveillance_audit_event(text, text, uuid, uuid, uuid, jsonb) to authenticated;

create or replace function public.refresh_surveillance_enrolment_schedule(p_enrolment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_next_appointment timestamptz;
begin
  select min(sa.scheduled_at)
    into v_next_appointment
    from public.surveillance_appointments sa
   where sa.enrolment_id = p_enrolment_id
     and sa.status in ('scheduled', 'confirmed', 'rescheduled');

  update public.surveillance_enrolments
     set next_appointment_at = v_next_appointment
   where id = p_enrolment_id;
end;
$function$;

revoke all on function public.refresh_surveillance_enrolment_schedule(uuid) from public;
grant execute on function public.refresh_surveillance_enrolment_schedule(uuid) to authenticated;

create or replace function public.enroll_worker_in_surveillance(
  p_program_id uuid,
  p_worker_user_id uuid,
  p_next_due_at timestamptz default null
)
returns public.surveillance_enrolments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program public.surveillance_programs%rowtype;
  v_worker public.user_accounts%rowtype;
  v_enrolment public.surveillance_enrolments%rowtype;
begin
  select *
    into v_program
    from public.surveillance_programs sp
   where sp.id = p_program_id
     and sp.is_active = true;

  if v_program.id is null then
    raise exception 'Surveillance program not found.'
      using errcode = 'P0001';
  end if;

  if not public.can_manage_surveillance_business(v_program.business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  if not public.is_business_module_enabled(v_program.business_id, 'health_surveillance') then
    raise exception 'Health surveillance module is not enabled for this business.'
      using errcode = 'P0001';
  end if;

  select *
    into v_worker
    from public.user_accounts ua
   where ua.id = p_worker_user_id
     and ua.business_id = v_program.business_id;

  if v_worker.id is null then
    raise exception 'Worker not found for this business.'
      using errcode = 'P0001';
  end if;

  if v_worker.role <> 'worker' then
    raise exception 'Only workers can be enrolled in surveillance programs.'
      using errcode = 'P0001';
  end if;

  insert into public.surveillance_enrolments (
    business_id,
    worker_user_id,
    worker_display_name,
    program_id,
    status,
    enrolled_at,
    next_due_at,
    created_by,
    updated_by
  )
  values (
    v_program.business_id,
    v_worker.id,
    coalesce(nullif(btrim(v_worker.display_name), ''), v_worker.email),
    v_program.id,
    'active',
    now(),
    p_next_due_at,
    auth.uid(),
    auth.uid()
  )
  returning *
    into v_enrolment;

  perform public.log_surveillance_audit_event(
    v_program.business_id,
    'worker_enrolled',
    v_worker.id,
    null,
    v_enrolment.id,
    jsonb_build_object('program_id', v_program.id, 'next_due_at', p_next_due_at)
  );

  return v_enrolment;
exception
  when unique_violation then
    raise exception 'Worker is already actively enrolled in this surveillance program.'
      using errcode = 'P0001';
end;
$function$;

revoke all on function public.enroll_worker_in_surveillance(uuid, uuid, timestamptz) from public;
grant execute on function public.enroll_worker_in_surveillance(uuid, uuid, timestamptz) to authenticated;

create or replace function public.schedule_surveillance_appointment(
  p_enrolment_id uuid,
  p_scheduled_at timestamptz,
  p_location text default null,
  p_appointment_type text default 'periodic',
  p_instructions text default null
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
begin
  if p_scheduled_at <= now() - interval '1 day' then
    raise exception 'Scheduled time is invalid.'
      using errcode = 'P0001';
  end if;

  select *
    into v_enrolment
    from public.surveillance_enrolments se
   where se.id = p_enrolment_id;

  if v_enrolment.id is null then
    raise exception 'Enrolment not found.'
      using errcode = 'P0001';
  end if;

  if v_enrolment.status <> 'active' then
    raise exception 'Only active enrolments can be scheduled.'
      using errcode = 'P0001';
  end if;

  if not public.can_manage_surveillance_business(v_enrolment.business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  if not public.is_business_module_enabled(v_enrolment.business_id, 'health_surveillance') then
    raise exception 'Health surveillance module is not enabled for this business.'
      using errcode = 'P0001';
  end if;

  select *
    into v_program
    from public.surveillance_programs sp
   where sp.id = v_enrolment.program_id;

  select *
    into v_actor
    from public.user_accounts ua
   where ua.id = auth.uid();

  select sa.id
    into v_existing
    from public.surveillance_appointments sa
   where sa.enrolment_id = v_enrolment.id
     and sa.status in ('scheduled', 'confirmed', 'rescheduled')
   order by sa.scheduled_at asc
   limit 1;

  if v_existing is not null then
    raise exception 'This enrolment already has an open appointment.'
      using errcode = 'P0001';
  end if;

  insert into public.surveillance_appointments (
    business_id,
    enrolment_id,
    worker_user_id,
    worker_display_name,
    program_id,
    assigned_staff_user_id,
    assigned_staff_name,
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
    v_enrolment.worker_user_id,
    v_enrolment.worker_display_name,
    v_program.id,
    case when v_actor.role = 'occ_health' then v_actor.id else null end,
    case when v_actor.role = 'occ_health' then v_actor.display_name else null end,
    p_scheduled_at,
    nullif(btrim(coalesce(p_location, '')), ''),
    coalesce(nullif(btrim(coalesce(p_appointment_type, '')), ''), 'periodic'),
    'scheduled',
    nullif(btrim(coalesce(p_instructions, '')), ''),
    auth.uid(),
    auth.uid()
  )
  returning *
    into v_appointment;

  update public.surveillance_enrolments
     set next_appointment_at = v_appointment.scheduled_at,
         updated_by = auth.uid()
   where id = v_enrolment.id;

  perform public.log_surveillance_audit_event(
    v_enrolment.business_id,
    'appointment_scheduled',
    v_enrolment.worker_user_id,
    v_appointment.id,
    v_enrolment.id,
    jsonb_build_object(
      'scheduled_at', p_scheduled_at,
      'program_id', v_program.id,
      'appointment_type', coalesce(nullif(btrim(coalesce(p_appointment_type, '')), ''), 'periodic')
    )
  );

  return v_appointment;
end;
$function$;

revoke all on function public.schedule_surveillance_appointment(uuid, timestamptz, text, text, text) from public;
grant execute on function public.schedule_surveillance_appointment(uuid, timestamptz, text, text, text) to authenticated;

create or replace function public.reschedule_surveillance_appointment(
  p_appointment_id uuid,
  p_scheduled_at timestamptz,
  p_location text default null
)
returns public.surveillance_appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appointment public.surveillance_appointments%rowtype;
begin
  select *
    into v_appointment
    from public.surveillance_appointments sa
   where sa.id = p_appointment_id
   for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found.'
      using errcode = 'P0001';
  end if;

  if not public.can_manage_surveillance_business(v_appointment.business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be rescheduled.'
      using errcode = 'P0001';
  end if;

  update public.surveillance_appointments
     set scheduled_at = p_scheduled_at,
         location = nullif(btrim(coalesce(p_location, '')), ''),
         status = 'rescheduled',
         updated_by = auth.uid()
   where id = v_appointment.id
   returning *
    into v_appointment;

  perform public.refresh_surveillance_enrolment_schedule(v_appointment.enrolment_id);

  perform public.log_surveillance_audit_event(
    v_appointment.business_id,
    'appointment_rescheduled',
    v_appointment.worker_user_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    jsonb_build_object('scheduled_at', p_scheduled_at)
  );

  return v_appointment;
end;
$function$;

revoke all on function public.reschedule_surveillance_appointment(uuid, timestamptz, text) from public;
grant execute on function public.reschedule_surveillance_appointment(uuid, timestamptz, text) to authenticated;

create or replace function public.mark_surveillance_attendance(
  p_appointment_id uuid,
  p_status public.surveillance_appointment_status
)
returns public.surveillance_appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appointment public.surveillance_appointments%rowtype;
begin
  if p_status not in ('confirmed', 'did_not_attend') then
    raise exception 'Attendance status must be confirmed or did_not_attend.'
      using errcode = 'P0001';
  end if;

  select *
    into v_appointment
    from public.surveillance_appointments sa
   where sa.id = p_appointment_id
   for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found.'
      using errcode = 'P0001';
  end if;

  if not public.can_manage_surveillance_business(v_appointment.business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can have attendance marked.'
      using errcode = 'P0001';
  end if;

  update public.surveillance_appointments
     set status = p_status,
         updated_by = auth.uid()
   where id = v_appointment.id
   returning *
    into v_appointment;

  perform public.refresh_surveillance_enrolment_schedule(v_appointment.enrolment_id);

  perform public.log_surveillance_audit_event(
    v_appointment.business_id,
    'appointment_attendance_marked',
    v_appointment.worker_user_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    jsonb_build_object('status', p_status)
  );

  return v_appointment;
end;
$function$;

revoke all on function public.mark_surveillance_attendance(uuid, public.surveillance_appointment_status) from public;
grant execute on function public.mark_surveillance_attendance(uuid, public.surveillance_appointment_status) to authenticated;

create or replace function public.complete_surveillance_appointment(
  p_appointment_id uuid,
  p_outcome_status public.surveillance_outcome_status,
  p_restriction_flag boolean default false,
  p_next_due_at timestamptz default null,
  p_operational_notes text default null
)
returns public.surveillance_outcomes_minimal
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appointment public.surveillance_appointments%rowtype;
  v_actor public.user_accounts%rowtype;
  v_outcome public.surveillance_outcomes_minimal%rowtype;
begin
  select *
    into v_appointment
    from public.surveillance_appointments sa
   where sa.id = p_appointment_id
   for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found.'
      using errcode = 'P0001';
  end if;

  if not public.can_manage_surveillance_business(v_appointment.business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be completed.'
      using errcode = 'P0001';
  end if;

  select *
    into v_actor
    from public.user_accounts ua
   where ua.id = auth.uid();

  update public.surveillance_appointments
     set status = 'completed',
         completed_at = now(),
         updated_by = auth.uid()
   where id = v_appointment.id
   returning *
    into v_appointment;

  insert into public.surveillance_outcomes_minimal (
    business_id,
    appointment_id,
    worker_user_id,
    worker_display_name,
    recorded_by,
    recorded_by_name,
    outcome_status,
    restriction_flag,
    next_due_at,
    operational_notes
  )
  values (
    v_appointment.business_id,
    v_appointment.id,
    v_appointment.worker_user_id,
    v_appointment.worker_display_name,
    auth.uid(),
    coalesce(nullif(btrim(coalesce(v_actor.display_name, '')), ''), 'Occ Health'),
    p_outcome_status,
    coalesce(p_restriction_flag, false),
    p_next_due_at,
    nullif(btrim(coalesce(p_operational_notes, '')), '')
  )
  on conflict (appointment_id) do update
    set outcome_status = excluded.outcome_status,
        restriction_flag = excluded.restriction_flag,
        next_due_at = excluded.next_due_at,
        operational_notes = excluded.operational_notes,
        recorded_by = excluded.recorded_by,
        recorded_by_name = excluded.recorded_by_name
  returning *
    into v_outcome;

  update public.surveillance_enrolments
     set next_due_at = p_next_due_at,
         next_appointment_at = null,
         updated_by = auth.uid()
   where id = v_appointment.enrolment_id;

  perform public.log_surveillance_audit_event(
    v_appointment.business_id,
    'appointment_completed',
    v_appointment.worker_user_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    jsonb_build_object(
      'outcome_status', p_outcome_status,
      'restriction_flag', coalesce(p_restriction_flag, false),
      'next_due_at', p_next_due_at
    )
  );

  return v_outcome;
end;
$function$;

revoke all on function public.complete_surveillance_appointment(uuid, public.surveillance_outcome_status, boolean, timestamptz, text) from public;
grant execute on function public.complete_surveillance_appointment(uuid, public.surveillance_outcome_status, boolean, timestamptz, text) to authenticated;

create or replace function public.cancel_surveillance_appointment(
  p_appointment_id uuid,
  p_reason text default null
)
returns public.surveillance_appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appointment public.surveillance_appointments%rowtype;
begin
  select *
    into v_appointment
    from public.surveillance_appointments sa
   where sa.id = p_appointment_id
   for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found.'
      using errcode = 'P0001';
  end if;

  if not public.can_manage_surveillance_business(v_appointment.business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be cancelled.'
      using errcode = 'P0001';
  end if;

  update public.surveillance_appointments
     set status = 'cancelled',
         cancelled_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by = auth.uid()
   where id = v_appointment.id
   returning *
    into v_appointment;

  perform public.refresh_surveillance_enrolment_schedule(v_appointment.enrolment_id);

  perform public.log_surveillance_audit_event(
    v_appointment.business_id,
    'appointment_cancelled',
    v_appointment.worker_user_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return v_appointment;
end;
$function$;

revoke all on function public.cancel_surveillance_appointment(uuid, text) from public;
grant execute on function public.cancel_surveillance_appointment(uuid, text) to authenticated;

create or replace function public.get_my_next_surveillance_appointment()
returns table (
  appointment_id uuid,
  business_id text,
  enrolment_id uuid,
  program_id uuid,
  program_code public.surveillance_program_code,
  program_name text,
  scheduled_at timestamptz,
  location text,
  appointment_type text,
  status public.surveillance_appointment_status,
  pre_appointment_instructions text,
  next_due_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    sa.id as appointment_id,
    sa.business_id,
    sa.enrolment_id,
    sa.program_id,
    sp.code as program_code,
    sp.name as program_name,
    sa.scheduled_at,
    sa.location,
    sa.appointment_type,
    sa.status,
    sa.pre_appointment_instructions,
    se.next_due_at
  from public.surveillance_appointments sa
  join public.surveillance_enrolments se
    on se.id = sa.enrolment_id
  join public.surveillance_programs sp
    on sp.id = sa.program_id
  where sa.worker_user_id = auth.uid()
    and sa.status in ('scheduled', 'confirmed', 'rescheduled')
    and public.is_business_module_enabled(sa.business_id, 'health_surveillance')
  order by sa.scheduled_at asc
  limit 1;
$function$;

revoke all on function public.get_my_next_surveillance_appointment() from public;
grant execute on function public.get_my_next_surveillance_appointment() to authenticated;

create or replace function public.get_surveillance_dashboard_metrics(p_business_id text)
returns table (
  upcoming_count bigint,
  due_soon_count bigint,
  overdue_count bigint,
  completed_today_count bigint,
  completed_week_count bigint,
  active_enrolment_count bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.can_read_surveillance_business(p_business_id) then
    raise exception 'Forbidden'
      using errcode = 'P0001';
  end if;

  return query
  select
    (
      select count(*)::bigint
      from public.surveillance_appointments sa
      where sa.business_id = p_business_id
        and sa.status in ('scheduled', 'confirmed', 'rescheduled')
        and sa.scheduled_at >= now()
    ) as upcoming_count,
    (
      select count(*)::bigint
      from public.surveillance_enrolments se
      where se.business_id = p_business_id
        and se.status = 'active'
        and se.next_due_at is not null
        and se.next_due_at >= now()
        and se.next_due_at < now() + interval '14 days'
    ) as due_soon_count,
    (
      select count(*)::bigint
      from public.surveillance_enrolments se
      where se.business_id = p_business_id
        and se.status = 'active'
        and se.next_due_at is not null
        and se.next_due_at < now()
    ) as overdue_count,
    (
      select count(*)::bigint
      from public.surveillance_appointments sa
      where sa.business_id = p_business_id
        and sa.status = 'completed'
        and sa.completed_at >= date_trunc('day', now())
    ) as completed_today_count,
    (
      select count(*)::bigint
      from public.surveillance_appointments sa
      where sa.business_id = p_business_id
        and sa.status = 'completed'
        and sa.completed_at >= date_trunc('week', now())
    ) as completed_week_count,
    (
      select count(*)::bigint
      from public.surveillance_enrolments se
      where se.business_id = p_business_id
        and se.status = 'active'
    ) as active_enrolment_count;
end;
$function$;

revoke all on function public.get_surveillance_dashboard_metrics(text) from public;
grant execute on function public.get_surveillance_dashboard_metrics(text) to authenticated;

insert into public.business_modules (business_id, module_key, enabled, config)
select b.id, 'health_surveillance', false, '{}'::jsonb
from public.businesses b
where not exists (
  select 1
  from public.business_modules bm
  where bm.business_id = b.id
    and bm.module_key = 'health_surveillance'
);

insert into public.surveillance_programs (business_id, code, name, description, is_active, interval_days)
select
  b.id,
  x.code::public.surveillance_program_code,
  x.name,
  x.description,
  true,
  x.interval_days
from public.businesses b
cross join (
  values
    ('general', 'General Surveillance', 'Operational catch-all program when the business has not separated streams yet.', 365),
    ('respiratory', 'Respiratory Surveillance', 'Respiratory fit-testing or exposure follow-up managed outside the platform.', 365),
    ('hearing', 'Hearing Surveillance', 'Noise exposure screening cadence with external clinical records retained off-platform.', 365),
    ('chemical', 'Chemical Exposure Surveillance', 'Operational tracking for workers subject to chemical monitoring programs.', 180)
) as x(code, name, description, interval_days)
where not exists (
  select 1
  from public.surveillance_programs sp
  where sp.business_id = b.id
    and sp.code = x.code::public.surveillance_program_code
);

alter table public.surveillance_programs enable row level security;
alter table public.surveillance_enrolments enable row level security;
alter table public.surveillance_appointments enable row level security;
alter table public.surveillance_outcomes_minimal enable row level security;
alter table public.surveillance_audit_events enable row level security;

create policy surveillance_programs_select_scoped
on public.surveillance_programs
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

create policy surveillance_enrolments_select_scoped
on public.surveillance_enrolments
for select
to authenticated
using (
  worker_user_id = auth.uid()
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

create policy surveillance_appointments_select_scoped
on public.surveillance_appointments
for select
to authenticated
using (
  worker_user_id = auth.uid()
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

create policy surveillance_outcomes_select_internal
on public.surveillance_outcomes_minimal
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

create policy surveillance_audit_events_select_internal
on public.surveillance_audit_events
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

commit;
