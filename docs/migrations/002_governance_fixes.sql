-- ============================================================
-- Migration 002 — Governance & audit trail improvements
-- Run via: supabase db push --linked
-- (from /private/tmp/meddec-migration with supabase CLI)
-- ============================================================
-- Addresses:
--   P0: Export race condition (exported_at set before PDF confirmed)
--   P0: Richer purge audit log (approved → exported → purged chain)
--   P0: Purge audit log immutability (append-only via triggers)
--   P0: Business suspension enforced server-side on INSERT
--   P1: Site name snapshot on form submission (survives site deletion)
--   P1: Submission status transitions enforced at DB level
--   P1: Optimistic locking (version column) for concurrent review
--   P1: is_test flag for billing isolation (superuser-only writes)
-- ============================================================

-- ── 1. submissions: new columns ──────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'exported_by_name'
  ) THEN
    ALTER TABLE submissions ADD COLUMN exported_by_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'site_name'
  ) THEN
    ALTER TABLE submissions ADD COLUMN site_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'version'
  ) THEN
    ALTER TABLE submissions ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE submissions ADD COLUMN is_test boolean NOT NULL DEFAULT false;
  END IF;
END $$;


-- ── 2. medication_declarations: new columns ───────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medication_declarations' AND column_name = 'exported_by_name'
  ) THEN
    ALTER TABLE medication_declarations ADD COLUMN exported_by_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medication_declarations' AND column_name = 'site_name'
  ) THEN
    ALTER TABLE medication_declarations ADD COLUMN site_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medication_declarations' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE medication_declarations ADD COLUMN is_test boolean NOT NULL DEFAULT false;
  END IF;
END $$;


-- ── 3. purge_audit_log: audit chain columns ───────────────────────────────────
-- Records the full chain: who approved → who exported → who/what purged.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purge_audit_log' AND column_name = 'exported_at'
  ) THEN
    ALTER TABLE purge_audit_log ADD COLUMN exported_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purge_audit_log' AND column_name = 'exported_by_name'
  ) THEN
    ALTER TABLE purge_audit_log ADD COLUMN exported_by_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purge_audit_log' AND column_name = 'approved_by_name'
  ) THEN
    ALTER TABLE purge_audit_log ADD COLUMN approved_by_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purge_audit_log' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE purge_audit_log ADD COLUMN approved_at timestamptz;
  END IF;
END $$;


-- ── 4. Trigger: snapshot site_name on form INSERT ────────────────────────────
-- Ensures forms always carry the site name at time of submission, even if the
-- site is later renamed or deleted. Governance requires forms are always
-- traceable to their original site context.

CREATE OR REPLACE FUNCTION set_site_name_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_id IS NOT NULL AND (NEW.site_name IS NULL OR NEW.site_name = '') THEN
    SELECT name INTO NEW.site_name FROM sites WHERE id = NEW.site_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS submissions_set_site_name ON submissions;
CREATE TRIGGER submissions_set_site_name
  BEFORE INSERT ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_site_name_on_insert();

DROP TRIGGER IF EXISTS medication_declarations_set_site_name ON medication_declarations;
CREATE TRIGGER medication_declarations_set_site_name
  BEFORE INSERT ON medication_declarations
  FOR EACH ROW EXECUTE FUNCTION set_site_name_on_insert();


-- ── 5. Trigger: block form submission to suspended businesses ─────────────────
-- Enforced at DB level so it applies to iOS app (anon key) and any future
-- client, not just the webapp.

CREATE OR REPLACE FUNCTION check_business_not_suspended()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM businesses WHERE id = NEW.business_id AND is_suspended = true
  ) THEN
    RAISE EXCEPTION 'Business account is suspended. Form submission is not permitted.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS submissions_check_suspension ON submissions;
CREATE TRIGGER submissions_check_suspension
  BEFORE INSERT ON submissions
  FOR EACH ROW EXECUTE FUNCTION check_business_not_suspended();

DROP TRIGGER IF EXISTS medication_declarations_check_suspension ON medication_declarations;
CREATE TRIGGER medication_declarations_check_suspension
  BEFORE INSERT ON medication_declarations
  FOR EACH ROW EXECUTE FUNCTION check_business_not_suspended();


-- ── 6. Trigger: one-directional submission status transitions ─────────────────
-- Approved and Recalled are terminal. Requires Follow-up may only advance to
-- Approved. This prevents a medic from un-approving or reversing a decision,
-- protecting the audit trail and governance integrity.

CREATE OR REPLACE FUNCTION check_submission_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('Approved', 'Recalled') THEN
    RAISE EXCEPTION 'Submission status cannot be changed from the terminal state ''%''.', OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'Requires Follow-up' AND NEW.status != 'Approved' THEN
    RAISE EXCEPTION 'From ''Requires Follow-up'', status can only advance to ''Approved''.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prefixed 'a_' so this fires before the version increment trigger below.
DROP TRIGGER IF EXISTS submissions_a_check_status_transition ON submissions;
CREATE TRIGGER submissions_a_check_status_transition
  BEFORE UPDATE OF status ON submissions
  FOR EACH ROW EXECUTE FUNCTION check_submission_status_transition();


-- ── 7. Trigger: increment version on review changes ───────────────────────────
-- Supports optimistic locking in the web review UI. Version only increments
-- when status or decision changes — not for comment edits.

CREATE OR REPLACE FUNCTION increment_submission_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.decision IS DISTINCT FROM NEW.decision THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS submissions_b_increment_version ON submissions;
CREATE TRIGGER submissions_b_increment_version
  BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION increment_submission_version();


-- ── 8. Trigger: purge_audit_log is append-only ───────────────────────────────
-- No row may ever be modified or deleted — including by service_role.
-- This prevents any actor from altering the governance trail.

CREATE OR REPLACE FUNCTION prevent_purge_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Purge audit log records are immutable and cannot be modified or deleted.'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS purge_audit_log_no_update ON purge_audit_log;
CREATE TRIGGER purge_audit_log_no_update
  BEFORE UPDATE ON purge_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_purge_log_modification();

DROP TRIGGER IF EXISTS purge_audit_log_no_delete ON purge_audit_log;
CREATE TRIGGER purge_audit_log_no_delete
  BEFORE DELETE ON purge_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_purge_log_modification();
