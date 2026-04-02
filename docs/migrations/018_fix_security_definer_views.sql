-- 018_fix_security_definer_views.sql
-- Resolve Supabase linter warning/error 0010 (security_definer_view)
-- by ensuring monitoring/reporting views execute as SECURITY INVOKER.

begin;

alter view if exists public.business_monthly_billables
  set (security_invoker = true);

alter view if exists public.platform_metrics
  set (security_invoker = true);

alter view if exists public.business_current_month_billables
  set (security_invoker = true);

alter view if exists public.purge_pipeline_health
  set (security_invoker = true);

commit;
