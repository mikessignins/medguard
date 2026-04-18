begin;

create type public.surveillance_worker_source as enum ('app_user', 'manual_entry');

create table if not exists public.surveillance_workers (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  app_user_id uuid null references auth.users(id) on delete set null,
  worker_source public.surveillance_worker_source not null default 'manual_entry',
  display_name text not null check (btrim(display_name) <> ''),
  phone text null check (phone is null or char_length(phone) <= 64),
  email text null check (email is null or char_length(email) <= 320),
  selected_worker_role_id uuid null references public.business_worker_roles(id) on delete set null,
  job_role_name text not null check (btrim(job_role_name) <> ''),
  site_id text null references public.sites(id) on delete set null,
  site_name text null check (site_name is null or char_length(site_name) <= 160),
  requires_health_surveillance boolean not null default false,
  notes_operational text null check (notes_operational is null or char_length(notes_operational) <= 500),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists surveillance_workers_business_app_user_uidx
  on public.surveillance_workers (business_id, app_user_id)
  where app_user_id is not null;

create index if not exists surveillance_workers_business_search_idx
  on public.surveillance_workers (business_id, requires_health_surveillance, display_name);

create index if not exists surveillance_workers_business_site_idx
  on public.surveillance_workers (business_id, site_id);

drop trigger if exists surveillance_workers_set_updated_at on public.surveillance_workers;
create trigger surveillance_workers_set_updated_at
before update on public.surveillance_workers
for each row
execute function public.set_updated_at_timestamp();

alter table public.surveillance_enrolments
  add column if not exists surveillance_worker_id uuid null references public.surveillance_workers(id) on delete restrict;

alter table public.surveillance_appointments
  add column if not exists surveillance_worker_id uuid null references public.surveillance_workers(id) on delete restrict;

alter table public.surveillance_outcomes_minimal
  add column if not exists surveillance_worker_id uuid null references public.surveillance_workers(id) on delete restrict;

alter table public.surveillance_audit_events
  add column if not exists surveillance_worker_id uuid null references public.surveillance_workers(id) on delete set null;

alter table public.surveillance_enrolments
  alter column worker_user_id drop not null;

alter table public.surveillance_appointments
  alter column worker_user_id drop not null;

alter table public.surveillance_outcomes_minimal
  alter column worker_user_id drop not null;

create index if not exists surveillance_enrolments_surveillance_worker_idx
  on public.surveillance_enrolments (surveillance_worker_id, status, next_due_at);

create index if not exists surveillance_appointments_surveillance_worker_idx
  on public.surveillance_appointments (surveillance_worker_id, scheduled_at desc);

create index if not exists surveillance_outcomes_surveillance_worker_idx
  on public.surveillance_outcomes_minimal (surveillance_worker_id, created_at desc);

insert into public.surveillance_workers (
  business_id,
  app_user_id,
  worker_source,
  display_name,
  email,
  selected_worker_role_id,
  job_role_name,
  requires_health_surveillance,
  created_by,
  updated_by
)
select
  wop.business_id,
  wop.worker_user_id,
  'app_user'::public.surveillance_worker_source,
  wop.worker_display_name,
  ua.email,
  wop.selected_worker_role_id,
  wop.job_role_name,
  wop.requires_health_surveillance,
  coalesce(wop.worker_user_id, auth.uid()),
  null
from public.worker_operational_profiles wop
left join public.user_accounts ua
  on ua.id = wop.worker_user_id
where not exists (
  select 1
  from public.surveillance_workers sw
  where sw.business_id = wop.business_id
    and sw.app_user_id = wop.worker_user_id
);

insert into public.surveillance_workers (
  business_id,
  app_user_id,
  worker_source,
  display_name,
  email,
  job_role_name,
  requires_health_surveillance,
  created_by,
  updated_by
)
select distinct
  se.business_id,
  se.worker_user_id,
  'app_user'::public.surveillance_worker_source,
  se.worker_display_name,
  ua.email,
  coalesce(nullif(btrim(wop.job_role_name), ''), 'Worker'),
  coalesce(wop.requires_health_surveillance, true),
  se.created_by,
  se.updated_by
from public.surveillance_enrolments se
left join public.user_accounts ua
  on ua.id = se.worker_user_id
left join public.worker_operational_profiles wop
  on wop.business_id = se.business_id
 and wop.worker_user_id = se.worker_user_id
where se.worker_user_id is not null
  and not exists (
    select 1
    from public.surveillance_workers sw
    where sw.business_id = se.business_id
      and sw.app_user_id = se.worker_user_id
  );

update public.surveillance_enrolments se
   set surveillance_worker_id = sw.id
  from public.surveillance_workers sw
 where se.surveillance_worker_id is null
   and se.business_id = sw.business_id
   and se.worker_user_id is not distinct from sw.app_user_id;

update public.surveillance_appointments sa
   set surveillance_worker_id = coalesce(
     se.surveillance_worker_id,
     (
       select sw.id
       from public.surveillance_workers sw
       where sw.business_id = sa.business_id
         and sa.worker_user_id is not distinct from sw.app_user_id
       limit 1
     )
   )
  from public.surveillance_enrolments se
 where sa.enrolment_id = se.id
   and sa.surveillance_worker_id is null
   and coalesce(
     se.surveillance_worker_id,
     (
       select sw.id
       from public.surveillance_workers sw
       where sw.business_id = sa.business_id
         and sa.worker_user_id is not distinct from sw.app_user_id
       limit 1
     )
   ) is not null;

update public.surveillance_outcomes_minimal som
   set surveillance_worker_id = coalesce(
     sa.surveillance_worker_id,
     (
       select sw.id
       from public.surveillance_workers sw
       where sw.business_id = som.business_id
         and som.worker_user_id is not distinct from sw.app_user_id
       limit 1
     )
   )
  from public.surveillance_appointments sa
 where som.appointment_id = sa.id
   and som.surveillance_worker_id is null
   and coalesce(
     sa.surveillance_worker_id,
     (
       select sw.id
       from public.surveillance_workers sw
       where sw.business_id = som.business_id
         and som.worker_user_id is not distinct from sw.app_user_id
       limit 1
     )
   ) is not null;

update public.surveillance_audit_events sae
   set surveillance_worker_id = coalesce(
     se.surveillance_worker_id,
     sa.surveillance_worker_id,
     (
       select sw.id
       from public.surveillance_workers sw
       where sw.business_id = sae.business_id
         and sae.worker_user_id is not distinct from sw.app_user_id
       limit 1
     )
   )
  from public.surveillance_enrolments se
  full join public.surveillance_appointments sa
    on sa.enrolment_id = se.id
 where sae.surveillance_worker_id is null
   and (se.id = sae.enrolment_id or sa.id = sae.appointment_id)
   and coalesce(
     se.surveillance_worker_id,
     sa.surveillance_worker_id,
     (
       select sw.id
       from public.surveillance_workers sw
       where sw.business_id = sae.business_id
         and sae.worker_user_id is not distinct from sw.app_user_id
       limit 1
     )
   ) is not null;

update public.surveillance_audit_events sae
   set surveillance_worker_id = (
     select sw.id
     from public.surveillance_workers sw
     where sw.business_id = sae.business_id
       and sae.worker_user_id is not distinct from sw.app_user_id
     limit 1
   )
 where sae.surveillance_worker_id is null
   and exists (
     select 1
     from public.surveillance_workers sw
     where sw.business_id = sae.business_id
       and sae.worker_user_id is not distinct from sw.app_user_id
   );

alter table public.surveillance_enrolments
  alter column surveillance_worker_id set not null;

alter table public.surveillance_appointments
  alter column surveillance_worker_id set not null;

alter table public.surveillance_outcomes_minimal
  alter column surveillance_worker_id set not null;

create or replace function public.upsert_surveillance_worker_for_app_user(
  p_business_id text,
  p_app_user_id uuid,
  p_display_name text,
  p_selected_worker_role_id uuid default null,
  p_job_role_name text default 'Worker',
  p_requires_health_surveillance boolean default false
)
returns public.surveillance_workers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account public.user_accounts%rowtype;
  v_worker public.surveillance_workers%rowtype;
begin
  select *
    into v_account
    from public.user_accounts ua
   where ua.id = p_app_user_id
     and ua.business_id = p_business_id
   limit 1;

  if not found then
    raise exception 'App worker account not found for this business';
  end if;

  insert into public.surveillance_workers (
    business_id,
    app_user_id,
    worker_source,
    display_name,
    email,
    selected_worker_role_id,
    job_role_name,
    requires_health_surveillance,
    created_by,
    updated_by
  )
  values (
    p_business_id,
    p_app_user_id,
    'app_user',
    coalesce(nullif(btrim(p_display_name), ''), coalesce(nullif(btrim(v_account.display_name), ''), v_account.email)),
    v_account.email,
    p_selected_worker_role_id,
    coalesce(nullif(btrim(p_job_role_name), ''), 'Worker'),
    p_requires_health_surveillance,
    coalesce(auth.uid(), p_app_user_id),
    auth.uid()
  )
  on conflict (business_id, app_user_id)
  do update
    set display_name = excluded.display_name,
        email = excluded.email,
        selected_worker_role_id = excluded.selected_worker_role_id,
        job_role_name = excluded.job_role_name,
        requires_health_surveillance = excluded.requires_health_surveillance,
        is_active = true,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning *
    into v_worker;

  return v_worker;
end;
$function$;

revoke all on function public.upsert_surveillance_worker_for_app_user(text, uuid, text, uuid, text, boolean) from public;
grant execute on function public.upsert_surveillance_worker_for_app_user(text, uuid, text, uuid, text, boolean) to authenticated;

create or replace function public.save_my_worker_operational_profile(
  p_selected_worker_role_id uuid default null,
  p_job_role_name text default null,
  p_job_role_source text default 'catalogue',
  p_other_role_text text default null,
  p_requires_health_surveillance boolean default false
)
returns public.worker_operational_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.user_accounts%rowtype;
  v_role public.business_worker_roles%rowtype;
  v_profile public.worker_operational_profiles%rowtype;
  v_job_role_source text;
  v_job_role_name text;
  v_other_role_text text;
  v_normalized_other text;
begin
  select *
    into v_actor
    from public.user_accounts ua
   where ua.id = auth.uid()
   limit 1;

  if not found then
    raise exception 'Unable to load account context';
  end if;

  if v_actor.role <> 'worker' then
    raise exception 'Only workers can save their operational profile';
  end if;

  if v_actor.business_id is null then
    raise exception 'No active business is available for this worker';
  end if;

  v_job_role_source := lower(btrim(coalesce(p_job_role_source, 'catalogue')));
  if v_job_role_source not in ('catalogue', 'other') then
    raise exception 'Invalid job role source';
  end if;

  if v_job_role_source = 'catalogue' then
    if p_selected_worker_role_id is null then
      raise exception 'A catalogue role must be selected';
    end if;

    select *
      into v_role
      from public.business_worker_roles bwr
     where bwr.id = p_selected_worker_role_id
       and bwr.business_id = v_actor.business_id
       and bwr.is_active = true;

    if not found then
      raise exception 'Selected worker role is not available for this business';
    end if;

    v_job_role_name := v_role.name;
    v_other_role_text := null;
  else
    v_other_role_text := nullif(btrim(coalesce(p_other_role_text, p_job_role_name, '')), '');
    if v_other_role_text is null then
      raise exception 'Other role text is required';
    end if;

    v_job_role_name := v_other_role_text;
    v_normalized_other := public.normalize_business_worker_role_name(v_other_role_text);

    select *
      into v_role
      from public.business_worker_roles bwr
     where bwr.business_id = v_actor.business_id
       and bwr.normalized_name = v_normalized_other
       and bwr.is_active = true
     limit 1;

    if found then
      p_selected_worker_role_id := v_role.id;
      v_job_role_name := v_role.name;
      v_job_role_source := 'catalogue';
      v_other_role_text := null;
    else
      insert into public.business_worker_role_suggestions (
        business_id,
        worker_user_id,
        submitted_text,
        normalized_text
      )
      values (
        v_actor.business_id,
        v_actor.id,
        v_other_role_text,
        v_normalized_other
      )
      on conflict (business_id, worker_user_id, normalized_text)
      do update
        set submitted_text = excluded.submitted_text,
            status = case
              when public.business_worker_role_suggestions.status in ('approved', 'merged')
                then public.business_worker_role_suggestions.status
              else 'pending'
            end,
            updated_at = now();
    end if;
  end if;

  insert into public.worker_operational_profiles (
    worker_user_id,
    business_id,
    worker_display_name,
    selected_worker_role_id,
    job_role_name,
    job_role_source,
    other_role_text,
    requires_health_surveillance,
    surveillance_declared_at
  )
  values (
    v_actor.id,
    v_actor.business_id,
    v_actor.display_name,
    p_selected_worker_role_id,
    v_job_role_name,
    v_job_role_source,
    v_other_role_text,
    p_requires_health_surveillance,
    case when p_requires_health_surveillance then now() else null end
  )
  on conflict (worker_user_id, business_id)
  do update
    set worker_display_name = excluded.worker_display_name,
        selected_worker_role_id = excluded.selected_worker_role_id,
        job_role_name = excluded.job_role_name,
        job_role_source = excluded.job_role_source,
        other_role_text = excluded.other_role_text,
        requires_health_surveillance = excluded.requires_health_surveillance,
        surveillance_declared_at = case
          when excluded.requires_health_surveillance
            then coalesce(public.worker_operational_profiles.surveillance_declared_at, now())
          else null
        end,
        updated_at = now()
  returning * into v_profile;

  perform public.upsert_surveillance_worker_for_app_user(
    v_actor.business_id,
    v_actor.id,
    v_profile.worker_display_name,
    v_profile.selected_worker_role_id,
    v_profile.job_role_name,
    v_profile.requires_health_surveillance
  );

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    event_type,
    event_payload
  )
  values (
    v_actor.business_id,
    auth.uid(),
    v_actor.id,
    (
      select sw.id
      from public.surveillance_workers sw
      where sw.business_id = v_actor.business_id
        and sw.app_user_id = v_actor.id
      limit 1
    ),
    'worker_operational_profile_saved',
    jsonb_build_object(
      'job_role_name', v_profile.job_role_name,
      'job_role_source', v_profile.job_role_source,
      'requires_health_surveillance', v_profile.requires_health_surveillance
    )
  );

  return v_profile;
end;
$function$;

revoke all on function public.save_my_worker_operational_profile(uuid, text, text, text, boolean) from public;
grant execute on function public.save_my_worker_operational_profile(uuid, text, text, text, boolean) to authenticated;

create or replace function public.create_manual_surveillance_worker(
  p_display_name text,
  p_job_role_name text,
  p_phone text default null,
  p_email text default null,
  p_selected_worker_role_id uuid default null,
  p_site_id text default null,
  p_requires_health_surveillance boolean default true,
  p_notes_operational text default null
)
returns public.surveillance_workers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.user_accounts%rowtype;
  v_site public.sites%rowtype;
  v_worker public.surveillance_workers%rowtype;
begin
  select *
    into v_actor
    from public.user_accounts ua
   where ua.id = auth.uid()
   limit 1;

  if not found then
    raise exception 'Unable to load account context';
  end if;

  if not public.can_manage_surveillance_business(v_actor.business_id) then
    raise exception 'Forbidden';
  end if;

  if not public.is_business_module_enabled(v_actor.business_id, 'health_surveillance') then
    raise exception 'Health surveillance module is not enabled for this business.';
  end if;

  if nullif(btrim(coalesce(p_display_name, '')), '') is null then
    raise exception 'Worker full name is required';
  end if;

  if nullif(btrim(coalesce(p_job_role_name, '')), '') is null then
    raise exception 'Worker job role is required';
  end if;

  if p_site_id is not null then
    select *
      into v_site
      from public.sites s
     where s.id = p_site_id
       and s.business_id = v_actor.business_id
     limit 1;

    if not found then
      raise exception 'Selected site is not available for this business';
    end if;
  end if;

  insert into public.surveillance_workers (
    business_id,
    worker_source,
    display_name,
    phone,
    email,
    selected_worker_role_id,
    job_role_name,
    site_id,
    site_name,
    requires_health_surveillance,
    notes_operational,
    created_by,
    updated_by
  )
  values (
    v_actor.business_id,
    'manual_entry',
    nullif(btrim(coalesce(p_display_name, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), ''),
    p_selected_worker_role_id,
    nullif(btrim(coalesce(p_job_role_name, '')), ''),
    v_site.id,
    v_site.name,
    coalesce(p_requires_health_surveillance, true),
    nullif(btrim(coalesce(p_notes_operational, '')), ''),
    auth.uid(),
    auth.uid()
  )
  returning *
    into v_worker;

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    event_type,
    event_payload
  )
  values (
    v_actor.business_id,
    auth.uid(),
    null,
    v_worker.id,
    'manual_surveillance_worker_created',
    jsonb_build_object(
      'worker_source', v_worker.worker_source,
      'job_role_name', v_worker.job_role_name,
      'site_id', v_worker.site_id
    )
  );

  return v_worker;
end;
$function$;

revoke all on function public.create_manual_surveillance_worker(text, text, text, text, uuid, text, boolean, text) from public;
grant execute on function public.create_manual_surveillance_worker(text, text, text, text, uuid, text, boolean, text) to authenticated;

create or replace function public.enroll_surveillance_worker_record(
  p_program_id uuid,
  p_surveillance_worker_id uuid,
  p_next_due_at timestamptz default null
)
returns public.surveillance_enrolments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program public.surveillance_programs%rowtype;
  v_worker public.surveillance_workers%rowtype;
  v_enrolment public.surveillance_enrolments%rowtype;
begin
  select *
    into v_program
    from public.surveillance_programs sp
   where sp.id = p_program_id
     and sp.is_active = true;

  if v_program.id is null then
    raise exception 'Surveillance program not found.';
  end if;

  if not public.can_manage_surveillance_business(v_program.business_id) then
    raise exception 'Forbidden';
  end if;

  select *
    into v_worker
    from public.surveillance_workers sw
   where sw.id = p_surveillance_worker_id
     and sw.business_id = v_program.business_id
     and sw.is_active = true
   limit 1;

  if v_worker.id is null then
    raise exception 'Surveillance worker not found for this business.';
  end if;

  insert into public.surveillance_enrolments (
    business_id,
    surveillance_worker_id,
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
    v_worker.app_user_id,
    v_worker.display_name,
    v_program.id,
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
    event_payload
  )
  values (
    v_program.business_id,
    auth.uid(),
    v_worker.app_user_id,
    v_worker.id,
    v_enrolment.id,
    'worker_enrolled',
    jsonb_build_object('program_id', v_program.id, 'next_due_at', p_next_due_at)
  );

  return v_enrolment;
exception
  when unique_violation then
    raise exception 'Worker is already actively enrolled in this surveillance program.';
end;
$function$;

revoke all on function public.enroll_surveillance_worker_record(uuid, uuid, timestamptz) from public;
grant execute on function public.enroll_surveillance_worker_record(uuid, uuid, timestamptz) to authenticated;

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
  v_worker public.user_accounts%rowtype;
  v_profile public.worker_operational_profiles%rowtype;
  v_surveillance_worker public.surveillance_workers%rowtype;
begin
  select *
    into v_worker
    from public.user_accounts ua
   where ua.id = p_worker_user_id
   limit 1;

  if v_worker.id is null then
    raise exception 'Worker not found for this business.';
  end if;

  if v_worker.role <> 'worker' then
    raise exception 'Only workers can be enrolled in surveillance programs.';
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

  return public.enroll_surveillance_worker_record(p_program_id, v_surveillance_worker.id, p_next_due_at);
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
    raise exception 'Scheduled time is invalid.';
  end if;

  select * into v_enrolment from public.surveillance_enrolments se where se.id = p_enrolment_id;
  if v_enrolment.id is null then raise exception 'Enrolment not found.'; end if;
  if v_enrolment.status <> 'active' then raise exception 'Only active enrolments can be scheduled.'; end if;
  if not public.can_manage_surveillance_business(v_enrolment.business_id) then raise exception 'Forbidden'; end if;
  if not public.is_business_module_enabled(v_enrolment.business_id, 'health_surveillance') then
    raise exception 'Health surveillance module is not enabled for this business.';
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
    v_enrolment.surveillance_worker_id,
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
  select * into v_appointment from public.surveillance_appointments sa where sa.id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Appointment not found.'; end if;
  if not public.can_manage_surveillance_business(v_appointment.business_id) then raise exception 'Forbidden'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be rescheduled.';
  end if;

  update public.surveillance_appointments
     set scheduled_at = p_scheduled_at,
         location = nullif(btrim(coalesce(p_location, '')), ''),
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
    raise exception 'Attendance status must be confirmed or did_not_attend.';
  end if;

  select * into v_appointment from public.surveillance_appointments sa where sa.id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Appointment not found.'; end if;
  if not public.can_manage_surveillance_business(v_appointment.business_id) then raise exception 'Forbidden'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can have attendance marked.';
  end if;

  update public.surveillance_appointments
     set status = p_status,
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
  select * into v_appointment from public.surveillance_appointments sa where sa.id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Appointment not found.'; end if;
  if not public.can_manage_surveillance_business(v_appointment.business_id) then raise exception 'Forbidden'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be completed.';
  end if;

  select * into v_actor from public.user_accounts ua where ua.id = auth.uid();

  update public.surveillance_appointments
     set status = 'completed',
         completed_at = now(),
         updated_by = auth.uid()
   where id = v_appointment.id
   returning * into v_appointment;

  insert into public.surveillance_outcomes_minimal (
    business_id,
    appointment_id,
    surveillance_worker_id,
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
    v_appointment.surveillance_worker_id,
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
  returning * into v_outcome;

  update public.surveillance_enrolments
     set next_due_at = p_next_due_at,
         next_appointment_at = null,
         updated_by = auth.uid()
   where id = v_appointment.enrolment_id;

  insert into public.surveillance_audit_events (
    business_id,
    actor_user_id,
    worker_user_id,
    surveillance_worker_id,
    appointment_id,
    enrolment_id,
    event_type,
    event_payload
  )
  values (
    v_appointment.business_id,
    auth.uid(),
    v_appointment.worker_user_id,
    v_appointment.surveillance_worker_id,
    v_appointment.id,
    v_appointment.enrolment_id,
    'appointment_completed',
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
  select * into v_appointment from public.surveillance_appointments sa where sa.id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Appointment not found.'; end if;
  if not public.can_manage_surveillance_business(v_appointment.business_id) then raise exception 'Forbidden'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed', 'rescheduled') then
    raise exception 'Only open appointments can be cancelled.';
  end if;

  update public.surveillance_appointments
     set status = 'cancelled',
         cancelled_reason = nullif(btrim(coalesce(p_reason, '')), ''),
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
  join public.surveillance_workers sw
    on sw.id = sa.surveillance_worker_id
  where sw.app_user_id = auth.uid()
    and sa.status in ('scheduled', 'confirmed', 'rescheduled')
    and public.is_business_module_enabled(sa.business_id, 'health_surveillance')
  order by sa.scheduled_at asc
  limit 1;
$function$;

revoke all on function public.get_my_next_surveillance_appointment() from public;
grant execute on function public.get_my_next_surveillance_appointment() to authenticated;

alter table public.surveillance_workers enable row level security;

drop policy if exists surveillance_workers_select_scoped on public.surveillance_workers;
create policy surveillance_workers_select_scoped
on public.surveillance_workers
for select
to authenticated
using (
  app_user_id = auth.uid()
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

drop policy if exists surveillance_enrolments_select_scoped on public.surveillance_enrolments;
create policy surveillance_enrolments_select_scoped
on public.surveillance_enrolments
for select
to authenticated
using (
  exists (
    select 1
    from public.surveillance_workers sw
    where sw.id = public.surveillance_enrolments.surveillance_worker_id
      and sw.app_user_id = auth.uid()
  )
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

drop policy if exists surveillance_appointments_select_scoped on public.surveillance_appointments;
create policy surveillance_appointments_select_scoped
on public.surveillance_appointments
for select
to authenticated
using (
  exists (
    select 1
    from public.surveillance_workers sw
    where sw.id = public.surveillance_appointments.surveillance_worker_id
      and sw.app_user_id = auth.uid()
  )
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

commit;
