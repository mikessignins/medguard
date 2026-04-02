begin;

create table if not exists public.modules (
  key text primary key,
  name text not null,
  category text not null,
  status text not null default 'active',
  is_billable boolean not null default false,
  billing_category text null,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_status_check check (status in ('active', 'deprecated', 'disabled'))
);

create table if not exists public.business_modules (
  business_id text not null references public.businesses(id) on delete cascade,
  module_key text not null references public.modules(key) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  enabled_at timestamptz not null default now(),
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, module_key)
);

create index if not exists business_modules_business_enabled_idx
  on public.business_modules (business_id, enabled);

create table if not exists public.module_form_versions (
  id bigserial primary key,
  module_key text not null references public.modules(key) on delete cascade,
  version integer not null,
  form_schema jsonb not null,
  workflow_schema jsonb not null default '{}'::jsonb,
  pdf_template_key text null,
  ios_min_version text null,
  web_min_version text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint module_form_versions_status_check check (status in ('draft', 'active', 'retired')),
  constraint module_form_versions_unique unique (module_key, version)
);

create index if not exists module_form_versions_module_status_idx
  on public.module_form_versions (module_key, status, version desc);

create table if not exists public.module_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete restrict,
  site_id text null references public.sites(id) on delete set null,
  worker_id uuid not null,
  module_key text not null references public.modules(key) on delete restrict,
  module_version integer not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  review_payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  exported_at timestamptz null,
  exported_by_name text null,
  phi_purged_at timestamptz null,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint module_submissions_module_version_fk
    foreign key (module_key, module_version)
    references public.module_form_versions(module_key, version)
    on delete restrict
);

create index if not exists module_submissions_business_module_idx
  on public.module_submissions (business_id, module_key, submitted_at desc);

create index if not exists module_submissions_worker_idx
  on public.module_submissions (worker_id, submitted_at desc);

create index if not exists module_submissions_review_queue_idx
  on public.module_submissions (business_id, site_id, status, submitted_at desc);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists modules_set_updated_at on public.modules;
create trigger modules_set_updated_at
before update on public.modules
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists business_modules_set_updated_at on public.business_modules;
create trigger business_modules_set_updated_at
before update on public.business_modules
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists module_form_versions_set_updated_at on public.module_form_versions;
create trigger module_form_versions_set_updated_at
before update on public.module_form_versions
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists module_submissions_set_updated_at on public.module_submissions;
create trigger module_submissions_set_updated_at
before update on public.module_submissions
for each row
execute function public.set_updated_at_timestamp();

create or replace function public.get_enabled_business_modules(p_business_id text)
returns table (
  module_key text,
  module_name text,
  category text,
  enabled boolean,
  config jsonb,
  current_version integer,
  is_billable boolean,
  billing_category text
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    m.key as module_key,
    m.name as module_name,
    m.category,
    bm.enabled,
    bm.config,
    m.current_version,
    m.is_billable,
    m.billing_category
  from public.business_modules bm
  join public.modules m
    on m.key = bm.module_key
  where bm.business_id = p_business_id
    and (
      p_business_id = public.get_my_business_id()
      or public.get_my_role() = 'superuser'
    )
    and bm.enabled = true
    and m.status = 'active'
  order by m.category, m.name;
$function$;

create or replace function public.is_business_module_enabled(p_business_id text, p_module_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.business_modules bm
    join public.modules m on m.key = bm.module_key
    where bm.business_id = p_business_id
      and (
        p_business_id = public.get_my_business_id()
        or public.get_my_role() = 'superuser'
      )
      and bm.module_key = p_module_key
      and bm.enabled = true
      and m.status = 'active'
  );
$function$;

alter table public.modules enable row level security;
alter table public.business_modules enable row level security;
alter table public.module_form_versions enable row level security;
alter table public.module_submissions enable row level security;

drop policy if exists modules_select_authenticated on public.modules;
create policy modules_select_authenticated
on public.modules
for select
to authenticated
using (status in ('active', 'deprecated'));

drop policy if exists business_modules_select_scoped on public.business_modules;
create policy business_modules_select_scoped
on public.business_modules
for select
to authenticated
using (
  business_id = public.get_my_business_id()
  or public.get_my_role() = 'superuser'
);

drop policy if exists business_modules_superuser_manage on public.business_modules;
create policy business_modules_superuser_manage
on public.business_modules
for all
to authenticated
using (public.get_my_role() = 'superuser')
with check (public.get_my_role() = 'superuser');

drop policy if exists module_form_versions_select_scoped on public.module_form_versions;
create policy module_form_versions_select_scoped
on public.module_form_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.business_modules bm
    where bm.business_id = public.get_my_business_id()
      and bm.module_key = module_form_versions.module_key
      and bm.enabled = true
  )
  or public.get_my_role() = 'superuser'
);

drop policy if exists module_form_versions_superuser_manage on public.module_form_versions;
create policy module_form_versions_superuser_manage
on public.module_form_versions
for all
to authenticated
using (public.get_my_role() = 'superuser')
with check (public.get_my_role() = 'superuser');

drop policy if exists module_submissions_worker_select on public.module_submissions;
create policy module_submissions_worker_select
on public.module_submissions
for select
to authenticated
using (worker_id = (select auth.uid()));

drop policy if exists module_submissions_worker_insert on public.module_submissions;
create policy module_submissions_worker_insert
on public.module_submissions
for insert
to authenticated
with check (
  worker_id = (select auth.uid())
  and business_id = public.get_my_business_id()
  and public.is_business_module_enabled(business_id, module_key)
);

drop policy if exists module_submissions_worker_update on public.module_submissions;
create policy module_submissions_worker_update
on public.module_submissions
for update
to authenticated
using (worker_id = (select auth.uid()))
with check (
  worker_id = (select auth.uid())
  and business_id = public.get_my_business_id()
);

drop policy if exists module_submissions_medic_select on public.module_submissions;
create policy module_submissions_medic_select
on public.module_submissions
for select
to authenticated
using (
  public.get_my_role() = 'medic'
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
);

drop policy if exists module_submissions_medic_update on public.module_submissions;
create policy module_submissions_medic_update
on public.module_submissions
for update
to authenticated
using (
  public.get_my_role() = 'medic'
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
)
with check (
  public.get_my_role() = 'medic'
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
);

insert into public.modules (key, name, category, status, is_billable, billing_category, current_version)
values
  ('emergency_declaration', 'Emergency Medical Declaration', 'core', 'active', true, 'emergency', 1),
  ('confidential_medication', 'Confidential Medication Declaration', 'optional', 'active', true, 'medication', 1)
on conflict (key) do update
set
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  is_billable = excluded.is_billable,
  billing_category = excluded.billing_category,
  current_version = excluded.current_version,
  updated_at = now();

insert into public.business_modules (business_id, module_key, enabled, config)
select
  b.id,
  'emergency_declaration',
  true,
  '{}'::jsonb
from public.businesses b
on conflict (business_id, module_key) do nothing;

insert into public.business_modules (business_id, module_key, enabled, config)
select
  b.id,
  'confidential_medication',
  coalesce(b.confidential_med_dec_enabled, false),
  '{}'::jsonb
from public.businesses b
on conflict (business_id, module_key) do update
set
  enabled = excluded.enabled,
  updated_at = now();

comment on table public.modules is
  'Stable registry of product modules. New optional form types should be added here instead of as new columns on businesses.';

comment on table public.business_modules is
  'Per-business module enablement and module-specific configuration. Keep business entitlements here rather than on public.businesses.';

comment on table public.module_form_versions is
  'Versioned schemas and workflow definitions for generic module-driven forms.';

comment on table public.module_submissions is
  'Generic submission engine for future optional modules. Existing core tables can continue to run in parallel during migration.';

revoke all on function public.get_enabled_business_modules(text) from public;
revoke all on function public.is_business_module_enabled(text, text) from public;

grant execute on function public.get_enabled_business_modules(text) to authenticated;
grant execute on function public.is_business_module_enabled(text, text) to authenticated;

commit;
