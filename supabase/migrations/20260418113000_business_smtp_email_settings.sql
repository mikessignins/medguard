begin;

create table if not exists public.business_email_settings (
  business_id text primary key references public.businesses(id) on delete cascade,
  delivery_mode text not null default 'in_app' check (delivery_mode in ('in_app', 'smtp')),
  from_name text null check (from_name is null or char_length(from_name) <= 160),
  from_email text null check (from_email is null or char_length(from_email) <= 320),
  reply_to_email text null check (reply_to_email is null or char_length(reply_to_email) <= 320),
  smtp_host text null check (smtp_host is null or char_length(smtp_host) <= 255),
  smtp_port integer null check (smtp_port is null or (smtp_port > 0 and smtp_port <= 65535)),
  smtp_security text not null default 'starttls' check (smtp_security in ('tls', 'starttls', 'none')),
  smtp_username text null check (smtp_username is null or char_length(smtp_username) <= 320),
  smtp_password_encrypted text null,
  is_enabled boolean not null default false,
  last_tested_at timestamptz null,
  last_test_status text null check (last_test_status is null or last_test_status in ('success', 'failed')),
  last_test_error text null check (last_test_error is null or char_length(last_test_error) <= 1000),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_email_settings_enabled_idx
  on public.business_email_settings (is_enabled, delivery_mode);

drop trigger if exists business_email_settings_set_updated_at on public.business_email_settings;
create trigger business_email_settings_set_updated_at
before update on public.business_email_settings
for each row
execute function public.set_updated_at_timestamp();

alter table public.business_email_settings enable row level security;

drop policy if exists business_email_settings_admin_select on public.business_email_settings;
create policy business_email_settings_admin_select
on public.business_email_settings
for select
to authenticated
using (
  public.is_admin_for_business(business_id)
  or public.is_platform_superuser()
);

drop policy if exists business_email_settings_admin_insert on public.business_email_settings;
create policy business_email_settings_admin_insert
on public.business_email_settings
for insert
to authenticated
with check (
  public.is_admin_for_business(business_id)
  or public.is_platform_superuser()
);

drop policy if exists business_email_settings_admin_update on public.business_email_settings;
create policy business_email_settings_admin_update
on public.business_email_settings
for update
to authenticated
using (
  public.is_admin_for_business(business_id)
  or public.is_platform_superuser()
)
with check (
  public.is_admin_for_business(business_id)
  or public.is_platform_superuser()
);

alter table public.surveillance_notifications
  add column if not exists provider_message_id text null check (
    provider_message_id is null or char_length(provider_message_id) <= 240
  ),
  add column if not exists delivery_error text null check (
    delivery_error is null or char_length(delivery_error) <= 1000
  ),
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_attempted_at timestamptz null;

create index if not exists surveillance_notifications_email_pending_idx
  on public.surveillance_notifications (business_id, scheduled_for)
  where delivery_channel = 'email' and delivery_status = 'pending';

commit;
