begin;

-- Recreate upsert_surveillance_worker_roster with new anchor_date and
-- roster_cycle_json params. Existing params are preserved for backward compat.

create or replace function public.upsert_surveillance_worker_roster(
  p_surveillance_worker_id uuid,
  p_roster_pattern         text,
  p_shift_type             text  default null,
  p_current_swing_start    date  default null,
  p_current_swing_end      date  default null,
  p_source_system          text  default null,
  p_source_ref             text  default null,
  p_anchor_date            date  default null,
  p_roster_cycle_json      jsonb default null
)
returns public.surveillance_worker_rosters
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker public.surveillance_workers%rowtype;
  v_roster public.surveillance_worker_rosters%rowtype;
begin
  select * into v_worker
    from public.surveillance_workers sw
   where sw.id = p_surveillance_worker_id
   for update;

  if v_worker.id is null then
    raise exception 'Worker not found.';
  end if;

  if not public.can_manage_surveillance_business(v_worker.business_id) then
    raise exception 'Forbidden';
  end if;

  select * into v_roster
    from public.surveillance_worker_rosters swr
   where swr.surveillance_worker_id = p_surveillance_worker_id
   order by swr.updated_at desc
   limit 1;

  if v_roster.id is null then
    insert into public.surveillance_worker_rosters (
      business_id,
      surveillance_worker_id,
      roster_pattern,
      shift_type,
      current_swing_start,
      current_swing_end,
      source_system,
      source_ref,
      anchor_date,
      roster_cycle_json,
      created_by,
      updated_by
    )
    values (
      v_worker.business_id,
      p_surveillance_worker_id,
      nullif(btrim(coalesce(p_roster_pattern, '')), ''),
      nullif(btrim(coalesce(p_shift_type, '')), ''),
      p_current_swing_start,
      p_current_swing_end,
      nullif(btrim(coalesce(p_source_system, '')), ''),
      nullif(btrim(coalesce(p_source_ref, '')), ''),
      p_anchor_date,
      p_roster_cycle_json,
      auth.uid(),
      auth.uid()
    )
    returning * into v_roster;
  else
    update public.surveillance_worker_rosters
       set roster_pattern       = nullif(btrim(coalesce(p_roster_pattern, '')), ''),
           shift_type           = nullif(btrim(coalesce(p_shift_type, '')), ''),
           current_swing_start  = p_current_swing_start,
           current_swing_end    = p_current_swing_end,
           source_system        = nullif(btrim(coalesce(p_source_system, '')), ''),
           source_ref           = nullif(btrim(coalesce(p_source_ref, '')), ''),
           anchor_date          = p_anchor_date,
           roster_cycle_json    = p_roster_cycle_json,
           updated_by           = auth.uid()
     where id = v_roster.id
     returning * into v_roster;
  end if;

  return v_roster;
end;
$function$;

-- Revoke old signature and grant updated one
revoke all on function public.upsert_surveillance_worker_roster(uuid, text, text, date, date, text, text) from public;
grant execute on function public.upsert_surveillance_worker_roster(uuid, text, text, date, date, text, text, date, jsonb) to authenticated;

commit;
