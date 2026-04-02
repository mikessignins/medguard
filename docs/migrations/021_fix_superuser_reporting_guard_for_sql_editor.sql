begin;

-- SQL editor and service-role contexts do not carry an authenticated end-user
-- auth.uid(), so allow those contexts for operational/testing queries.
-- Runtime app calls remain restricted to user_accounts.role = 'superuser'.
create or replace function public.assert_current_user_is_superuser()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  jwt_role text := coalesce((select auth.role()), '');
begin
  -- SQL editor/admin session (no JWT user context)
  if current_user = 'postgres' then
    return;
  end if;

  -- Server-side privileged contexts
  if jwt_role in ('service_role', 'supabase_admin') then
    return;
  end if;

  -- End-user app/session context: must be superuser in user_accounts
  if exists (
    select 1
    from public.user_accounts ua
    where ua.id = (select auth.uid())
      and ua.role = 'superuser'
  ) then
    return;
  end if;

  raise exception 'not authorized for superuser reporting'
    using errcode = '42501';
end;
$function$;

revoke all on function public.assert_current_user_is_superuser() from public;
grant execute on function public.assert_current_user_is_superuser() to authenticated;

commit;
