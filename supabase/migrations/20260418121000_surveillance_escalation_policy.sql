begin;

create table if not exists public.surveillance_escalation_policies (
  business_id text primary key references public.businesses(id) on delete cascade,
  due_soon_days integer not null default 30 check (due_soon_days between 1 and 180),
  occ_health_overdue_days integer not null default 0 check (occ_health_overdue_days between 0 and 365),
  supervisor_overdue_days integer not null default 7 check (supervisor_overdue_days between 0 and 365),
  manager_overdue_days integer not null default 14 check (manager_overdue_days between 0 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.surveillance_escalation_policies enable row level security;

drop policy if exists surveillance_escalation_policies_select_scoped on public.surveillance_escalation_policies;
create policy surveillance_escalation_policies_select_scoped
on public.surveillance_escalation_policies
for select
to authenticated
using (
  public.can_read_surveillance_business(business_id)
  and public.is_business_module_enabled(business_id, 'health_surveillance')
);

create or replace function public.upsert_surveillance_escalation_policy(
  p_business_id text,
  p_due_soon_days integer,
  p_occ_health_overdue_days integer,
  p_supervisor_overdue_days integer,
  p_manager_overdue_days integer,
  p_is_active boolean default true
)
returns public.surveillance_escalation_policies
language plpgsql
security definer
set search_path = ''
as $surv_escalation_policy$
declare
  v_policy public.surveillance_escalation_policies%rowtype;
begin
  if not public.can_manage_surveillance_business(p_business_id) then
    raise exception 'Forbidden';
  end if;

  insert into public.surveillance_escalation_policies (
    business_id,
    due_soon_days,
    occ_health_overdue_days,
    supervisor_overdue_days,
    manager_overdue_days,
    is_active,
    updated_by,
    updated_at
  ) values (
    p_business_id,
    p_due_soon_days,
    p_occ_health_overdue_days,
    p_supervisor_overdue_days,
    p_manager_overdue_days,
    coalesce(p_is_active, true),
    auth.uid(),
    now()
  )
  on conflict (business_id) do update
    set due_soon_days = excluded.due_soon_days,
        occ_health_overdue_days = excluded.occ_health_overdue_days,
        supervisor_overdue_days = excluded.supervisor_overdue_days,
        manager_overdue_days = excluded.manager_overdue_days,
        is_active = excluded.is_active,
        updated_by = auth.uid(),
        updated_at = now()
  returning * into v_policy;

  return v_policy;
end;
$surv_escalation_policy$;

revoke all on function public.upsert_surveillance_escalation_policy(text, integer, integer, integer, integer, boolean) from public;
grant execute on function public.upsert_surveillance_escalation_policy(text, integer, integer, integer, integer, boolean) to authenticated;

create or replace function public.generate_surveillance_notifications(
  p_business_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $surv_generate_notifications$
declare
  v_enrolment record;
  v_appointment record;
  v_count integer := 0;
  v_notification_id uuid;
  v_days_overdue integer;
  v_due_soon_days integer := 30;
  v_occ_health_overdue_days integer := 0;
  v_supervisor_overdue_days integer := 7;
  v_manager_overdue_days integer := 14;
  v_policy_active boolean := true;
begin
  if not public.can_manage_surveillance_business(p_business_id) then
    raise exception 'Forbidden';
  end if;

  select
    coalesce(sep.due_soon_days, 30),
    coalesce(sep.occ_health_overdue_days, 0),
    coalesce(sep.supervisor_overdue_days, 7),
    coalesce(sep.manager_overdue_days, 14),
    coalesce(sep.is_active, true)
  into
    v_due_soon_days,
    v_occ_health_overdue_days,
    v_supervisor_overdue_days,
    v_manager_overdue_days,
    v_policy_active
  from public.surveillance_escalation_policies sep
  where sep.business_id = p_business_id;

  for v_enrolment in
    select se.id, se.business_id, se.surveillance_worker_id, se.worker_user_id, se.next_due_at
      from public.surveillance_enrolments se
     where se.business_id = p_business_id
       and se.status = 'active'
       and se.next_due_at is not null
  loop
    if v_enrolment.next_due_at <= now() then
      v_days_overdue := greatest(0, floor(extract(epoch from (now() - v_enrolment.next_due_at)) / 86400)::integer);

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

      if v_policy_active and v_days_overdue >= v_occ_health_overdue_days and not exists (
        select 1 from public.surveillance_notifications sn
         where sn.business_id = p_business_id
           and sn.enrolment_id = v_enrolment.id
           and sn.notification_type = 'escalation_occ_health'
           and sn.delivery_status in ('pending', 'sent', 'acknowledged')
      ) then
        insert into public.surveillance_notifications (
          business_id, surveillance_worker_id, enrolment_id, notification_type, delivery_channel, scheduled_for, sent_at, delivery_status, template_version, created_by
        ) values (
          p_business_id, v_enrolment.surveillance_worker_id, v_enrolment.id, 'escalation_occ_health', 'in_app', now(), now(), 'sent', 'escalation-v1', auth.uid()
        ) returning id into v_notification_id;

        insert into public.surveillance_notification_recipients (
          notification_id, business_id, target_user_id, target_role, delivery_address
        ) values (
          v_notification_id, p_business_id, null, 'occ_health', null
        );
        v_count := v_count + 1;
      end if;

      if v_policy_active and v_days_overdue >= v_supervisor_overdue_days and not exists (
        select 1 from public.surveillance_notifications sn
         where sn.business_id = p_business_id
           and sn.enrolment_id = v_enrolment.id
           and sn.notification_type = 'escalation_supervisor'
           and sn.delivery_status in ('pending', 'sent', 'acknowledged')
      ) then
        insert into public.surveillance_notifications (
          business_id, surveillance_worker_id, enrolment_id, notification_type, delivery_channel, scheduled_for, sent_at, delivery_status, template_version, created_by
        ) values (
          p_business_id, v_enrolment.surveillance_worker_id, v_enrolment.id, 'escalation_supervisor', 'in_app', now(), now(), 'sent', 'escalation-v1', auth.uid()
        ) returning id into v_notification_id;

        insert into public.surveillance_notification_recipients (
          notification_id, business_id, target_user_id, target_role, delivery_address
        ) values (
          v_notification_id, p_business_id, null, 'supervisor', null
        );
        v_count := v_count + 1;
      end if;

      if v_policy_active and v_days_overdue >= v_manager_overdue_days and not exists (
        select 1 from public.surveillance_notifications sn
         where sn.business_id = p_business_id
           and sn.enrolment_id = v_enrolment.id
           and sn.notification_type = 'escalation_manager'
           and sn.delivery_status in ('pending', 'sent', 'acknowledged')
      ) then
        insert into public.surveillance_notifications (
          business_id, surveillance_worker_id, enrolment_id, notification_type, delivery_channel, scheduled_for, sent_at, delivery_status, template_version, created_by
        ) values (
          p_business_id, v_enrolment.surveillance_worker_id, v_enrolment.id, 'escalation_manager', 'in_app', now(), now(), 'sent', 'escalation-v1', auth.uid()
        ) returning id into v_notification_id;

        insert into public.surveillance_notification_recipients (
          notification_id, business_id, target_user_id, target_role, delivery_address
        ) values (
          v_notification_id, p_business_id, null, 'site_project_manager', null
        );
        v_count := v_count + 1;
      end if;
    elsif v_enrolment.next_due_at <= now() + make_interval(days => v_due_soon_days) then
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
$surv_generate_notifications$;

revoke all on function public.generate_surveillance_notifications(text) from public;
grant execute on function public.generate_surveillance_notifications(text) to authenticated;

commit;
