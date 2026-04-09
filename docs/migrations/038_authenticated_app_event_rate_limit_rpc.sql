begin;

drop function if exists public.count_my_recent_app_events(text, timestamptz);

create function public.count_my_recent_app_events(
  p_action text,
  p_window_start timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = public
as $function$
  select count(*)::bigint
  from public.app_event_log
  where actor_user_id = (select auth.uid())::text
    and action = p_action
    and created_at >= p_window_start;
$function$;

revoke all on function public.count_my_recent_app_events(text, timestamptz) from public;
grant execute on function public.count_my_recent_app_events(text, timestamptz) to authenticated;

commit;
