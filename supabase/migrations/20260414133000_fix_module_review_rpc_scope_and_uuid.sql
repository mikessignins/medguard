begin;

-- Fix module review RPC authorization and UUID/text lookup issues.
--
-- The older 6-argument function still used `site_id <> ANY(site_ids)`, which
-- incorrectly rejects medics assigned to multiple sites.
-- The newer 3-argument function compared a uuid column to a text parameter
-- without casting, which caused `operator does not exist: uuid = text`.

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

  if v_submission.business_id is distinct from v_actor.business_id
     or not coalesce(v_submission.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
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

create or replace function public.review_module_submission(
  p_submission_id text,
  p_status text,
  p_review_payload jsonb default '{}'::jsonb
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
  if p_status not in ('in_review', 'reviewed') then
    raise exception 'Invalid module review status.' using errcode = 'P0001';
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

  select id, business_id, site_id, module_key, status, review_payload, reviewed_by
    into v_submission
    from public.module_submissions
   where id::text = p_submission_id
   for update;

  if v_submission.id is null then
    raise exception 'Module submission not found.' using errcode = 'P0001';
  end if;

  if v_submission.business_id is distinct from v_actor.business_id
     or not coalesce(v_submission.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  update public.module_submissions
     set status = p_status,
         review_payload = coalesce(p_review_payload, '{}'::jsonb),
         reviewed_at = now(),
         reviewed_by = v_actor.id
   where id = v_submission.id;

  perform public.write_security_audit_event(
    'database',
    'module_review_saved',
    'success',
    v_actor.id::text,
    v_actor.role,
    v_actor.display_name,
    v_submission.business_id,
    v_submission.module_key,
    'rpc/review_module_submission',
    v_submission.id::text,
    null,
    jsonb_build_object('status', p_status, 'previous_status', v_submission.status)
  );

  return jsonb_build_object('ok', true);
end;
$function$;

commit;
