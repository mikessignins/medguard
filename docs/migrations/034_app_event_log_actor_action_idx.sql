begin;

create index if not exists app_event_log_actor_action_created_at_idx
  on public.app_event_log (actor_user_id, action, created_at desc);

commit;
