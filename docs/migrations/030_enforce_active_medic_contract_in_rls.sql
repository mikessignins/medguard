-- ============================================================
-- Migration 030 — Enforce active medic contracts in RLS
-- ============================================================
-- Purpose:
--   1. Move medic contract expiry enforcement to the database boundary.
--   2. Prevent expired medics from reading or mutating medic-scoped PHI
--      even if a client bypasses local role normalization.
--   3. Centralize the expiry rule in helper functions so future policy
--      changes do not need to duplicate date logic.
-- ============================================================

begin;

create or replace function public.is_current_user_active_medic()
returns boolean
language sql
stable
set search_path = public
as $function$
  select exists (
    select 1
      from public.user_accounts ua
     where ua.id = (select auth.uid())
       and ua.role = 'medic'
       and (ua.contract_end_date is null or ua.contract_end_date >= now())
  );
$function$;

comment on function public.is_current_user_active_medic() is
  'Returns true only when the current authenticated user is a medic whose contract has not expired.';

drop policy if exists medication_declarations_select on public.medication_declarations;
create policy medication_declarations_select
on public.medication_declarations
for select
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    public.is_current_user_active_medic()
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
);

drop policy if exists medication_declarations_medic_update on public.medication_declarations;
create policy medication_declarations_medic_update
on public.medication_declarations
for update
to authenticated
using (
  public.is_current_user_active_medic()
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
)
with check (
  public.is_current_user_active_medic()
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
);

drop policy if exists submissions_select on public.submissions;
create policy submissions_select
on public.submissions
for select
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    public.is_current_user_active_medic()
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
);

drop policy if exists submissions_update on public.submissions;
create policy submissions_update
on public.submissions
for update
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    public.is_current_user_active_medic()
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
    public.is_current_user_active_medic()
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
);

drop policy if exists module_submissions_select_scoped on public.module_submissions;
create policy module_submissions_select_scoped
on public.module_submissions
for select
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    public.is_current_user_active_medic()
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
);

drop policy if exists module_submissions_update_scoped on public.module_submissions;
create policy module_submissions_update_scoped
on public.module_submissions
for update
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    public.is_current_user_active_medic()
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
    public.is_current_user_active_medic()
    and business_id = public.get_my_business_id()
    and site_id = any(public.get_my_site_ids())
  )
);

drop policy if exists submission_comments_select on public.submission_comments;
create policy submission_comments_select
on public.submission_comments
for select
to authenticated
using (
  public.is_current_user_active_medic()
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
);

drop policy if exists submission_comments_insert on public.submission_comments;
create policy submission_comments_insert
on public.submission_comments
for insert
to authenticated
with check (
  public.is_current_user_active_medic()
  and business_id = public.get_my_business_id()
  and site_id = any(public.get_my_site_ids())
  and medic_user_id = (select auth.uid())::text
);

drop policy if exists worker_memberships_select on public.worker_memberships;
create policy worker_memberships_select
on public.worker_memberships
for select
to public
using (
  worker_id = (select auth.uid())
  or (
    exists (
      select 1
        from public.user_accounts ua
       where ua.id = (select auth.uid())
         and ua.business_id = worker_memberships.business_id
         and (
           ua.role = 'admin'
           or (
             ua.role = 'medic'
             and (ua.contract_end_date is null or ua.contract_end_date >= now())
           )
         )
    )
  )
);

drop policy if exists "Business members can read scripts" on storage.objects;
create policy "Business members can read scripts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'scripts'
  and exists (
    select 1
      from public.user_accounts ua
     where ua.id = auth.uid()
       and ua.business_id = split_part(objects.name, '/', 1)
       and (
         ua.role <> 'medic'
         or ua.contract_end_date is null
         or ua.contract_end_date >= now()
       )
  )
);

drop policy if exists "Medics and admins can delete scripts" on storage.objects;
create policy "Medics and admins can delete scripts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'scripts'
  and exists (
    select 1
      from public.user_accounts ua
     where ua.id = auth.uid()
       and ua.business_id = split_part(objects.name, '/', 1)
       and (
         ua.role = 'admin'
         or (
           ua.role = 'medic'
           and (ua.contract_end_date is null or ua.contract_end_date >= now())
         )
       )
  )
);

commit;
