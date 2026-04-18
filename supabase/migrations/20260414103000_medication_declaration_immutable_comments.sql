begin;

create table if not exists public.medication_declaration_comments (
  id uuid primary key default gen_random_uuid(),
  declaration_id text not null references public.medication_declarations(id) on delete cascade,
  business_id text not null references public.businesses(id),
  site_id text not null references public.sites(id),
  medic_user_id text not null,
  medic_name text not null,
  note text not null,
  outcome text null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  constraint medication_declaration_comments_note_not_blank check (btrim(note) <> ''),
  constraint medication_declaration_comments_medic_name_not_blank check (btrim(medic_name) <> '')
);

create index if not exists medication_declaration_comments_declaration_created_idx
  on public.medication_declaration_comments (declaration_id, created_at, id);

create index if not exists medication_declaration_comments_scope_idx
  on public.medication_declaration_comments (business_id, site_id, created_at);

alter table public.medication_declaration_comments enable row level security;

drop policy if exists medication_declaration_comments_select on public.medication_declaration_comments;
create policy medication_declaration_comments_select
on public.medication_declaration_comments
for select
to authenticated
using (
  is_current_user_active_medic()
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
);

drop policy if exists medication_declaration_comments_insert on public.medication_declaration_comments;
create policy medication_declaration_comments_insert
on public.medication_declaration_comments
for insert
to authenticated
with check (
  is_current_user_active_medic()
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
  and medic_user_id = ((select auth.uid())::text)
);

create or replace function public.prevent_medication_declaration_comments_update()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Medication declaration comments are immutable once written.'
    using errcode = 'P0001';
end;
$function$;

drop trigger if exists medication_declaration_comments_prevent_update on public.medication_declaration_comments;
create trigger medication_declaration_comments_prevent_update
  before update on public.medication_declaration_comments
  for each row execute function public.prevent_medication_declaration_comments_update();

drop trigger if exists medication_declaration_comments_prevent_delete on public.medication_declaration_comments;
create trigger medication_declaration_comments_prevent_delete
  before delete on public.medication_declaration_comments
  for each row execute function public.prevent_medication_declaration_comments_update();

insert into public.medication_declaration_comments (
  declaration_id,
  business_id,
  site_id,
  medic_user_id,
  medic_name,
  note,
  outcome,
  created_at
)
select
  md.id,
  md.business_id,
  md.site_id,
  coalesce(nullif(md.medic_name, ''), 'legacy-medic-comment'),
  coalesce(nullif(md.medic_name, ''), 'Medic'),
  btrim(md.medic_comments),
  nullif(md.medic_review_status, 'Pending'),
  coalesce(md.medic_reviewed_at, md.submitted_at, now())
from public.medication_declarations md
where nullif(btrim(coalesce(md.medic_comments, '')), '') is not null
  and not exists (
    select 1
    from public.medication_declaration_comments mdc
    where mdc.declaration_id = md.id
  );

create or replace function public.add_medication_declaration_comment(
  p_declaration_id text,
  p_note text,
  p_outcome text default null
)
returns public.medication_declaration_comments
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_declaration record;
  v_comment public.medication_declaration_comments;
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

  select id, business_id, site_id, medic_review_status, exported_at, phi_purged_at
    into v_declaration
    from public.medication_declarations
   where id = p_declaration_id;

  if v_declaration.id is null then
    raise exception 'Declaration not found.' using errcode = 'P0001';
  end if;

  if v_declaration.business_id <> v_actor.business_id
     or not coalesce(v_declaration.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if v_declaration.phi_purged_at is not null then
    raise exception 'Comments are locked after PHI is removed.' using errcode = 'P0001';
  end if;

  if v_declaration.medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work')
     or v_declaration.exported_at is not null then
    raise exception 'Comments are locked once the medication declaration has a final outcome or has been exported.' using errcode = 'P0001';
  end if;

  insert into public.medication_declaration_comments (
    declaration_id,
    business_id,
    site_id,
    medic_user_id,
    medic_name,
    note,
    outcome
  ) values (
    v_declaration.id,
    v_declaration.business_id,
    v_declaration.site_id,
    v_actor.id::text,
    coalesce(nullif(v_actor.display_name, ''), 'Medic'),
    btrim(p_note),
    nullif(btrim(coalesce(p_outcome, '')), '')
  )
  returning * into v_comment;

  perform public.write_security_audit_event(
    'database',
    'medication_comment_added',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_declaration.business_id,
    'confidential_medication',
    'rpc/add_medication_declaration_comment',
    v_declaration.id,
    null,
    jsonb_build_object('comment_id', v_comment.id)
  );

  return v_comment;
end;
$function$;

create or replace function public.add_medication_declaration_comment_authorized(
  p_actor_user_id uuid,
  p_declaration_id text,
  p_note text,
  p_outcome text default null
)
returns public.medication_declaration_comments
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_declaration record;
  v_comment public.medication_declaration_comments;
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

  select id, business_id, site_id, medic_review_status, exported_at, phi_purged_at
    into v_declaration
    from public.medication_declarations
   where id = p_declaration_id;

  if v_declaration.id is null then
    raise exception 'Declaration not found.' using errcode = 'P0001';
  end if;

  if v_declaration.business_id <> v_actor.business_id
     or not coalesce(v_declaration.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if v_declaration.phi_purged_at is not null then
    raise exception 'Comments are locked after PHI is removed.' using errcode = 'P0001';
  end if;

  if v_declaration.medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work')
     or v_declaration.exported_at is not null then
    raise exception 'Comments are locked once the medication declaration has a final outcome or has been exported.' using errcode = 'P0001';
  end if;

  insert into public.medication_declaration_comments (
    declaration_id,
    business_id,
    site_id,
    medic_user_id,
    medic_name,
    note,
    outcome
  ) values (
    v_declaration.id,
    v_declaration.business_id,
    v_declaration.site_id,
    v_actor.id::text,
    coalesce(nullif(v_actor.display_name, ''), 'Medic'),
    btrim(p_note),
    nullif(btrim(coalesce(p_outcome, '')), '')
  )
  returning * into v_comment;

  perform public.write_security_audit_event(
    'database',
    'medication_comment_added',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_declaration.business_id,
    'confidential_medication',
    'rpc/add_medication_declaration_comment_authorized',
    v_declaration.id,
    null,
    jsonb_build_object('comment_id', v_comment.id)
  );

  return v_comment;
end;
$function$;

revoke all on table public.medication_declaration_comments from public;
grant select, insert on table public.medication_declaration_comments to authenticated;

revoke all on function public.add_medication_declaration_comment(text, text, text) from public;
grant execute on function public.add_medication_declaration_comment(text, text, text) to authenticated;

revoke all on function public.add_medication_declaration_comment_authorized(uuid, text, text, text) from public;
grant execute on function public.add_medication_declaration_comment_authorized(uuid, text, text, text) to service_role;

commit;
