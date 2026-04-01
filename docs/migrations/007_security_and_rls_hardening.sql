-- ============================================================
-- Migration 007 — Function hardening + RLS performance cleanup
-- ============================================================
-- Purpose:
--   1. Fix Supabase Security Advisor warnings for mutable search_path on
--      trigger/helper functions.
--   2. Fix Supabase Performance Advisor warnings by:
--      - wrapping auth.uid() in SELECT for initplan optimization
--      - consolidating worker + medic permissive policies where safe
--
-- Notes:
--   - This preserves the current intended access model:
--       * workers: own declarations only
--       * medics: assigned-site declarations only
--       * admins: dashboard/reporting access via app paths, not raw PHI tables
--       * superusers: platform/billing access via app paths, not raw PHI tables
--   - Run in Supabase SQL Editor or via your normal migration workflow.
-- ============================================================

begin;

-- ── 1. Function hardening ────────────────────────────────────────────────────

create or replace function public.set_site_name_on_insert()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.site_id is not null and (new.site_name is null or new.site_name = '') then
    select s.name
      into new.site_name
      from public.sites s
     where s.id = new.site_id;
  end if;
  return new;
end;
$function$;

create or replace function public.check_business_not_suspended()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if exists (
    select 1
      from public.businesses b
     where b.id = new.business_id
       and b.is_suspended = true
  ) then
    raise exception 'Business account is suspended. Form submission is not permitted.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create or replace function public.check_submission_status_transition()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status in ('Approved', 'Recalled') then
    raise exception 'Submission status cannot be changed from the terminal state ''%''.', old.status
      using errcode = 'P0001';
  end if;

  if old.status = 'Requires Follow-up' and new.status != 'Approved' then
    raise exception 'From ''Requires Follow-up'', status can only advance to ''Approved''.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create or replace function public.increment_submission_version()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if old.status is distinct from new.status
     or old.decision is distinct from new.decision then
    new.version = old.version + 1;
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_purge_log_modification()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  raise exception 'Purge audit log records are immutable and cannot be modified or deleted.'
    using errcode = 'P0001';
end;
$function$;

create or replace function public.auto_tag_test_during_trial()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if exists (
    select 1
      from public.businesses b
     where b.id = new.business_id
       and b.trial_until is not null
       and b.trial_until > now()
  ) then
    new.is_test = true;
  end if;
  return new;
end;
$function$;

create or replace function public.lock_is_test_when_reviewed()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.is_test is not distinct from old.is_test then
    return new;
  end if;

  if tg_table_name = 'submissions' and old.status not in ('New') then
    raise exception 'Cannot change is_test on a submission that has already been reviewed (status: %).',
      old.status using errcode = 'P0001';
  end if;

  if tg_table_name = 'medication_declarations' and old.medic_review_status not in ('Pending') then
    raise exception 'Cannot change is_test on a medication declaration that has already been reviewed (status: %).',
      old.medic_review_status using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create or replace function public.prevent_admin_log_modification()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  raise exception 'Admin action log records are immutable and cannot be modified or deleted.'
    using errcode = 'P0001';
end;
$function$;

-- ── 2. RLS policy performance cleanup ───────────────────────────────────────
-- Replace per-row auth.uid() evaluation with (select auth.uid()) and merge
-- equivalent permissive policies where possible.

-- user_accounts
drop policy if exists user_accounts_select on public.user_accounts;
drop policy if exists user_accounts_update on public.user_accounts;
drop policy if exists user_accounts_insert on public.user_accounts;

create policy user_accounts_select
on public.user_accounts
for select
to authenticated
using (
  id = (select auth.uid())
  or (business_id = get_my_business_id() and get_my_role() = 'admin')
  or current_user_role() = 'superuser'
);

create policy user_accounts_update
on public.user_accounts
for update
to authenticated
using (
  id = (select auth.uid())
  or (business_id = get_my_business_id() and get_my_role() = 'admin')
)
with check (
  id = (select auth.uid())
  or (business_id = get_my_business_id() and get_my_role() = 'admin')
);

create policy user_accounts_insert
on public.user_accounts
for insert
to authenticated
with check (
  id = (select auth.uid())
  or (business_id = get_my_business_id() and get_my_role() = 'admin')
);

-- medication_declarations
drop policy if exists medication_declarations_worker_select on public.medication_declarations;
drop policy if exists medication_declarations_worker_insert on public.medication_declarations;
drop policy if exists medication_declarations_medic_select on public.medication_declarations;
drop policy if exists medication_declarations_medic_update on public.medication_declarations;

create policy medication_declarations_select
on public.medication_declarations
for select
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    get_my_role() = 'medic'
    and business_id = get_my_business_id()
    and site_id = any(get_my_site_ids())
  )
);

create policy medication_declarations_worker_insert
on public.medication_declarations
for insert
to authenticated
with check (
  worker_id = (select auth.uid())
  and business_id = get_my_business_id()
);

create policy medication_declarations_medic_update
on public.medication_declarations
for update
to authenticated
using (
  get_my_role() = 'medic'
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
)
with check (
  get_my_role() = 'medic'
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
);

-- submissions
drop policy if exists submissions_worker_select on public.submissions;
drop policy if exists submissions_worker_insert on public.submissions;
drop policy if exists submissions_worker_update on public.submissions;
drop policy if exists submissions_medic_select on public.submissions;
drop policy if exists submissions_medic_update on public.submissions;

create policy submissions_select
on public.submissions
for select
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    get_my_role() = 'medic'
    and business_id = get_my_business_id()
    and site_id = any(get_my_site_ids())
  )
);

create policy submissions_worker_insert
on public.submissions
for insert
to authenticated
with check (
  worker_id = (select auth.uid())
  and business_id = get_my_business_id()
);

create policy submissions_update
on public.submissions
for update
to authenticated
using (
  worker_id = (select auth.uid())
  or (
    get_my_role() = 'medic'
    and business_id = get_my_business_id()
    and site_id = any(get_my_site_ids())
  )
)
with check (
  (
    worker_id = (select auth.uid())
    and business_id = get_my_business_id()
  )
  or (
    get_my_role() = 'medic'
    and business_id = get_my_business_id()
    and site_id = any(get_my_site_ids())
  )
);

commit;
