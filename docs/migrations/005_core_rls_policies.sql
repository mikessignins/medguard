-- ============================================================
-- Migration 005 — Core RLS policies
-- Review carefully before applying in Supabase.
--
-- Important:
-- - This migration encodes row-level tenant boundaries for the core tables.
-- - Admins are intentionally NOT granted direct SELECT on raw declaration
--   tables, because row-level policies cannot hide PHI-bearing columns.
-- - Admin-safe submission reporting should come from server-side filtered
--   queries, views, or RPCs that only return safe fields.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS app_auth;

CREATE OR REPLACE FUNCTION app_auth.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ua.role::text
  FROM public.user_accounts ua
  WHERE ua.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app_auth.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ua.business_id
  FROM public.user_accounts ua
  WHERE ua.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app_auth.current_site_ids()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ua.site_ids, ARRAY[]::text[])
  FROM public.user_accounts ua
  WHERE ua.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION app_auth.current_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth.current_business_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth.current_site_ids() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_auth.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION app_auth.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app_auth.current_site_ids() TO authenticated;

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purge_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_accounts_select ON public.user_accounts;
CREATE POLICY user_accounts_select
ON public.user_accounts
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS user_accounts_self_update ON public.user_accounts;
CREATE POLICY user_accounts_self_update
ON public.user_accounts
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_accounts_admin_manage_medics ON public.user_accounts;
CREATE POLICY user_accounts_admin_manage_medics
ON public.user_accounts
FOR UPDATE
TO authenticated
USING (
  app_auth.current_role() = 'admin'
  AND business_id = app_auth.current_business_id()
  AND role IN ('medic', 'pending_medic')
)
WITH CHECK (
  app_auth.current_role() = 'admin'
  AND business_id = app_auth.current_business_id()
  AND role IN ('medic', 'pending_medic')
);

DROP POLICY IF EXISTS user_accounts_superuser_update ON public.user_accounts;
CREATE POLICY user_accounts_superuser_update
ON public.user_accounts
FOR UPDATE
TO authenticated
USING (app_auth.current_role() = 'superuser')
WITH CHECK (app_auth.current_role() = 'superuser');

DROP POLICY IF EXISTS sites_select ON public.sites;
CREATE POLICY sites_select
ON public.sites
FOR SELECT
TO authenticated
USING (
  business_id = app_auth.current_business_id()
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS sites_admin_insert ON public.sites;
CREATE POLICY sites_admin_insert
ON public.sites
FOR INSERT
TO authenticated
WITH CHECK (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS sites_admin_update ON public.sites;
CREATE POLICY sites_admin_update
ON public.sites
FOR UPDATE
TO authenticated
USING (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
)
WITH CHECK (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS sites_admin_delete ON public.sites;
CREATE POLICY sites_admin_delete
ON public.sites
FOR DELETE
TO authenticated
USING (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS invite_codes_select ON public.invite_codes;
CREATE POLICY invite_codes_select
ON public.invite_codes
FOR SELECT
TO authenticated
USING (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS invite_codes_admin_insert ON public.invite_codes;
CREATE POLICY invite_codes_admin_insert
ON public.invite_codes
FOR INSERT
TO authenticated
WITH CHECK (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS invite_codes_admin_update ON public.invite_codes;
CREATE POLICY invite_codes_admin_update
ON public.invite_codes
FOR UPDATE
TO authenticated
USING (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
)
WITH CHECK (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS submissions_worker_select ON public.submissions;
CREATE POLICY submissions_worker_select
ON public.submissions
FOR SELECT
TO authenticated
USING (
  worker_id = auth.uid()
);

DROP POLICY IF EXISTS submissions_worker_insert ON public.submissions;
CREATE POLICY submissions_worker_insert
ON public.submissions
FOR INSERT
TO authenticated
WITH CHECK (
  worker_id = auth.uid()
  AND business_id = app_auth.current_business_id()
);

DROP POLICY IF EXISTS submissions_worker_update ON public.submissions;
CREATE POLICY submissions_worker_update
ON public.submissions
FOR UPDATE
TO authenticated
USING (
  worker_id = auth.uid()
)
WITH CHECK (
  worker_id = auth.uid()
  AND business_id = app_auth.current_business_id()
);

DROP POLICY IF EXISTS submissions_medic_select ON public.submissions;
CREATE POLICY submissions_medic_select
ON public.submissions
FOR SELECT
TO authenticated
USING (
  app_auth.current_role() = 'medic'
  AND business_id = app_auth.current_business_id()
  AND site_id = ANY(app_auth.current_site_ids())
);

DROP POLICY IF EXISTS submissions_medic_update ON public.submissions;
CREATE POLICY submissions_medic_update
ON public.submissions
FOR UPDATE
TO authenticated
USING (
  app_auth.current_role() = 'medic'
  AND business_id = app_auth.current_business_id()
  AND site_id = ANY(app_auth.current_site_ids())
)
WITH CHECK (
  app_auth.current_role() = 'medic'
  AND business_id = app_auth.current_business_id()
  AND site_id = ANY(app_auth.current_site_ids())
);

DROP POLICY IF EXISTS submissions_superuser_select ON public.submissions;
CREATE POLICY submissions_superuser_select
ON public.submissions
FOR SELECT
TO authenticated
USING (
  app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS medication_declarations_worker_select ON public.medication_declarations;
CREATE POLICY medication_declarations_worker_select
ON public.medication_declarations
FOR SELECT
TO authenticated
USING (
  worker_id = auth.uid()
);

DROP POLICY IF EXISTS medication_declarations_worker_insert ON public.medication_declarations;
CREATE POLICY medication_declarations_worker_insert
ON public.medication_declarations
FOR INSERT
TO authenticated
WITH CHECK (
  worker_id = auth.uid()
  AND business_id = app_auth.current_business_id()
);

DROP POLICY IF EXISTS medication_declarations_worker_update ON public.medication_declarations;
CREATE POLICY medication_declarations_worker_update
ON public.medication_declarations
FOR UPDATE
TO authenticated
USING (
  worker_id = auth.uid()
)
WITH CHECK (
  worker_id = auth.uid()
  AND business_id = app_auth.current_business_id()
);

DROP POLICY IF EXISTS medication_declarations_medic_select ON public.medication_declarations;
CREATE POLICY medication_declarations_medic_select
ON public.medication_declarations
FOR SELECT
TO authenticated
USING (
  app_auth.current_role() = 'medic'
  AND business_id = app_auth.current_business_id()
  AND site_id = ANY(app_auth.current_site_ids())
);

DROP POLICY IF EXISTS medication_declarations_medic_update ON public.medication_declarations;
CREATE POLICY medication_declarations_medic_update
ON public.medication_declarations
FOR UPDATE
TO authenticated
USING (
  app_auth.current_role() = 'medic'
  AND business_id = app_auth.current_business_id()
  AND site_id = ANY(app_auth.current_site_ids())
)
WITH CHECK (
  app_auth.current_role() = 'medic'
  AND business_id = app_auth.current_business_id()
  AND site_id = ANY(app_auth.current_site_ids())
);

DROP POLICY IF EXISTS medication_declarations_superuser_select ON public.medication_declarations;
CREATE POLICY medication_declarations_superuser_select
ON public.medication_declarations
FOR SELECT
TO authenticated
USING (
  app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS purge_audit_log_admin_select ON public.purge_audit_log;
CREATE POLICY purge_audit_log_admin_select
ON public.purge_audit_log
FOR SELECT
TO authenticated
USING (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

DROP POLICY IF EXISTS admin_action_log_select ON public.admin_action_log;
CREATE POLICY admin_action_log_select
ON public.admin_action_log
FOR SELECT
TO authenticated
USING (
  (app_auth.current_role() = 'admin' AND business_id = app_auth.current_business_id())
  OR app_auth.current_role() = 'superuser'
);

COMMIT;
