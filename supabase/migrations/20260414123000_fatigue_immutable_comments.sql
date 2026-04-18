begin;

create table if not exists public.fatigue_assessment_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.module_submissions(id) on delete cascade,
  business_id text not null references public.businesses(id),
  site_id text not null references public.sites(id),
  medic_user_id text not null,
  medic_name text not null,
  note text not null,
  outcome text null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  constraint fatigue_assessment_comments_note_not_blank check (btrim(note) <> ''),
  constraint fatigue_assessment_comments_medic_name_not_blank check (btrim(medic_name) <> '')
);

create index if not exists fatigue_assessment_comments_submission_created_idx
  on public.fatigue_assessment_comments (submission_id, created_at, id);

create index if not exists fatigue_assessment_comments_scope_idx
  on public.fatigue_assessment_comments (business_id, site_id, created_at);

alter table public.fatigue_assessment_comments enable row level security;

drop policy if exists fatigue_assessment_comments_select on public.fatigue_assessment_comments;
create policy fatigue_assessment_comments_select
on public.fatigue_assessment_comments
for select
to authenticated
using (
  is_current_user_active_medic()
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
);

drop policy if exists fatigue_assessment_comments_insert on public.fatigue_assessment_comments;
create policy fatigue_assessment_comments_insert
on public.fatigue_assessment_comments
for insert
to authenticated
with check (
  is_current_user_active_medic()
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
  and medic_user_id = ((select auth.uid())::text)
);

create or replace function public.prevent_fatigue_assessment_comments_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Fatigue assessment comments are immutable once written.'
    using errcode = 'P0001';
end;
$function$;

drop trigger if exists fatigue_assessment_comments_prevent_update on public.fatigue_assessment_comments;
create trigger fatigue_assessment_comments_prevent_update
  before update on public.fatigue_assessment_comments
  for each row execute function public.prevent_fatigue_assessment_comments_mutation();

drop trigger if exists fatigue_assessment_comments_prevent_delete on public.fatigue_assessment_comments;
create trigger fatigue_assessment_comments_prevent_delete
  before delete on public.fatigue_assessment_comments
  for each row execute function public.prevent_fatigue_assessment_comments_mutation();

insert into public.fatigue_assessment_comments (
  submission_id,
  business_id,
  site_id,
  medic_user_id,
  medic_name,
  note,
  outcome,
  created_at
)
select
  ms.id,
  ms.business_id,
  ms.site_id,
  coalesce(nullif(ms.review_payload ->> 'reviewedByUserId', ''), 'legacy-fatigue-comment'),
  coalesce(nullif(ms.review_payload ->> 'reviewedByName', ''), 'Medic'),
  btrim(ms.review_payload ->> 'medicOrEsoComments'),
  nullif(ms.review_payload ->> 'fitForWorkDecision', ''),
  coalesce(ms.reviewed_at, ms.submitted_at, now())
from public.module_submissions ms
where ms.module_key = 'fatigue_assessment'
  and nullif(btrim(coalesce(ms.review_payload ->> 'medicOrEsoComments', '')), '') is not null
  and not exists (
    select 1
    from public.fatigue_assessment_comments fac
    where fac.submission_id = ms.id
  );

create or replace function public.add_fatigue_assessment_comment(
  p_submission_id uuid,
  p_note text,
  p_outcome text default null
)
returns public.fatigue_assessment_comments
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_submission record;
  v_comment public.fatigue_assessment_comments;
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

  select id, business_id, site_id, module_key, status, exported_at, phi_purged_at
    into v_submission
    from public.module_submissions
   where id = p_submission_id;

  if v_submission.id is null or v_submission.module_key <> 'fatigue_assessment' then
    raise exception 'Fatigue assessment not found.' using errcode = 'P0001';
  end if;

  if v_submission.business_id <> v_actor.business_id
     or not coalesce(v_submission.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if v_submission.phi_purged_at is not null then
    raise exception 'Comments are locked after PHI is removed.' using errcode = 'P0001';
  end if;

  if v_submission.status = 'resolved' or v_submission.exported_at is not null then
    raise exception 'Comments are locked once the fatigue review has been finalised or exported.' using errcode = 'P0001';
  end if;

  insert into public.fatigue_assessment_comments (
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
    'fatigue_comment_added',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_submission.business_id,
    'fatigue_assessment',
    'rpc/add_fatigue_assessment_comment',
    v_submission.id::text,
    null,
    jsonb_build_object('comment_id', v_comment.id)
  );

  return v_comment;
end;
$function$;

create or replace function public.add_fatigue_assessment_comment_authorized(
  p_actor_user_id uuid,
  p_submission_id uuid,
  p_note text,
  p_outcome text default null
)
returns public.fatigue_assessment_comments
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_submission record;
  v_comment public.fatigue_assessment_comments;
begin
  select id, role, display_name, business_id, site_ids, is_inactive, contract_end_date
    into v_actor
    from public.user_accounts
   where id = p_actor_user_id;

  if v_actor.id is null
     or v_actor.role <> 'medic'
     or coalesce(v_actor.is_inactive, false)
     or (v_actor.contract_end_date is not null and v_actor.contract_end_date < now()) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  select id, business_id, site_id, module_key, status, exported_at, phi_purged_at
    into v_submission
    from public.module_submissions
   where id = p_submission_id;

  if v_submission.id is null or v_submission.module_key <> 'fatigue_assessment' then
    raise exception 'Fatigue assessment not found.' using errcode = 'P0001';
  end if;

  if v_submission.business_id <> v_actor.business_id
     or not coalesce(v_submission.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if v_submission.phi_purged_at is not null then
    raise exception 'Comments are locked after PHI is removed.' using errcode = 'P0001';
  end if;

  if v_submission.status = 'resolved' or v_submission.exported_at is not null then
    raise exception 'Comments are locked once the fatigue review has been finalised or exported.' using errcode = 'P0001';
  end if;

  insert into public.fatigue_assessment_comments (
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
    'fatigue_comment_added',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_submission.business_id,
    'fatigue_assessment',
    'rpc/add_fatigue_assessment_comment_authorized',
    v_submission.id::text,
    null,
    jsonb_build_object('comment_id', v_comment.id)
  );

  return v_comment;
end;
$function$;

revoke all on table public.fatigue_assessment_comments from public;
grant select, insert on table public.fatigue_assessment_comments to authenticated;

revoke all on function public.add_fatigue_assessment_comment(uuid, text, text) from public;
grant execute on function public.add_fatigue_assessment_comment(uuid, text, text) to authenticated;

revoke all on function public.add_fatigue_assessment_comment_authorized(uuid, uuid, text, text) from public;
grant execute on function public.add_fatigue_assessment_comment_authorized(uuid, uuid, text, text) to service_role;

commit;
