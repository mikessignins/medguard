-- Allow system auto-purge audit rows to be recorded without a medic user id.

alter table public.purge_audit_log
  alter column medic_user_id drop not null;

comment on column public.purge_audit_log.medic_user_id is
  'Authenticated medic user for manual purges; null for system auto-purge events.';
