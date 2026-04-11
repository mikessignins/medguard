begin;

-- Security hardening after April 2026 review:
-- - prevent client-side role / tenant escalation
-- - remove raw superuser PHI reads
-- - remove broad worker clinical updates
-- - scope prescription script storage to the worker owner or assigned active medics

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select ua.role::text
  from public.user_accounts ua
  where ua.id = (select auth.uid())
  limit 1;
$function$;

create or replace function public.get_my_business_id()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select ua.business_id::text
  from public.user_accounts ua
  where ua.id = (select auth.uid())
  limit 1;
$function$;

create or replace function public.get_my_site_ids()
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(ua.site_ids, array[]::text[])
  from public.user_accounts ua
  where ua.id = (select auth.uid())
  limit 1;
$function$;

revoke all on function public.get_my_role() from public;
revoke all on function public.get_my_business_id() from public;
revoke all on function public.get_my_site_ids() from public;

grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_my_business_id() to authenticated;
grant execute on function public.get_my_site_ids() to authenticated;

create or replace function public.is_active_medic_for_record(
  p_business_id text,
  p_site_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and ua.role = 'medic'
      and coalesce(ua.is_inactive, false) = false
      and (ua.contract_end_date is null or ua.contract_end_date >= now())
      and ua.business_id = p_business_id
      and p_site_id = any(coalesce(ua.site_ids, array[]::text[]))
  );
$function$;

create or replace function public.recall_my_submission(
  p_submission_id text,
  p_business_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_updated_count integer;
begin
  update public.submissions
     set status = 'Recalled'
   where id = p_submission_id
     and business_id = p_business_id
     and worker_id = auth.uid()
     and status = 'New';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Submission cannot be recalled.'
      using errcode = 'P0001';
  end if;
end;
$function$;

grant execute on function public.recall_my_submission(text, text) to authenticated;

create or replace function public.current_user_is_inactive()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce((
    select ua.is_inactive
    from public.user_accounts ua
    where ua.id = auth.uid()
    limit 1
  ), false);
$function$;

create or replace function public.current_user_contract_end_date()
returns timestamp with time zone
language sql
stable
security definer
set search_path = public
as $function$
  select (
    select ua.contract_end_date
    from public.user_accounts ua
    where ua.id = auth.uid()
    limit 1
  );
$function$;

drop policy if exists user_accounts_self_update on public.user_accounts;
drop policy if exists user_accounts_update on public.user_accounts;
drop policy if exists user_accounts_insert on public.user_accounts;
drop policy if exists user_accounts_admin_manage_medics on public.user_accounts;
drop policy if exists user_accounts_superuser_update on public.user_accounts;

create policy user_accounts_self_profile_update
on public.user_accounts
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = public.get_my_role()
  and business_id = public.get_my_business_id()
  and coalesce(site_ids, array[]::text[]) = coalesce(public.get_my_site_ids(), array[]::text[])
  and coalesce(is_inactive, false) = public.current_user_is_inactive()
  and contract_end_date is not distinct from public.current_user_contract_end_date()
);

create policy user_accounts_self_worker_insert
on public.user_accounts
for insert
to authenticated
with check (
  id = auth.uid()
  and role in ('worker', 'pending_medic')
  and coalesce(site_ids, array[]::text[]) = array[]::text[]
  and coalesce(is_inactive, false) = false
);

create policy user_accounts_admin_manage_medics
on public.user_accounts
for update
to authenticated
using (
  exists (
    select 1
    from public.user_accounts admin
    where admin.id = auth.uid()
      and admin.role = 'admin'
      and admin.business_id = user_accounts.business_id
  )
  and role in ('medic', 'pending_medic')
)
with check (
  exists (
    select 1
    from public.user_accounts admin
    where admin.id = auth.uid()
      and admin.role = 'admin'
      and admin.business_id = user_accounts.business_id
  )
  and role in ('medic', 'pending_medic')
);

create policy user_accounts_superuser_update
on public.user_accounts
for update
to authenticated
using (public.get_my_role() = 'superuser')
with check (public.get_my_role() = 'superuser');

drop policy if exists submissions_worker_update on public.submissions;
drop policy if exists submissions_update on public.submissions;
create policy submissions_medic_update
on public.submissions
for update
to authenticated
using (
  public.is_active_medic_for_record(business_id, site_id)
)
with check (
  public.is_active_medic_for_record(business_id, site_id)
);

drop policy if exists medication_declarations_worker_update on public.medication_declarations;
drop policy if exists medication_declarations_medic_update on public.medication_declarations;
create policy medication_declarations_medic_update
on public.medication_declarations
for update
to authenticated
using (
  public.is_active_medic_for_record(business_id, site_id)
)
with check (
  public.is_active_medic_for_record(business_id, site_id)
);

drop policy if exists module_submissions_worker_update on public.module_submissions;
drop policy if exists module_submissions_update_scoped on public.module_submissions;
create policy module_submissions_medic_update_scoped
on public.module_submissions
for update
to authenticated
using (
  public.is_active_medic_for_record(business_id, site_id)
)
with check (
  public.is_active_medic_for_record(business_id, site_id)
);

drop policy if exists submissions_superuser_select on public.submissions;
drop policy if exists medication_declarations_superuser_select on public.medication_declarations;

create or replace function public.can_access_script_object(p_object_name text, p_write boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_parts text[];
  v_business_id text;
  v_record_id text;
  v_is_meddec boolean;
begin
  v_parts := string_to_array(p_object_name, '/');
  v_business_id := v_parts[1];
  v_is_meddec := array_length(v_parts, 1) >= 4 and v_parts[2] = 'meddec';

  if v_business_id is null then
    return false;
  end if;

  begin
    v_record_id := case
      when v_is_meddec then v_parts[3]
      else v_parts[2]
    end;
  exception when others then
    return false;
  end;

  if v_is_meddec then
    if exists (
      select 1
      from public.medication_declarations md
      where md.id = v_record_id
        and md.business_id = v_business_id
        and md.worker_id = auth.uid()
    ) then
      return true;
    end if;

    if p_write then
      return false;
    end if;

    return exists (
      select 1
      from public.medication_declarations md
      where md.id = v_record_id
        and md.business_id = v_business_id
        and public.is_active_medic_for_record(md.business_id, md.site_id)
    );
  end if;

  if exists (
    select 1
    from public.submissions s
    where s.id = v_record_id
      and s.business_id = v_business_id
      and s.worker_id = auth.uid()
  ) then
    return true;
  end if;

  if p_write then
    return false;
  end if;

  return exists (
    select 1
    from public.submissions s
    where s.id = v_record_id
      and s.business_id = v_business_id
      and public.is_active_medic_for_record(s.business_id, s.site_id)
  );
end;
$function$;

grant execute on function public.can_access_script_object(text, boolean) to authenticated;

drop policy if exists "Business members can read scripts" on storage.objects;
drop policy if exists "Medics and admins can delete scripts" on storage.objects;
drop policy if exists "Workers can replace scripts for their business" on storage.objects;
drop policy if exists "Workers can upload scripts for their business" on storage.objects;

create policy "Workers and assigned active medics can read scripts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'scripts'
  and public.can_access_script_object(name, false)
);

create policy "Workers can upload owned scripts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'scripts'
  and public.can_access_script_object(name, true)
);

create policy "Workers can replace owned scripts"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'scripts'
  and public.can_access_script_object(name, true)
)
with check (
  bucket_id = 'scripts'
  and public.can_access_script_object(name, true)
);

create policy "Assigned active medics can delete scripts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'scripts'
  and public.can_access_script_object(name, false)
  and exists (
    select 1
    from public.user_accounts ua
    where ua.id = auth.uid()
      and ua.role = 'medic'
      and coalesce(ua.is_inactive, false) = false
      and (ua.contract_end_date is null or ua.contract_end_date >= now())
  )
);

commit;
