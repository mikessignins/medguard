begin;

create table if not exists public.surveillance_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  surveillance_worker_id uuid not null references public.surveillance_workers(id) on delete cascade,
  appointment_id uuid null references public.surveillance_appointments(id) on delete cascade,
  enrolment_id uuid null references public.surveillance_enrolments(id) on delete cascade,
  notification_type text not null check (char_length(notification_type) <= 64),
  delivery_channel text not null check (char_length(delivery_channel) <= 32),
  scheduled_for timestamptz not null,
  sent_at timestamptz null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed', 'acknowledged', 'cancelled')),
  template_version text null check (template_version is null or char_length(template_version) <= 64),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.surveillance_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.surveillance_notifications(id) on delete cascade,
  business_id text not null references public.businesses(id) on delete cascade,
  target_user_id uuid null references auth.users(id) on delete set null,
  target_role text null check (target_role is null or char_length(target_role) <= 64),
  delivery_address text null check (delivery_address is null or char_length(delivery_address) <= 320),
  acknowledged_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists surveillance_notifications_business_schedule_idx
  on public.surveillance_notifications (business_id, delivery_status, scheduled_for desc);

create index if not exists surveillance_notifications_worker_idx
  on public.surveillance_notifications (surveillance_worker_id, created_at desc);

create index if not exists surveillance_notification_recipients_notification_idx
  on public.surveillance_notification_recipients (notification_id, target_user_id, target_role);

alter table public.surveillance_notifications enable row level security;
alter table public.surveillance_notification_recipients enable row level security;

drop policy if exists surveillance_notifications_select_scoped on public.surveillance_notifications;
create policy surveillance_notifications_select_scoped
on public.surveillance_notifications
for select
to authenticated
using (
  exists (
    select 1
    from public.surveillance_workers sw
    where sw.id = public.surveillance_notifications.surveillance_worker_id
      and sw.app_user_id = auth.uid()
  )
  or (
    public.can_read_surveillance_business(business_id)
    and public.is_business_module_enabled(business_id, 'health_surveillance')
  )
);

drop policy if exists surveillance_notification_recipients_select_scoped on public.surveillance_notification_recipients;
create policy surveillance_notification_recipients_select_scoped
on public.surveillance_notification_recipients
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

commit;
