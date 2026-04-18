begin;

create or replace function public.review_medication_declaration(
  p_declaration_id text,
  p_medic_review_status text,
  p_medic_comments text default null,
  p_review_required boolean default false,
  p_expected_status text default null,
  p_medical_officer_name text default null,
  p_medical_officer_practice text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_declaration record;
  v_requires_mro boolean := coalesce(p_review_required, false);
  v_officer_name text := nullif(btrim(coalesce(p_medical_officer_name, '')), '');
  v_officer_practice text := nullif(btrim(coalesce(p_medical_officer_practice, '')), '');
  v_current_final boolean;
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

  select id, business_id, site_id, medic_review_status, exported_at, phi_purged_at,
         coalesce(medical_officer_review_required, review_required) as medical_officer_review_required
    into v_declaration
    from public.medication_declarations
   where id = p_declaration_id
   for update;

  if v_declaration.id is null then
    raise exception 'Medication declaration not found.' using errcode = 'P0001';
  end if;

  if v_declaration.business_id is distinct from v_actor.business_id
     or not coalesce(v_declaration.site_id = any(coalesce(v_actor.site_ids, array[]::text[])), false) then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if v_declaration.phi_purged_at is not null then
    raise exception 'Medication declaration clinical data has already been removed.' using errcode = 'P0001';
  end if;

  if v_declaration.exported_at is not null then
    raise exception 'Medication declaration review details are locked after export.' using errcode = 'P0001';
  end if;

  if p_expected_status is not null and v_declaration.medic_review_status is distinct from p_expected_status then
    raise exception 'This medication declaration was updated by another user.' using errcode = 'P0001';
  end if;

  v_current_final := v_declaration.medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work');

  if v_current_final and v_declaration.medic_review_status is distinct from p_medic_review_status then
    raise exception 'Medication outcome is already finalised and cannot be changed. You can still correct the Medical Officer details before export.' using errcode = 'P0001';
  end if;

  if v_current_final and v_declaration.medical_officer_review_required is distinct from v_requires_mro then
    raise exception 'Medical Officer Review cannot be toggled after the final outcome is recorded.' using errcode = 'P0001';
  end if;

  if v_requires_mro
     and (v_officer_name is null or v_officer_practice is null)
     and p_medic_review_status in ('Normal Duties', 'Restricted Duties', 'Unfit for Work') then
    raise exception 'Medical Officer Review details are required before a final medication outcome can be recorded.' using errcode = 'P0001';
  end if;

  perform set_config('medguard.authorized_clinical_write', 'on', true);

  update public.medication_declarations
     set medic_review_status = p_medic_review_status,
         medic_comments = coalesce(nullif(btrim(coalesce(p_medic_comments, '')), ''), ''),
         review_required = v_requires_mro,
         medical_officer_review_required = v_requires_mro,
         medical_officer_name = case when v_requires_mro then v_officer_name else null end,
         medical_officer_practice = case when v_requires_mro then v_officer_practice else null end,
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
      'previous_status', v_declaration.medic_review_status,
      'medical_officer_review_required', v_requires_mro,
      'medical_officer_name', v_officer_name,
      'medical_officer_practice', v_officer_practice
    )
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.review_medication_declaration(text, text, text, boolean, text, text, text) from public;
grant execute on function public.review_medication_declaration(text, text, text, boolean, text, text, text) to authenticated;

commit;
