begin;

create or replace function public.acknowledge_surveillance_notification(
  p_notification_id uuid
)
returns public.surveillance_notifications
language plpgsql
security definer
set search_path = ''
as $surv_acknowledge_notification$
declare
  v_notification public.surveillance_notifications%rowtype;
begin
  select *
    into v_notification
    from public.surveillance_notifications
    where id = p_notification_id;

  if not found then
    raise exception 'Surveillance notification not found';
  end if;

  if not public.can_manage_surveillance_business(v_notification.business_id) then
    raise exception 'Forbidden';
  end if;

  if v_notification.notification_type not in (
    'escalation_occ_health',
    'escalation_supervisor',
    'escalation_manager'
  ) then
    raise exception 'Only escalation notifications can be acknowledged from this queue';
  end if;

  update public.surveillance_notification_recipients
     set acknowledged_at = coalesce(acknowledged_at, now())
   where notification_id = p_notification_id
     and business_id = v_notification.business_id;

  update public.surveillance_notifications
     set delivery_status = 'acknowledged'
   where id = p_notification_id
     and delivery_status in ('pending', 'sent')
   returning * into v_notification;

  if not found then
    select *
      into v_notification
      from public.surveillance_notifications
      where id = p_notification_id;
  end if;

  return v_notification;
end;
$surv_acknowledge_notification$;

revoke all on function public.acknowledge_surveillance_notification(uuid) from public;
grant execute on function public.acknowledge_surveillance_notification(uuid) to authenticated;

commit;
