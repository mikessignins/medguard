begin;

create table if not exists public.surveillance_worker_rosters (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  surveillance_worker_id uuid not null references public.surveillance_workers(id) on delete cascade,
  roster_pattern text not null check (btrim(roster_pattern) <> ''),
  shift_type text null check (shift_type is null or char_length(shift_type) <= 64),
  current_swing_start date null,
  current_swing_end date null,
  source_system text null check (source_system is null or char_length(source_system) <= 64),
  source_ref text null check (source_ref is null or char_length(source_ref) <= 120),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.surveillance_worker_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  surveillance_worker_id uuid not null references public.surveillance_workers(id) on delete cascade,
  exception_type text not null check (exception_type in ('leave', 'training', 'restricted_duties', 'off_site', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes_operational text null check (notes_operational is null or char_length(notes_operational) <= 500),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint surveillance_worker_availability_exception_window
    check (ends_at > starts_at)
);

create table if not exists public.surveillance_review_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  surveillance_worker_id uuid not null references public.surveillance_workers(id) on delete cascade,
  enrolment_id uuid null references public.surveillance_enrolments(id) on delete set null,
  task_type text not null check (task_type in ('new_starter_baseline', 'role_change_review', 'site_transfer_review', 'self_declared_review', 'bulk_enrolment_review')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid null references auth.users(id) on delete set null,
  due_at timestamptz null,
  notes_operational text null check (notes_operational is null or char_length(notes_operational) <= 500),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surveillance_worker_rosters_worker_idx
  on public.surveillance_worker_rosters (surveillance_worker_id, current_swing_start, current_swing_end);

create index if not exists surveillance_worker_availability_exceptions_worker_idx
  on public.surveillance_worker_availability_exceptions (surveillance_worker_id, starts_at, ends_at);

create index if not exists surveillance_review_tasks_business_status_idx
  on public.surveillance_review_tasks (business_id, status, due_at);

create index if not exists surveillance_review_tasks_worker_idx
  on public.surveillance_review_tasks (surveillance_worker_id, status, created_at desc);

drop trigger if exists surveillance_worker_rosters_set_updated_at on public.surveillance_worker_rosters;
create trigger surveillance_worker_rosters_set_updated_at
before update on public.surveillance_worker_rosters
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_review_tasks_set_updated_at on public.surveillance_review_tasks;
create trigger surveillance_review_tasks_set_updated_at
before update on public.surveillance_review_tasks
for each row
execute function public.set_updated_at_timestamp();

alter table public.surveillance_worker_rosters enable row level security;
alter table public.surveillance_worker_availability_exceptions enable row level security;
alter table public.surveillance_review_tasks enable row level security;

drop policy if exists surveillance_worker_rosters_select_scoped on public.surveillance_worker_rosters;
create policy surveillance_worker_rosters_select_scoped
on public.surveillance_worker_rosters
for select
to authenticated
using (
  exists (
    select 1
    from public.surveillance_workers sw
    where sw.id = public.surveillance_worker_rosters.surveillance_worker_id
      and sw.app_user_id = auth.uid()
  )
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

drop policy if exists surveillance_worker_availability_exceptions_select_scoped on public.surveillance_worker_availability_exceptions;
create policy surveillance_worker_availability_exceptions_select_scoped
on public.surveillance_worker_availability_exceptions
for select
to authenticated
using (
  exists (
    select 1
    from public.surveillance_workers sw
    where sw.id = public.surveillance_worker_availability_exceptions.surveillance_worker_id
      and sw.app_user_id = auth.uid()
  )
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

drop policy if exists surveillance_review_tasks_select_scoped on public.surveillance_review_tasks;
create policy surveillance_review_tasks_select_scoped
on public.surveillance_review_tasks
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

commit;
