begin;

create or replace function public.create_surveillance_provider_location(
  p_provider_id uuid,
  p_site_id text default null,
  p_location_name text default null,
  p_address_text text default null,
  p_supports_remote boolean default false,
  p_capacity_notes text default null
)
returns public.surveillance_provider_locations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider public.surveillance_providers%rowtype;
  v_location public.surveillance_provider_locations%rowtype;
begin
  select * into v_provider
    from public.surveillance_providers sp
   where sp.id = p_provider_id
   for update;

  if v_provider.id is null then
    raise exception 'Provider not found.';
  end if;

  if not public.can_manage_surveillance_business(v_provider.business_id) then
    raise exception 'Forbidden';
  end if;

  insert into public.surveillance_provider_locations (
    provider_id,
    business_id,
    site_id,
    location_name,
    address_text,
    supports_remote,
    capacity_notes,
    is_active,
    created_by,
    updated_by
  )
  values (
    p_provider_id,
    v_provider.business_id,
    nullif(btrim(coalesce(p_site_id, '')), ''),
    nullif(btrim(coalesce(p_location_name, '')), ''),
    nullif(btrim(coalesce(p_address_text, '')), ''),
    coalesce(p_supports_remote, false),
    nullif(btrim(coalesce(p_capacity_notes, '')), ''),
    true,
    auth.uid(),
    auth.uid()
  )
  returning * into v_location;

  return v_location;
end;
$function$;

revoke all on function public.create_surveillance_provider_location(uuid, text, text, text, boolean, text) from public;
grant execute on function public.create_surveillance_provider_location(uuid, text, text, text, boolean, text) to authenticated;

create or replace function public.update_surveillance_provider_location(
  p_location_id uuid,
  p_site_id text default null,
  p_location_name text default null,
  p_address_text text default null,
  p_supports_remote boolean default false,
  p_capacity_notes text default null
)
returns public.surveillance_provider_locations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_location public.surveillance_provider_locations%rowtype;
begin
  select * into v_location
    from public.surveillance_provider_locations spl
   where spl.id = p_location_id
   for update;

  if v_location.id is null then
    raise exception 'Provider location not found.';
  end if;

  if not public.can_manage_surveillance_business(v_location.business_id) then
    raise exception 'Forbidden';
  end if;

  update public.surveillance_provider_locations
     set site_id = nullif(btrim(coalesce(p_site_id, '')), ''),
         location_name = nullif(btrim(coalesce(p_location_name, '')), ''),
         address_text = nullif(btrim(coalesce(p_address_text, '')), ''),
         supports_remote = coalesce(p_supports_remote, false),
         capacity_notes = nullif(btrim(coalesce(p_capacity_notes, '')), ''),
         updated_by = auth.uid()
   where id = p_location_id
   returning * into v_location;

  return v_location;
end;
$function$;

revoke all on function public.update_surveillance_provider_location(uuid, text, text, text, boolean, text) from public;
grant execute on function public.update_surveillance_provider_location(uuid, text, text, text, boolean, text) to authenticated;

create or replace function public.set_surveillance_provider_location_active(
  p_location_id uuid,
  p_is_active boolean
)
returns public.surveillance_provider_locations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_location public.surveillance_provider_locations%rowtype;
begin
  select * into v_location
    from public.surveillance_provider_locations spl
   where spl.id = p_location_id
   for update;

  if v_location.id is null then
    raise exception 'Provider location not found.';
  end if;

  if not public.can_manage_surveillance_business(v_location.business_id) then
    raise exception 'Forbidden';
  end if;

  update public.surveillance_provider_locations
     set is_active = p_is_active,
         updated_by = auth.uid()
   where id = p_location_id
   returning * into v_location;

  return v_location;
end;
$function$;

revoke all on function public.set_surveillance_provider_location_active(uuid, boolean) from public;
grant execute on function public.set_surveillance_provider_location_active(uuid, boolean) to authenticated;

commit;
