-- go_live_security_matrix_checks.sql
-- Run this in Supabase SQL editor (read-only checks).
-- Purpose: final role-path confidence before launch.

-- 1) Quick RLS coverage: all core tables should have RLS on.
select
  schemaname,
  tablename,
  rowsecurity,
  force_rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'businesses',
    'sites',
    'user_accounts',
    'submissions',
    'medication_declarations',
    'business_modules',
    'purge_audit_log',
    'module_submissions'
  )
order by tablename;

-- 2) Policy inventory for core tables.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'user_accounts',
    'sites',
    'submissions',
    'medication_declarations',
    'business_modules',
    'module_submissions'
  )
order by tablename, cmd, policyname;

-- 3) Billing source-of-truth sanity checks.
--    For any business/month, billable_forms must be >= 0 and integer.
select
  business_id,
  bill_month,
  billable_forms
from public.business_monthly_billables
where billable_forms < 0
order by bill_month desc, business_id;

-- 4) Current month billables by business (invoice-ready number).
select *
from public.business_current_month_billables
order by business_name;

-- 5) Purge health snapshot.
select *
from public.purge_pipeline_health;

-- 6) Manual role matrix prompts (run in app with test users):
-- Worker:
-- - Can read own submissions only.
-- - Cannot read other workers' submissions.
-- Medic:
-- - Can read submissions/declarations only for assigned site_ids.
-- - Cannot read other sites in same business.
-- Admin:
-- - Can access business-scoped admin reporting/dashboard only.
-- - Cannot read PHI-only medic detail paths outside role intent.
-- Superuser:
-- - Can access cross-business billing aggregates (counts only where intended).
-- - Cannot mutate clinical decision rows unless explicitly required.
