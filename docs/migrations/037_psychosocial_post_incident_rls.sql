begin;

drop function if exists public.resolve_scoped_worker_account(text, text, uuid, text);

create function public.resolve_scoped_worker_account(
  p_business_id text,
  p_site_id text,
  p_worker_id uuid default null,
  p_worker_name text default null
)
returns table (
  worker_id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_current_user_active_medic() then
    raise exception 'Only active medics can resolve worker accounts for post-incident cases.'
      using errcode = '42501';
  end if;

  if p_business_id is null or p_business_id <> public.get_my_business_id() then
    raise exception 'Medic worker lookup is only allowed inside the current business.'
      using errcode = '42501';
  end if;

  if p_site_id is null or not (p_site_id = any(public.get_my_site_ids())) then
    raise exception 'Medic worker lookup is only allowed for assigned sites.'
      using errcode = '42501';
  end if;

  return query
  select ua.id, ua.display_name
  from public.user_accounts ua
  where ua.business_id = p_business_id
    and ua.role = 'worker'
    and p_site_id = any(coalesce(ua.site_ids, '{}'::text[]))
    and (
      (p_worker_id is not null and ua.id = p_worker_id)
      or (
        p_worker_id is null
        and nullif(trim(coalesce(p_worker_name, '')), '') is not null
        and ua.display_name ilike trim(p_worker_name)
      )
    )
  order by ua.display_name nulls last, ua.id
  limit 2;
end;
$function$;

revoke all on function public.resolve_scoped_worker_account(text, text, uuid, text) from public;
grant execute on function public.resolve_scoped_worker_account(text, text, uuid, text) to authenticated;

drop policy if exists module_submissions_medic_insert_psychosocial on public.module_submissions;
create policy module_submissions_medic_insert_psychosocial
on public.module_submissions
for insert
to authenticated
with check (
  public.is_current_user_active_medic()
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
  and module_key = 'psychosocial_health'
  and public.is_business_module_enabled(business_id, module_key)
);

commit;
