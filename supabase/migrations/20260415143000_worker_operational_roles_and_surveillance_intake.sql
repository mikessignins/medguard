create table if not exists public.business_worker_roles (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  normalized_name text not null check (btrim(normalized_name) <> ''),
  is_active boolean not null default true,
  sort_order integer,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_worker_roles_business_normalized_name_key
    unique (business_id, normalized_name)
);

create index if not exists business_worker_roles_business_active_name_idx
  on public.business_worker_roles (business_id, is_active, name);

create table if not exists public.worker_operational_profiles (
  id uuid primary key default gen_random_uuid(),
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null references public.businesses(id) on delete cascade,
  worker_display_name text not null check (btrim(worker_display_name) <> ''),
  selected_worker_role_id uuid null references public.business_worker_roles(id) on delete set null,
  job_role_name text not null check (btrim(job_role_name) <> ''),
  job_role_source text not null check (job_role_source in ('catalogue', 'other')),
  other_role_text text null,
  requires_health_surveillance boolean not null default false,
  surveillance_declared_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_operational_profiles_worker_business_key
    unique (worker_user_id, business_id),
  constraint worker_operational_profiles_other_role_required
    check (
      (job_role_source = 'other' and other_role_text is not null and btrim(other_role_text) <> '')
      or (job_role_source = 'catalogue' and other_role_text is null)
    )
);

create index if not exists worker_operational_profiles_business_surveillance_idx
  on public.worker_operational_profiles (business_id, requires_health_surveillance, worker_display_name);

create index if not exists worker_operational_profiles_business_role_idx
  on public.worker_operational_profiles (business_id, selected_worker_role_id);

create table if not exists public.business_worker_role_suggestions (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  submitted_text text not null check (btrim(submitted_text) <> ''),
  normalized_text text not null check (btrim(normalized_text) <> ''),
  status text not null default 'pending' check (status in ('pending', 'approved', 'merged', 'rejected')),
  approved_role_id uuid null references public.business_worker_roles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_worker_role_suggestions_business_normalized_worker_key
    unique (business_id, worker_user_id, normalized_text)
);

create index if not exists business_worker_role_suggestions_business_status_idx
  on public.business_worker_role_suggestions (business_id, status, created_at desc);

drop trigger if exists business_worker_roles_set_updated_at on public.business_worker_roles;
create trigger business_worker_roles_set_updated_at
before update on public.business_worker_roles
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists worker_operational_profiles_set_updated_at on public.worker_operational_profiles;
create trigger worker_operational_profiles_set_updated_at
before update on public.worker_operational_profiles
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists business_worker_role_suggestions_set_updated_at on public.business_worker_role_suggestions;
create trigger business_worker_role_suggestions_set_updated_at
before update on public.business_worker_role_suggestions
for each row
execute function public.set_updated_at_timestamp();

create or replace function public.normalize_business_worker_role_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select lower(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g'));
$function$;

revoke all on function public.normalize_business_worker_role_name(text) from public;
grant execute on function public.normalize_business_worker_role_name(text) to authenticated;

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

  perform public.log_surveillance_audit_event(
    v_actor.business_id,
    'worker_operational_profile_saved',
    v_actor.id,
    null,
    null,
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

create or replace function public.get_my_worker_operational_profile()
returns public.worker_operational_profiles
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor public.user_accounts%rowtype;
  v_profile public.worker_operational_profiles%rowtype;
begin
  select *
    into v_actor
    from public.user_accounts ua
   where ua.id = auth.uid()
   limit 1;

  if not found then
    raise exception 'Unable to load account context';
  end if;

  select *
    into v_profile
    from public.worker_operational_profiles wop
   where wop.worker_user_id = v_actor.id
     and wop.business_id = v_actor.business_id
   limit 1;

  return v_profile;
end;
$function$;

revoke all on function public.get_my_worker_operational_profile() from public;
grant execute on function public.get_my_worker_operational_profile() to authenticated;

alter table public.business_worker_roles enable row level security;
alter table public.worker_operational_profiles enable row level security;
alter table public.business_worker_role_suggestions enable row level security;

drop policy if exists business_worker_roles_select on public.business_worker_roles;
create policy business_worker_roles_select
on public.business_worker_roles
for select
to authenticated
using (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and (
        ua.role = 'superuser'
        or ua.business_id = public.business_worker_roles.business_id
      )
  )
);

drop policy if exists business_worker_roles_admin_manage on public.business_worker_roles;
create policy business_worker_roles_admin_manage
on public.business_worker_roles
for all
to authenticated
using (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and (
        ua.role = 'superuser'
        or (ua.role = 'admin' and ua.business_id = public.business_worker_roles.business_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and (
        ua.role = 'superuser'
        or (ua.role = 'admin' and ua.business_id = public.business_worker_roles.business_id)
      )
  )
);

drop policy if exists worker_operational_profiles_select on public.worker_operational_profiles;
create policy worker_operational_profiles_select
on public.worker_operational_profiles
for select
to authenticated
using (
  public.worker_operational_profiles.worker_user_id = auth.uid()
  or public.can_manage_surveillance_business(public.worker_operational_profiles.business_id)
);

drop policy if exists business_worker_role_suggestions_select on public.business_worker_role_suggestions;
create policy business_worker_role_suggestions_select
on public.business_worker_role_suggestions
for select
to authenticated
using (
  public.business_worker_role_suggestions.worker_user_id = auth.uid()
  or public.can_manage_surveillance_business(public.business_worker_role_suggestions.business_id)
);

drop policy if exists business_worker_role_suggestions_manage on public.business_worker_role_suggestions;
create policy business_worker_role_suggestions_manage
on public.business_worker_role_suggestions
for all
to authenticated
using (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and (
        ua.role = 'superuser'
        or (ua.role = 'admin' and ua.business_id = public.business_worker_role_suggestions.business_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and (
        ua.role = 'superuser'
        or (ua.role = 'admin' and ua.business_id = public.business_worker_role_suggestions.business_id)
      )
  )
);
