begin;

-- Product model: there are four roles only. A superuser is a platform
-- owner/operator, not a business-scoped administrator.

update public.user_accounts
   set superuser_scope = 'platform'
 where role = 'superuser'
   and superuser_scope <> 'platform';

create or replace function public.is_platform_superuser()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
      from public.user_accounts ua
     where ua.id = (select auth.uid())
       and ua.role = 'superuser'
  );
$function$;

revoke all on function public.is_platform_superuser() from public;
grant execute on function public.is_platform_superuser() to authenticated;

commit;
