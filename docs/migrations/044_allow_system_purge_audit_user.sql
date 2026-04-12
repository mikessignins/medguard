-- Migration 044 — Allow system auto-purge audit rows
--
-- Auto-purge runs without an authenticated medic account. The route records
-- medic_name = 'Auto-purge (system)' and intentionally has no medic_user_id,
-- so the audit table must allow null for system-generated purge events.

alter table public.purge_audit_log
  alter column medic_user_id drop not null;

comment on column public.purge_audit_log.medic_user_id is
  'Authenticated medic user for manual purges; null for system auto-purge events.';
