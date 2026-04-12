begin;

-- April 2026 security authority migration.
--
-- This migration keeps product-critical platform and worker mobility behavior:
-- - platform superusers can manage all businesses
-- - workers can join/switch businesses and sites
-- while moving authorization-sensitive changes behind explicit RLS/RPC controls.

-- ---------------------------------------------------------------------------
-- Explicit platform superuser scope
-- ---------------------------------------------------------------------------

alter table public.user_accounts
  add column if not exists superuser_scope text not null default 'business'
  check (superuser_scope in ('business', 'platform'));

update public.user_accounts
   set superuser_scope = 'platform'
 where role = 'superuser';

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
       and coalesce(ua.superuser_scope, 'business') = 'platform'
  );
$function$;

revoke all on function public.is_platform_superuser() from public;
grant execute on function public.is_platform_superuser() to authenticated;

create or replace function public.is_admin_for_business(p_business_id text)
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
       and ua.role = 'admin'
       and ua.business_id = p_business_id
  );
$function$;

revoke all on function public.is_admin_for_business(text) from public;
grant execute on function public.is_admin_for_business(text) to authenticated;

create or replace function public.get_my_superuser_scope()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(ua.superuser_scope, 'business')
  from public.user_accounts ua
  where ua.id = (select auth.uid())
  limit 1;
$function$;

revoke all on function public.get_my_superuser_scope() from public;
grant execute on function public.get_my_superuser_scope() to authenticated;

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
  perform set_config('medguard.authorized_clinical_write', 'on', true);

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

revoke all on function public.recall_my_submission(text, text) from public;
grant execute on function public.recall_my_submission(text, text) to authenticated;

drop policy if exists user_accounts_self_profile_update on public.user_accounts;
drop policy if exists user_accounts_admin_manage_medics on public.user_accounts;
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
  and coalesce(superuser_scope, 'business') = public.get_my_superuser_scope()
);

create policy user_accounts_admin_manage_medics
on public.user_accounts
for update
to authenticated
using (
  public.is_admin_for_business(business_id)
  and role in ('medic', 'pending_medic')
)
with check (
  public.is_admin_for_business(business_id)
  and role in ('medic', 'pending_medic')
);

-- ---------------------------------------------------------------------------
-- RLS coverage for businesses and feedback
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.feedback enable row level security;

drop policy if exists businesses_select on public.businesses;
drop policy if exists businesses_insert on public.businesses;
drop policy if exists businesses_update on public.businesses;
drop policy if exists businesses_delete on public.businesses;

create policy businesses_select
on public.businesses
for select
to authenticated
using (
  public.is_platform_superuser()
  or id = public.get_my_business_id()
);

create policy businesses_insert
on public.businesses
for insert
to authenticated
with check (public.is_platform_superuser());

create policy businesses_update
on public.businesses
for update
to authenticated
using (public.is_platform_superuser())
with check (public.is_platform_superuser());

create policy businesses_delete
on public.businesses
for delete
to authenticated
using (public.is_platform_superuser());

drop policy if exists "Users can insert feedback" on public.feedback;
drop policy if exists "Superusers can read feedback" on public.feedback;
drop policy if exists "Superusers can update feedback" on public.feedback;
drop policy if exists feedback_insert on public.feedback;
drop policy if exists feedback_select on public.feedback;
drop policy if exists feedback_update on public.feedback;
drop policy if exists feedback_delete on public.feedback;

create policy feedback_insert
on public.feedback
for insert
to authenticated
with check (
  submitted_by_user_id = (select auth.uid())::text
  and (
    business_id is null
    or business_id = public.get_my_business_id()
    or public.is_platform_superuser()
  )
);

create policy feedback_select
on public.feedback
for select
to authenticated
using (
  public.is_platform_superuser()
  or business_id = public.get_my_business_id()
);

create policy feedback_update
on public.feedback
for update
to authenticated
using (public.is_platform_superuser())
with check (public.is_platform_superuser());

create policy feedback_delete
on public.feedback
for delete
to authenticated
using (public.is_platform_superuser());

-- ---------------------------------------------------------------------------
-- Internal audit helper
-- ---------------------------------------------------------------------------

create or replace function public.write_security_audit_event(
  p_source text,
  p_action text,
  p_result text,
  p_actor_user_id text,
  p_actor_role text,
  p_actor_name text,
  p_business_id text,
  p_module_key text,
  p_route text,
  p_target_id text,
  p_error_message text default null,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.app_event_log (
    source,
    action,
    result,
    actor_user_id,
    actor_role,
    actor_name,
    business_id,
    module_key,
    route,
    target_id,
    error_message,
    context
  ) values (
    coalesce(nullif(btrim(p_source), ''), 'database'),
    btrim(p_action),
    btrim(p_result),
    p_actor_user_id,
    p_actor_role,
    p_actor_name,
    p_business_id,
    nullif(btrim(coalesce(p_module_key, '')), ''),
    nullif(btrim(coalesce(p_route, '')), ''),
    nullif(btrim(coalesce(p_target_id, '')), ''),
    nullif(btrim(coalesce(p_error_message, '')), ''),
    coalesce(p_context, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.write_security_audit_event(text, text, text, text, text, text, text, text, text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Worker mobility RPCs
-- ---------------------------------------------------------------------------

create or replace function public.worker_join_business_with_invite(p_invite_code text)
returns table (
  id text,
  worker_id text,
  business_id text,
  business_name text,
  role text,
  site_ids text[],
  joined_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_worker_id uuid := auth.uid();
  v_business_id text;
  v_membership record;
  v_account record;
begin
  if v_worker_id is null then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;

  select role, display_name, business_id
    into v_account
    from public.user_accounts
   where id = v_worker_id;

  if v_account.role is distinct from 'worker' then
    raise exception 'Only workers can join businesses with invite codes.' using errcode = 'P0001';
  end if;

  select ic.business_id
    into v_business_id
    from public.invite_codes ic
   where upper(ic.code) = upper(btrim(p_invite_code))
   limit 1;

  if v_business_id is null then
    raise exception 'Invalid invite code.' using errcode = 'P0001';
  end if;

  update public.worker_memberships
     set is_active = false
   where worker_id = v_worker_id;

  insert into public.worker_memberships (
    worker_id,
    business_id,
    role,
    site_ids,
    is_active
  ) values (
    v_worker_id,
    v_business_id,
    'worker',
    array[]::text[],
    true
  )
  on conflict (worker_id, business_id) do update
     set is_active = true,
         role = 'worker'
  returning * into v_membership;

  update public.user_accounts
     set business_id = v_business_id
   where id = v_worker_id;

  perform public.write_security_audit_event(
    'database',
    'worker_business_joined',
    'success',
    v_worker_id::text,
    v_account.role,
    v_account.display_name,
    v_business_id,
    null,
    'rpc/worker_join_business_with_invite',
    v_membership.id::text,
    null,
    jsonb_build_object('previous_business_id', v_account.business_id)
  );

  return query
    select
      wm.id::text,
      wm.worker_id::text,
      wm.business_id,
      b.name,
      wm.role,
      coalesce(wm.site_ids, array[]::text[]),
      wm.joined_at,
      wm.is_active
    from public.worker_memberships wm
    join public.businesses b on b.id = wm.business_id
   where wm.id = v_membership.id;
end;
$function$;

create or replace function public.worker_set_active_membership(p_membership_id text)
returns table (
  id text,
  worker_id text,
  business_id text,
  business_name text,
  role text,
  site_ids text[],
  joined_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_worker_id uuid := auth.uid();
  v_membership record;
  v_account record;
begin
  if v_worker_id is null then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;

  select role, display_name, business_id
    into v_account
    from public.user_accounts
   where id = v_worker_id;

  if v_account.role is distinct from 'worker' then
    raise exception 'Only workers can switch active memberships.' using errcode = 'P0001';
  end if;

  select *
    into v_membership
    from public.worker_memberships wm
   where wm.id::text = p_membership_id
     and wm.worker_id = v_worker_id
   for update;

  if v_membership.id is null then
    raise exception 'Membership not found.' using errcode = 'P0001';
  end if;

  update public.worker_memberships
     set is_active = false
   where worker_id = v_worker_id;

  update public.worker_memberships
     set is_active = true
   where id = v_membership.id;

  update public.user_accounts
     set business_id = v_membership.business_id
   where id = v_worker_id;

  perform public.write_security_audit_event(
    'database',
    'worker_active_membership_changed',
    'success',
    v_worker_id::text,
    v_account.role,
    v_account.display_name,
    v_membership.business_id,
    null,
    'rpc/worker_set_active_membership',
    v_membership.id::text,
    null,
    jsonb_build_object('previous_business_id', v_account.business_id)
  );

  return query
    select
      wm.id::text,
      wm.worker_id::text,
      wm.business_id,
      b.name,
      wm.role,
      coalesce(wm.site_ids, array[]::text[]),
      wm.joined_at,
      wm.is_active
    from public.worker_memberships wm
    join public.businesses b on b.id = wm.business_id
   where wm.id = v_membership.id;
end;
$function$;

revoke all on function public.worker_join_business_with_invite(text) from public;
revoke all on function public.worker_set_active_membership(text) from public;
grant execute on function public.worker_join_business_with_invite(text) to authenticated;
grant execute on function public.worker_set_active_membership(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Append-only comments and clinical review RPCs
-- ---------------------------------------------------------------------------

create or replace function public.prevent_legacy_submission_comments_update()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if old.comments is distinct from new.comments then
    raise exception 'Legacy submissions.comments is immutable. Use submission_comments.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists submissions_prevent_legacy_comments_update on public.submissions;
create trigger submissions_prevent_legacy_comments_update
  before update of comments on public.submissions
  for each row execute function public.prevent_legacy_submission_comments_update();

create or replace function public.prevent_direct_clinical_review_update()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if coalesce(current_setting('medguard.authorized_clinical_write', true), '') = 'on' then
    return new;
  end if;

  if tg_table_name = 'submissions'
     and (
       old.status is distinct from new.status
       or old.decision is distinct from new.decision
     ) then
    raise exception 'Clinical review state must be changed through an approved review RPC.'
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'medication_declarations'
     and (
       old.medic_review_status is distinct from new.medic_review_status
       or old.medic_comments is distinct from new.medic_comments
       or old.review_required is distinct from new.review_required
       or old.medic_name is distinct from new.medic_name
       or old.medic_reviewed_at is distinct from new.medic_reviewed_at
     ) then
    raise exception 'Medication review state must be changed through an approved review RPC.'
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'module_submissions'
     and (
       old.status is distinct from new.status
       or old.review_payload is distinct from new.review_payload
       or old.reviewed_at is distinct from new.reviewed_at
       or old.reviewed_by is distinct from new.reviewed_by
     ) then
    raise exception 'Module review state must be changed through an approved review RPC.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

drop trigger if exists submissions_prevent_direct_review_update on public.submissions;
create trigger submissions_prevent_direct_review_update
  before update of status, decision on public.submissions
  for each row execute function public.prevent_direct_clinical_review_update();

drop trigger if exists medication_declarations_prevent_direct_review_update on public.medication_declarations;
create trigger medication_declarations_prevent_direct_review_update
  before update of medic_review_status, medic_comments, review_required, medic_name, medic_reviewed_at
  on public.medication_declarations
  for each row execute function public.prevent_direct_clinical_review_update();

drop trigger if exists module_submissions_prevent_direct_review_update on public.module_submissions;
create trigger module_submissions_prevent_direct_review_update
  before update of status, review_payload, reviewed_at, reviewed_by on public.module_submissions
  for each row execute function public.prevent_direct_clinical_review_update();

create or replace function public.add_submission_comment(
  p_submission_id text,
  p_note text,
  p_outcome text default null
)
returns public.submission_comments
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_submission record;
  v_comment public.submission_comments;
begin
  select id, role, display_name, business_id, site_ids, is_inactive, contract_end_date
    into v_actor
    from public.user_accounts
   where id = auth.uid();

  if v_actor.id is null
     or v_actor.role <> 'medic'
     or coalesce(v_actor.is_inactive, false)
     or (v_actor.contract_end_date is not null and v_actor.contract_end_date < now()) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  select id, business_id, site_id
    into v_submission
    from public.submissions
   where id = p_submission_id;

  if v_submission.id is null then
    raise exception 'Submission not found.' using errcode = 'P0001';
  end if;

  if v_submission.business_id <> v_actor.business_id
     or v_submission.site_id <> any(coalesce(v_actor.site_ids, array[]::text[])) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  insert into public.submission_comments (
    submission_id,
    business_id,
    site_id,
    medic_user_id,
    medic_name,
    note,
    outcome
  ) values (
    v_submission.id,
    v_submission.business_id,
    v_submission.site_id,
    v_actor.id::text,
    coalesce(nullif(v_actor.display_name, ''), 'Medic'),
    btrim(p_note),
    nullif(btrim(coalesce(p_outcome, '')), '')
  )
  returning * into v_comment;

  perform public.write_security_audit_event(
    'database',
    'submission_comment_added',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_submission.business_id,
    'emergency_declaration',
    'rpc/add_submission_comment',
    v_submission.id,
    null,
    jsonb_build_object('comment_id', v_comment.id)
  );

  return v_comment;
end;
$function$;

create or replace function public.review_emergency_submission(
  p_submission_id text,
  p_status text,
  p_note text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_submission record;
  v_decision jsonb;
begin
  if p_status not in ('In Review', 'Approved', 'Requires Follow-up') then
    raise exception 'Invalid review status.' using errcode = 'P0001';
  end if;

  select id, role, display_name, business_id, site_ids, is_inactive, contract_end_date
    into v_actor
    from public.user_accounts
   where id = auth.uid();

  if v_actor.id is null
     or v_actor.role <> 'medic'
     or coalesce(v_actor.is_inactive, false)
     or (v_actor.contract_end_date is not null and v_actor.contract_end_date < now()) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  select id, business_id, site_id, status, version, decision
    into v_submission
    from public.submissions
   where id = p_submission_id
   for update;

  if v_submission.id is null then
    raise exception 'Submission not found.' using errcode = 'P0001';
  end if;

  if v_submission.business_id <> v_actor.business_id
     or v_submission.site_id <> any(coalesce(v_actor.site_ids, array[]::text[])) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if p_expected_version is not null and v_submission.version <> p_expected_version then
    raise exception 'This form was updated by another user.' using errcode = 'P0001';
  end if;

  if v_submission.status in ('Approved', 'Recalled') then
    raise exception 'Submission is already finalised.' using errcode = 'P0001';
  end if;

  if v_submission.status = 'Requires Follow-up' and p_status <> 'Approved' then
    raise exception 'Follow-up submissions can only advance to Approved.' using errcode = 'P0001';
  end if;

  v_decision := case
    when p_status in ('Approved', 'Requires Follow-up') then jsonb_build_object(
      'outcome', p_status,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'decided_by_user_id', v_actor.id::text,
      'decided_by_name', v_actor.display_name,
      'decided_at', now()
    )
    else v_submission.decision
  end;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  update public.submissions
     set status = p_status,
         decision = v_decision
   where id = v_submission.id;

  perform public.write_security_audit_event(
    'database',
    'emergency_review_saved',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_submission.business_id,
    'emergency_declaration',
    'rpc/review_emergency_submission',
    v_submission.id,
    null,
    jsonb_build_object('status', p_status, 'previous_status', v_submission.status)
  );

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.review_medication_declaration(
  p_declaration_id text,
  p_medic_review_status text,
  p_medic_comments text default null,
  p_review_required boolean default false,
  p_expected_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_declaration record;
begin
  if p_medic_review_status not in ('Pending', 'In Review', 'Normal Duties', 'Restricted Duties', 'Unfit for Work') then
    raise exception 'Invalid medication review status.' using errcode = 'P0001';
  end if;

  select id, role, display_name, business_id, site_ids, is_inactive, contract_end_date
    into v_actor
    from public.user_accounts
   where id = auth.uid();

  if v_actor.id is null
     or v_actor.role <> 'medic'
     or coalesce(v_actor.is_inactive, false)
     or (v_actor.contract_end_date is not null and v_actor.contract_end_date < now()) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  select id, business_id, site_id, medic_review_status
    into v_declaration
    from public.medication_declarations
   where id = p_declaration_id
   for update;

  if v_declaration.id is null then
    raise exception 'Medication declaration not found.' using errcode = 'P0001';
  end if;

  if v_declaration.business_id <> v_actor.business_id
     or v_declaration.site_id <> any(coalesce(v_actor.site_ids, array[]::text[])) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if p_expected_status is not null and v_declaration.medic_review_status is distinct from p_expected_status then
    raise exception 'This medication review was updated by another medic.' using errcode = 'P0001';
  end if;

  if v_declaration.medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work') then
    raise exception 'Medication declaration is already finalised.' using errcode = 'P0001';
  end if;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  update public.medication_declarations
     set medic_review_status = p_medic_review_status,
         medic_comments = coalesce(p_medic_comments, ''),
         review_required = coalesce(p_review_required, false),
         medic_name = v_actor.display_name,
         medic_reviewed_at = now()
   where id = v_declaration.id;

  perform public.write_security_audit_event(
    'database',
    'medication_review_saved',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_declaration.business_id,
    'confidential_medication',
    'rpc/review_medication_declaration',
    v_declaration.id,
    null,
    jsonb_build_object(
      'medic_review_status', p_medic_review_status,
      'previous_status', v_declaration.medic_review_status
    )
  );

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.review_module_submission(
  p_submission_id text,
  p_module_key text,
  p_next_status text,
  p_review_payload jsonb,
  p_expected_status text default null,
  p_expected_reviewed_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_submission record;
begin
  select id, role, display_name, business_id, site_ids, is_inactive, contract_end_date
    into v_actor
    from public.user_accounts
   where id = auth.uid();

  if v_actor.id is null
     or v_actor.role <> 'medic'
     or coalesce(v_actor.is_inactive, false)
     or (v_actor.contract_end_date is not null and v_actor.contract_end_date < now()) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  select id, business_id, site_id, module_key, status, review_payload, reviewed_by
    into v_submission
    from public.module_submissions
   where id::text = p_submission_id
     and module_key = p_module_key
   for update;

  if v_submission.id is null then
    raise exception 'Module submission not found.' using errcode = 'P0001';
  end if;

  if v_submission.business_id <> v_actor.business_id
     or v_submission.site_id <> any(coalesce(v_actor.site_ids, array[]::text[])) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if p_expected_status is not null and v_submission.status is distinct from p_expected_status then
    raise exception 'This review was updated by another medic.' using errcode = 'P0001';
  end if;

  if p_expected_reviewed_by is not null
     and v_submission.reviewed_by is distinct from p_expected_reviewed_by::uuid then
    raise exception 'This review was claimed by another medic.' using errcode = 'P0001';
  end if;

  if v_submission.status = 'resolved' then
    raise exception 'This review has already been finalised.' using errcode = 'P0001';
  end if;

  if v_submission.status = 'in_medic_review'
     and v_submission.reviewed_by is not null
     and v_submission.reviewed_by <> v_actor.id then
    raise exception 'This review has already been claimed by another medic.' using errcode = 'P0001';
  end if;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  update public.module_submissions
     set status = p_next_status,
         review_payload = coalesce(p_review_payload, '{}'::jsonb),
         reviewed_at = now(),
         reviewed_by = v_actor.id
   where id = v_submission.id;

  perform public.write_security_audit_event(
    'database',
    case
      when p_module_key = 'fatigue_assessment' then 'fatigue_review_saved'
      when p_module_key = 'psychosocial_health' then 'psychosocial_review_saved'
      else 'module_review_saved'
    end,
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_submission.business_id,
    p_module_key,
    'rpc/review_module_submission',
    v_submission.id::text,
    null,
    jsonb_build_object(
      'next_status', p_next_status,
      'previous_status', v_submission.status
    )
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.add_submission_comment(text, text, text) from public;
revoke all on function public.review_emergency_submission(text, text, text, integer) from public;
revoke all on function public.review_medication_declaration(text, text, text, boolean, text) from public;
revoke all on function public.review_module_submission(text, text, text, jsonb, text, text) from public;
grant execute on function public.add_submission_comment(text, text, text) to authenticated;
grant execute on function public.review_emergency_submission(text, text, text, integer) to authenticated;
grant execute on function public.review_medication_declaration(text, text, text, boolean, text) to authenticated;
grant execute on function public.review_module_submission(text, text, text, jsonb, text, text) to authenticated;

commit;
