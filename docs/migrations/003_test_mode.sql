-- ============================================================
-- Migration 003 — Test / trial mode
-- See /private/tmp/meddec-migration/supabase/migrations/20260401140000_test_mode.sql
-- ============================================================
-- Design rationale:
--   - Only superusers can set trial_until on a business.
--   - During trial, ALL new submissions are auto-tagged is_test = true
--     via a DB trigger — the business cannot influence this.
--   - is_test locks once any medic action has occurred, preventing
--     retroactive marking to dodge billing.
--   - Export is blocked for is_test = true forms (see PDF route handlers).
--   - Billing query already excludes is_test = true (migration 002).
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'trial_until'
  ) THEN
    ALTER TABLE businesses ADD COLUMN trial_until timestamptz;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION auto_tag_test_during_trial()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM businesses
    WHERE id = NEW.business_id
      AND trial_until IS NOT NULL
      AND trial_until > NOW()
  ) THEN
    NEW.is_test = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS submissions_tag_test_trial ON submissions;
CREATE TRIGGER submissions_tag_test_trial
  BEFORE INSERT ON submissions
  FOR EACH ROW EXECUTE FUNCTION auto_tag_test_during_trial();

DROP TRIGGER IF EXISTS medication_declarations_tag_test_trial ON medication_declarations;
CREATE TRIGGER medication_declarations_tag_test_trial
  BEFORE INSERT ON medication_declarations
  FOR EACH ROW EXECUTE FUNCTION auto_tag_test_during_trial();

CREATE OR REPLACE FUNCTION lock_is_test_when_reviewed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_test IS NOT DISTINCT FROM OLD.is_test THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'submissions' AND OLD.status NOT IN ('New') THEN
    RAISE EXCEPTION 'Cannot change is_test on a submission that has already been reviewed (status: %).',
      OLD.status USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'medication_declarations' AND OLD.medic_review_status NOT IN ('Pending') THEN
    RAISE EXCEPTION 'Cannot change is_test on a medication declaration that has already been reviewed (status: %).',
      OLD.medic_review_status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS submissions_lock_is_test ON submissions;
CREATE TRIGGER submissions_lock_is_test
  BEFORE UPDATE OF is_test ON submissions
  FOR EACH ROW EXECUTE FUNCTION lock_is_test_when_reviewed();

DROP TRIGGER IF EXISTS medication_declarations_lock_is_test ON medication_declarations;
CREATE TRIGGER medication_declarations_lock_is_test
  BEFORE UPDATE OF is_test ON medication_declarations
  FOR EACH ROW EXECUTE FUNCTION lock_is_test_when_reviewed();
