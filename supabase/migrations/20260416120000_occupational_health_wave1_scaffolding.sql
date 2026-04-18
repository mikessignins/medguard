begin;

create table if not exists public.surveillance_types (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text null,
  default_interval_days integer not null default 365 check (default_interval_days > 0 and default_interval_days <= 3650),
  baseline_interval_days integer null check (
    baseline_interval_days is null or (baseline_interval_days > 0 and baseline_interval_days <= 3650)
  ),
  legacy_program_code public.surveillance_program_code null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table if not exists public.surveillance_type_frequency_rules (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  surveillance_type_id uuid not null references public.surveillance_types(id) on delete cascade,
  site_id text null references public.sites(id) on delete cascade,
  worker_role_id uuid null references public.business_worker_roles(id) on delete set null,
  seg_code text null check (seg_code is null or btrim(seg_code) <> ''),
  hazard_code text null check (hazard_code is null or btrim(hazard_code) <> ''),
  baseline_interval_days integer null check (
    baseline_interval_days is null or (baseline_interval_days > 0 and baseline_interval_days <= 3650)
  ),
  recurring_interval_days integer not null check (recurring_interval_days > 0 and recurring_interval_days <= 3650),
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.surveillance_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  surveillance_type_id uuid not null references public.surveillance_types(id) on delete cascade,
  site_id text null references public.sites(id) on delete cascade,
  worker_role_id uuid null references public.business_worker_roles(id) on delete set null,
  seg_code text null check (seg_code is null or btrim(seg_code) <> ''),
  hazard_code text null check (hazard_code is null or btrim(hazard_code) <> ''),
  exposure_level_category text null check (
    exposure_level_category is null or char_length(exposure_level_category) <= 64
  ),
  baseline_required boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.surveillance_reason_codes (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  category text not null check (category in ('cancelled', 'rescheduled', 'did_not_attend', 'review_required', 'deactivated')),
  code text not null check (btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, category, code)
);

create table if not exists public.surveillance_providers (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  provider_type text null check (provider_type is null or char_length(provider_type) <= 64),
  contact_email text null check (contact_email is null or char_length(contact_email) <= 320),
  contact_phone text null check (contact_phone is null or char_length(contact_phone) <= 64),
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.surveillance_provider_locations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.surveillance_providers(id) on delete cascade,
  business_id text not null references public.businesses(id) on delete cascade,
  site_id text null references public.sites(id) on delete set null,
  location_name text not null check (btrim(location_name) <> ''),
  address_text text null check (address_text is null or char_length(address_text) <= 500),
  supports_remote boolean not null default false,
  capacity_notes text null check (capacity_notes is null or char_length(capacity_notes) <= 500),
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surveillance_types_business_active_idx
  on public.surveillance_types (business_id, is_active, name);

create index if not exists surveillance_type_frequency_rules_scope_idx
  on public.surveillance_type_frequency_rules (
    business_id,
    surveillance_type_id,
    site_id,
    worker_role_id,
    seg_code,
    hazard_code,
    priority
  );

create index if not exists surveillance_assignment_rules_scope_idx
  on public.surveillance_assignment_rules (
    business_id,
    surveillance_type_id,
    site_id,
    worker_role_id,
    seg_code,
    hazard_code
  );

create index if not exists surveillance_reason_codes_business_category_idx
  on public.surveillance_reason_codes (business_id, category, is_active);

create index if not exists surveillance_providers_business_active_idx
  on public.surveillance_providers (business_id, is_active, name);

create index if not exists surveillance_provider_locations_business_site_idx
  on public.surveillance_provider_locations (business_id, site_id, is_active);

drop trigger if exists surveillance_types_set_updated_at on public.surveillance_types;
create trigger surveillance_types_set_updated_at
before update on public.surveillance_types
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_type_frequency_rules_set_updated_at on public.surveillance_type_frequency_rules;
create trigger surveillance_type_frequency_rules_set_updated_at
before update on public.surveillance_type_frequency_rules
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_assignment_rules_set_updated_at on public.surveillance_assignment_rules;
create trigger surveillance_assignment_rules_set_updated_at
before update on public.surveillance_assignment_rules
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_reason_codes_set_updated_at on public.surveillance_reason_codes;
create trigger surveillance_reason_codes_set_updated_at
before update on public.surveillance_reason_codes
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_providers_set_updated_at on public.surveillance_providers;
create trigger surveillance_providers_set_updated_at
before update on public.surveillance_providers
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists surveillance_provider_locations_set_updated_at on public.surveillance_provider_locations;
create trigger surveillance_provider_locations_set_updated_at
before update on public.surveillance_provider_locations
for each row
execute function public.set_updated_at_timestamp();

insert into public.surveillance_types (
  business_id,
  code,
  name,
  description,
  default_interval_days,
  baseline_interval_days,
  legacy_program_code,
  created_by,
  updated_by
)
select
  b.id,
  seed.code,
  seed.name,
  seed.description,
  seed.default_interval_days,
  seed.baseline_interval_days,
  seed.legacy_program_code,
  null,
  null
from public.businesses b
cross join (
  values
    ('general_surveillance_review', 'General Surveillance Review', 'Administrative tracking for general surveillance reviews.', 365, 365, 'general'::public.surveillance_program_code),
    ('spirometry', 'Spirometry', 'Respiratory function surveillance scheduling only.', 365, 365, 'respiratory'::public.surveillance_program_code),
    ('audiometry', 'Audiometry', 'Noise exposure surveillance scheduling only.', 730, 730, 'hearing'::public.surveillance_program_code),
    ('biological_monitoring', 'Biological Monitoring', 'Agent-specific biological monitoring scheduling only.', 180, 180, 'chemical'::public.surveillance_program_code),
    ('musculoskeletal_screening', 'Musculoskeletal Screening', 'Manual handling and vibration related screening schedule.', 365, 365, null::public.surveillance_program_code),
    ('skin_surveillance', 'Skin Surveillance', 'Administrative tracking for chemical and UV skin surveillance.', 365, 365, null::public.surveillance_program_code),
    ('vision_screening', 'Vision Screening', 'Administrative tracking for periodic vision screening.', 730, 730, null::public.surveillance_program_code),
    ('radiation_health_monitoring', 'Radiation Health Monitoring', 'Administrative tracking for radiation monitoring obligations.', 365, 365, null::public.surveillance_program_code),
    ('other_surveillance', 'Other Surveillance', 'Catch-all surveillance scheduling category pending more precise rule mapping.', 365, 365, 'other'::public.surveillance_program_code)
) as seed(code, name, description, default_interval_days, baseline_interval_days, legacy_program_code)
where not exists (
  select 1
  from public.surveillance_types st
  where st.business_id = b.id
    and st.code = seed.code
);

insert into public.surveillance_reason_codes (
  business_id,
  category,
  code,
  label,
  created_by,
  updated_by
)
select
  b.id,
  seed.category,
  seed.code,
  seed.label,
  null,
  null
from public.businesses b
cross join (
  values
    ('cancelled', 'worker_unavailable', 'Worker unavailable'),
    ('cancelled', 'provider_cancelled', 'Provider cancelled'),
    ('cancelled', 'operational_requirement', 'Operational requirement'),
    ('rescheduled', 'roster_conflict', 'Roster conflict'),
    ('rescheduled', 'worker_requested', 'Worker requested'),
    ('rescheduled', 'provider_rescheduled', 'Provider rescheduled'),
    ('did_not_attend', 'worker_absent', 'Worker absent'),
    ('did_not_attend', 'transport_issue', 'Transport issue'),
    ('did_not_attend', 'other', 'Other'),
    ('review_required', 'role_change', 'Role change review'),
    ('review_required', 'site_transfer', 'Site transfer review'),
    ('review_required', 'self_declared', 'Worker self-declared review'),
    ('deactivated', 'no_longer_exposed', 'No longer exposed'),
    ('deactivated', 'worker_separated', 'Worker separated')
) as seed(category, code, label)
where not exists (
  select 1
  from public.surveillance_reason_codes src
  where src.business_id = b.id
    and src.category = seed.category
    and src.code = seed.code
);

alter table public.surveillance_workers
  add column if not exists employee_number text null check (
    employee_number is null or char_length(employee_number) <= 64
  ),
  add column if not exists employment_type text null check (
    employment_type is null or char_length(employment_type) <= 64
  ),
  add column if not exists employing_entity text null check (
    employing_entity is null or char_length(employing_entity) <= 160
  ),
  add column if not exists contractor_company_name text null check (
    contractor_company_name is null or char_length(contractor_company_name) <= 160
  ),
  add column if not exists engagement_status text null check (
    engagement_status is null or char_length(engagement_status) <= 64
  ),
  add column if not exists mobilisation_date date null,
  add column if not exists demobilisation_date date null,
  add column if not exists department text null check (
    department is null or char_length(department) <= 160
  ),
  add column if not exists business_unit text null check (
    business_unit is null or char_length(business_unit) <= 160
  ),
  add column if not exists workgroup_name text null check (
    workgroup_name is null or char_length(workgroup_name) <= 160
  ),
  add column if not exists operational_area text null check (
    operational_area is null or char_length(operational_area) <= 160
  ),
  add column if not exists jurisdiction_code text null check (
    jurisdiction_code is null or char_length(jurisdiction_code) <= 32
  );

alter table public.surveillance_enrolments
  add column if not exists surveillance_type_id uuid null references public.surveillance_types(id) on delete restrict,
  add column if not exists assignment_source text null check (
    assignment_source is null or char_length(assignment_source) <= 64
  ),
  add column if not exists baseline_required boolean not null default false,
  add column if not exists baseline_completed_at timestamptz null,
  add column if not exists frequency_override_days integer null check (
    frequency_override_days is null or (frequency_override_days > 0 and frequency_override_days <= 3650)
  ),
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason_code_id uuid null references public.surveillance_reason_codes(id) on delete set null,
  add column if not exists deactivated_at timestamptz null,
  add column if not exists deactivated_reason_code_id uuid null references public.surveillance_reason_codes(id) on delete set null;

update public.surveillance_enrolments
   set assignment_source = 'legacy_manual'
 where assignment_source is null;

update public.surveillance_enrolments se
   set surveillance_type_id = st.id
  from public.surveillance_programs sp
  join public.surveillance_types st
    on st.business_id = sp.business_id
   and (
     (sp.code = 'respiratory' and st.code = 'spirometry')
     or (sp.code = 'hearing' and st.code = 'audiometry')
     or (sp.code = 'chemical' and st.code = 'biological_monitoring')
     or (sp.code = 'dust' and st.code = 'spirometry')
     or (sp.code = 'general' and st.code = 'general_surveillance_review')
     or (sp.code = 'other' and st.code = 'other_surveillance')
   )
 where se.program_id = sp.id
   and se.business_id = sp.business_id
   and se.surveillance_type_id is null;

create index if not exists surveillance_enrolments_business_type_due_idx
  on public.surveillance_enrolments (business_id, surveillance_type_id, next_due_at);

create index if not exists surveillance_enrolments_baseline_idx
  on public.surveillance_enrolments (business_id, baseline_required, baseline_completed_at);

alter table public.surveillance_appointments
  add column if not exists provider_id uuid null references public.surveillance_providers(id) on delete set null,
  add column if not exists provider_location_id uuid null references public.surveillance_provider_locations(id) on delete set null,
  add column if not exists status_reason_code_id uuid null references public.surveillance_reason_codes(id) on delete set null,
  add column if not exists confirmed_by_worker_at timestamptz null,
  add column if not exists provider_acknowledged_at timestamptz null,
  add column if not exists appointment_window_start timestamptz null,
  add column if not exists appointment_window_end timestamptz null,
  add column if not exists rescheduled_from_appointment_id uuid null references public.surveillance_appointments(id) on delete set null;

create index if not exists surveillance_appointments_business_provider_schedule_idx
  on public.surveillance_appointments (business_id, provider_id, scheduled_at);

alter table public.surveillance_outcomes_minimal
  add column if not exists outcome_received_at timestamptz null,
  add column if not exists outcome_communicated_at timestamptz null,
  add column if not exists corrective_action_required boolean not null default false,
  add column if not exists corrective_action_ref text null check (
    corrective_action_ref is null or char_length(corrective_action_ref) <= 120
  );

alter table public.surveillance_audit_events
  add column if not exists entity_type text null check (
    entity_type is null or char_length(entity_type) <= 64
  ),
  add column if not exists entity_id uuid null,
  add column if not exists previous_value jsonb null,
  add column if not exists new_value jsonb null,
  add column if not exists reason_code text null check (
    reason_code is null or char_length(reason_code) <= 64
  ),
  add column if not exists comment_text text null check (
    comment_text is null or char_length(comment_text) <= 1000
  );

alter table public.surveillance_audit_events
  drop constraint if exists surveillance_audit_events_previous_value_object,
  add constraint surveillance_audit_events_previous_value_object
    check (previous_value is null or jsonb_typeof(previous_value) = 'object');

alter table public.surveillance_audit_events
  drop constraint if exists surveillance_audit_events_new_value_object,
  add constraint surveillance_audit_events_new_value_object
    check (new_value is null or jsonb_typeof(new_value) = 'object');

alter table public.surveillance_types enable row level security;
alter table public.surveillance_type_frequency_rules enable row level security;
alter table public.surveillance_assignment_rules enable row level security;
alter table public.surveillance_reason_codes enable row level security;
alter table public.surveillance_providers enable row level security;
alter table public.surveillance_provider_locations enable row level security;

drop policy if exists surveillance_types_select_scoped on public.surveillance_types;
create policy surveillance_types_select_scoped
on public.surveillance_types
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

drop policy if exists surveillance_type_frequency_rules_select_scoped on public.surveillance_type_frequency_rules;
create policy surveillance_type_frequency_rules_select_scoped
on public.surveillance_type_frequency_rules
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

drop policy if exists surveillance_assignment_rules_select_scoped on public.surveillance_assignment_rules;
create policy surveillance_assignment_rules_select_scoped
on public.surveillance_assignment_rules
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

drop policy if exists surveillance_reason_codes_select_scoped on public.surveillance_reason_codes;
create policy surveillance_reason_codes_select_scoped
on public.surveillance_reason_codes
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

drop policy if exists surveillance_providers_select_scoped on public.surveillance_providers;
create policy surveillance_providers_select_scoped
on public.surveillance_providers
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

drop policy if exists surveillance_provider_locations_select_scoped on public.surveillance_provider_locations;
create policy surveillance_provider_locations_select_scoped
on public.surveillance_provider_locations
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

commit;
