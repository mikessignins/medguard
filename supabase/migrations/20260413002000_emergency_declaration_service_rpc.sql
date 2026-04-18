begin;

create or replace function public.add_submission_comment_authorized(
  p_actor_user_id uuid,
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
   where id = p_actor_user_id;

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
    'rpc/add_submission_comment_authorized',
    v_submission.id,
    null,
    jsonb_build_object('comment_id', v_comment.id)
  );

  return v_comment;
end;
$function$;

create or replace function public.review_emergency_submission_authorized(
  p_actor_user_id uuid,
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
   where id = p_actor_user_id;

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
    'rpc/review_emergency_submission_authorized',
    v_submission.id,
    null,
    jsonb_build_object('status', p_status, 'previous_status', v_submission.status)
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.add_submission_comment_authorized(uuid, text, text, text) from public;
revoke all on function public.review_emergency_submission_authorized(uuid, text, text, text, integer) from public;

grant execute on function public.add_submission_comment_authorized(uuid, text, text, text) to service_role;
grant execute on function public.review_emergency_submission_authorized(uuid, text, text, text, integer) to service_role;

commit;
