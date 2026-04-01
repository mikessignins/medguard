-- ============================================================
-- Migration 001 — Schema consistency fixes
-- Run in Supabase SQL Editor (service role / postgres user)
-- Review each section before executing.
-- ============================================================

-- ── 1. medication_declarations: add missing defaults ─────────────────────────
-- The iOS app inserts without these columns; the DB must supply defaults or
-- inserts fail with NOT NULL violations.

ALTER TABLE medication_declarations
  ALTER COLUMN medic_review_status SET DEFAULT 'Pending',
  ALTER COLUMN medic_comments      SET DEFAULT '',
  ALTER COLUMN review_required     SET DEFAULT false,
  ALTER COLUMN script_uploads      SET DEFAULT '[]'::jsonb;

-- Backfill any rows that have NULL in these columns from before the defaults
-- were set (safe to run even if all rows already have values):
UPDATE medication_declarations SET medic_review_status = 'Pending'  WHERE medic_review_status IS NULL;
UPDATE medication_declarations SET medic_comments      = ''          WHERE medic_comments IS NULL;
UPDATE medication_declarations SET review_required     = false       WHERE review_required IS NULL;
UPDATE medication_declarations SET script_uploads      = '[]'::jsonb WHERE script_uploads IS NULL;


-- ── 2. purge_audit_log: add form_type column if not already present ───────────
-- The webapp writes form_type; the iOS reads the table. Add if missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purge_audit_log' AND column_name = 'form_type'
  ) THEN
    ALTER TABLE purge_audit_log ADD COLUMN form_type text;
  END IF;
END $$;


-- ── 3. invite_codes: add created_at for expiry tracking ──────────────────────
-- Codes currently have no timestamp; this enables future TTL / rotation logic.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invite_codes' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE invite_codes
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

    -- Backfill existing rows with current time as a safe placeholder
    UPDATE invite_codes SET created_at = now() WHERE created_at IS NULL;
  END IF;
END $$;


-- ── 4. submissions: FK from worker_id to auth.users ──────────────────────────
-- worker_id is uuid but has no foreign key constraint; orphaned rows can exist.
-- NOTE: medication_declarations.worker_id is confirmed uuid already (no type cast needed).
-- Verify data is clean first by running in SQL Editor:
--
--   SELECT worker_id FROM submissions
--   WHERE worker_id IS NOT NULL
--   AND worker_id NOT IN (SELECT id FROM auth.users);
--
--   SELECT worker_id FROM medication_declarations
--   WHERE worker_id IS NOT NULL
--   AND worker_id NOT IN (SELECT id FROM auth.users);
--
-- If both return 0 rows, uncomment and run:

-- ALTER TABLE submissions
--   ADD CONSTRAINT submissions_worker_id_fkey
--   FOREIGN KEY (worker_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ALTER TABLE medication_declarations
--   ADD CONSTRAINT med_dec_worker_id_fkey
--   FOREIGN KEY (worker_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ── 5. user_index: normalise user_id to uuid ─────────────────────────────────
-- Verify data is clean first:
--
--   SELECT user_id FROM user_index
--   WHERE user_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
-- If 0 rows returned, uncomment and run:

-- ALTER TABLE user_index
--   ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
