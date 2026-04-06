begin;

create table if not exists public.app_event_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  source text not null,
  action text not null,
  result text not null,
  actor_user_id text null,
  actor_role text null,
  actor_name text null,
  business_id text null,
  module_key text null,
  route text null,
  target_id text null,
  error_message text null,
  context jsonb not null default '{}'::jsonb
);

create index if not exists app_event_log_created_at_idx
  on public.app_event_log (created_at desc);

create index if not exists app_event_log_business_created_at_idx
  on public.app_event_log (business_id, created_at desc);

create index if not exists app_event_log_action_created_at_idx
  on public.app_event_log (action, created_at desc);

alter table public.app_event_log enable row level security;

drop policy if exists "app_event_log_no_direct_reads" on public.app_event_log;
create policy "app_event_log_no_direct_reads"
  on public.app_event_log
  for select
  to authenticated
  using (false);

drop function if exists public.log_client_app_event(text, text, text, text, jsonb, text);

create function public.log_client_app_event(
  p_source text,
  p_action text,
  p_result text,
  p_module_key text default null,
  p_context jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id text := auth.uid()::text;
  v_actor_role text;
  v_actor_name text;
  v_business_id text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select ua.role, ua.display_name, ua.business_id
    into v_actor_role, v_actor_name, v_business_id
  from public.user_accounts ua
  where ua.id = v_user_id;

  insert into public.app_event_log (
    source,
    action,
    result,
    actor_user_id,
    actor_role,
    actor_name,
    business_id,
    module_key,
    error_message,
    context
  ) values (
    coalesce(nullif(trim(p_source), ''), 'ios_app'),
    trim(p_action),
    trim(p_result),
    v_user_id,
    v_actor_role,
    v_actor_name,
    v_business_id,
    nullif(trim(coalesce(p_module_key, '')), ''),
    nullif(trim(coalesce(p_error_message, '')), ''),
    coalesce(p_context, '{}'::jsonb)
  );
end;
$function$;

revoke all on table public.app_event_log from public;
revoke all on function public.log_client_app_event(text, text, text, text, jsonb, text) from public;
grant execute on function public.log_client_app_event(text, text, text, text, jsonb, text) to authenticated;

commit;
