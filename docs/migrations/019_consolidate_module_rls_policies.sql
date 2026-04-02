-- 019_consolidate_module_rls_policies.sql
-- Performance tidy-up for Supabase linter warning 0006 (multiple_permissive_policies).
-- Consolidates duplicated permissive policies for the same role/action.

begin;

-- ---------------------------------------------------------------------------
-- business_modules
-- Keep one SELECT policy; scope superuser write access to non-SELECT actions.
-- ---------------------------------------------------------------------------
drop policy if exists business_modules_superuser_manage on public.business_modules;

create policy business_modules_superuser_insert
on public.business_modules
for insert
to authenticated
with check (public.get_my_role() = 'superuser');

create policy business_modules_superuser_update
on public.business_modules
for update
to authenticated
using (public.get_my_role() = 'superuser')
with check (public.get_my_role() = 'superuser');

create policy business_modules_superuser_delete
on public.business_modules
for delete
to authenticated
using (public.get_my_role() = 'superuser');

-- ---------------------------------------------------------------------------
-- module_form_versions
-- Keep one SELECT policy; scope superuser write access to non-SELECT actions.
-- ---------------------------------------------------------------------------
drop policy if exists module_form_versions_superuser_manage on public.module_form_versions;

create policy module_form_versions_superuser_insert
on public.module_form_versions
for insert
to authenticated
with check (public.get_my_role() = 'superuser');

create policy module_form_versions_superuser_update
on public.module_form_versions
for update
to authenticated
using (public.get_my_role() = 'superuser')
with check (public.get_my_role() = 'superuser');

create policy module_form_versions_superuser_delete
on public.module_form_versions
for delete
to authenticated
using (public.get_my_role() = 'superuser');

-- ---------------------------------------------------------------------------
-- module_submissions
-- Merge worker+medic SELECT and UPDATE into single policies each.
-- ---------------------------------------------------------------------------
drop policy if exists module_submissions_worker_select on public.module_submissions;
drop policy if exists module_submissions_medic_select on public.module_submissions;

create policy module_submissions_select_scoped
on public.module_submissions
for select
to authenticated
using (
  (worker_id = (select auth.uid()))
  or (
    public.get_my_role() = 'medic'
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
);

drop policy if exists module_submissions_worker_update on public.module_submissions;
drop policy if exists module_submissions_medic_update on public.module_submissions;

create policy module_submissions_update_scoped
on public.module_submissions
for update
to authenticated
using (
  (worker_id = (select auth.uid()))
  or (
    public.get_my_role() = 'medic'
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
)
with check (
  (
    worker_id = (select auth.uid())
    and business_id = public.get_my_business_id()
  )
  or (
    public.get_my_role() = 'medic'
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
);

commit;
