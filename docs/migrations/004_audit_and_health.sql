-- ============================================================
-- Migration 004 — Admin action audit log + cron health tracking
-- ============================================================

-- ── 1. admin_action_log ───────────────────────────────────────────────────────
-- Records key admin actions for compliance and dispute resolution.
-- Superusers can view; append-only (immutable like purge_audit_log).

CREATE TABLE IF NOT EXISTS admin_action_log (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  business_id   uuid        NOT NULL,
  actor_user_id uuid        NOT NULL,
  actor_name    text        NOT NULL,
  action        text        NOT NULL, -- e.g. 'medic_approved', 'medic_revoked', 'site_assignment_changed', 'invite_code_regenerated'
  target_user_id uuid,                -- medic being acted on (if applicable)
  target_name   text,                 -- name snapshot
  detail        jsonb                 -- additional context (old/new values, site names, etc.)
);

CREATE INDEX IF NOT EXISTS admin_action_log_business_idx ON admin_action_log (business_id, occurred_at DESC);

-- Immutable — same pattern as purge_audit_log
CREATE OR REPLACE FUNCTION prevent_admin_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Admin action log records are immutable and cannot be modified or deleted.'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_action_log_no_update ON admin_action_log;
CREATE TRIGGER admin_action_log_no_update
  BEFORE UPDATE ON admin_action_log
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_log_modification();

DROP TRIGGER IF EXISTS admin_action_log_no_delete ON admin_action_log;
CREATE TRIGGER admin_action_log_no_delete
  BEFORE DELETE ON admin_action_log
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_log_modification();


-- ── 2. cron_health_log ────────────────────────────────────────────────────────
-- Each cron job UPSERTs a row keyed by cron_name after a successful run.
-- The admin dashboard checks last_run_at to detect silent failures.

CREATE TABLE IF NOT EXISTS cron_health_log (
  cron_name     text        NOT NULL PRIMARY KEY,
  last_run_at   timestamptz NOT NULL DEFAULT now(),
  last_result   jsonb                -- summary payload from the cron run
);
