begin;

drop function if exists public.assert_can_manage_business_admins(text);
drop function if exists public.update_business_admin_display_name(text, text, text);
drop function if exists public.delete_business_admin(text, text);

create function public.assert_can_manage_business_admins(p_business_id text)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and ua.role = 'superuser'
  ) then
    raise exception 'not authorized to manage business admins'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
  ) then
    raise exception 'business not found'
      using errcode = 'P0002';
  end if;
end;
$function$;

create function public.update_business_admin_display_name(
  p_business_id text,
  p_admin_id text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_can_manage_business_admins(p_business_id);

  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display name cannot be empty'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.user_accounts ua
    where ua.id::text = p_admin_id
      and ua.business_id = p_business_id
      and ua.role = 'admin'
  ) then
    raise exception 'admin not found for business'
      using errcode = 'P0002';
  end if;

  update public.user_accounts
  set display_name = trim(p_display_name)
  where id::text = p_admin_id
    and business_id = p_business_id
    and role = 'admin';
end;
$function$;

create function public.delete_business_admin(
  p_business_id text,
  p_admin_id text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_count integer;
begin
  perform public.assert_can_manage_business_admins(p_business_id);

  select count(*)
    into v_admin_count
  from public.user_accounts ua
  where ua.business_id = p_business_id
    and ua.role = 'admin';

  if v_admin_count <= 1 then
    raise exception 'cannot delete the last admin for a business'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.user_accounts ua
    where ua.id::text = p_admin_id
      and ua.business_id = p_business_id
      and ua.role = 'admin'
  ) then
    raise exception 'admin not found for business'
      using errcode = 'P0002';
  end if;

  delete from public.user_index
  where user_id::text = p_admin_id;

  delete from public.user_accounts
  where id::text = p_admin_id
    and business_id = p_business_id
    and role = 'admin';

  delete from auth.users
  where id = p_admin_id::uuid;
end;
$function$;

revoke all on function public.assert_can_manage_business_admins(text) from public;
revoke all on function public.update_business_admin_display_name(text, text, text) from public;
revoke all on function public.delete_business_admin(text, text) from public;

grant execute on function public.assert_can_manage_business_admins(text) to authenticated;
grant execute on function public.update_business_admin_display_name(text, text, text) to authenticated;
grant execute on function public.delete_business_admin(text, text) to authenticated;

commit;
