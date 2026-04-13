drop function if exists public.worker_join_business_with_invite(text);

create function public.worker_join_business_with_invite(p_invite_code text)
returns table (
  id text,
  worker_id text,
  business_id text,
  business_name text,
  role text,
  site_ids jsonb,
  joined_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_worker_id uuid := auth.uid();
  v_business_id text;
  v_membership record;
  v_account record;
begin
  if v_worker_id is null then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;

  select ua.role, ua.display_name, ua.business_id
    into v_account
    from public.user_accounts ua
   where ua.id = v_worker_id;

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

  update public.worker_memberships as wm
     set is_active = false
   where wm.worker_id = v_worker_id;

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
    '[]'::jsonb,
    true
  )
  on conflict (worker_id, business_id) do update
     set is_active = true,
         role = 'worker'
  returning * into v_membership;

  update public.user_accounts as ua
     set business_id = v_business_id
   where ua.id = v_worker_id;

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
      coalesce(wm.site_ids, '[]'::jsonb),
      wm.joined_at,
      wm.is_active
    from public.worker_memberships wm
    join public.businesses b on b.id = wm.business_id
   where wm.id = v_membership.id;
end;
$function$;

drop function if exists public.worker_set_active_membership(text);

create function public.worker_set_active_membership(p_membership_id text)
returns table (
  id text,
  worker_id text,
  business_id text,
  business_name text,
  role text,
  site_ids jsonb,
  joined_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_worker_id uuid := auth.uid();
  v_membership record;
  v_account record;
begin
  if v_worker_id is null then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;

  select ua.role, ua.display_name, ua.business_id
    into v_account
    from public.user_accounts ua
   where ua.id = v_worker_id;

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

  update public.worker_memberships as wm
     set is_active = false
   where wm.worker_id = v_worker_id;

  update public.worker_memberships as wm
     set is_active = true
   where wm.id = v_membership.id;

  update public.user_accounts as ua
     set business_id = v_membership.business_id
   where ua.id = v_worker_id;

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
      coalesce(wm.site_ids, '[]'::jsonb),
      wm.joined_at,
      wm.is_active
    from public.worker_memberships wm
    join public.businesses b on b.id = wm.business_id
   where wm.id = v_membership.id;
end;
$function$;
