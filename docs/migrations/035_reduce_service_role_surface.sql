-- ============================================================
-- Migration 035 — Reduce service-role surface on audit/purge routes
-- ============================================================
-- Purpose:
--   1. Let admin audit writes use authenticated RLS instead of service-role.
--   2. Let medic purge audit writes use authenticated RLS instead of service-role.
--   3. Allow superusers to perform the explicit submission test-flag update
--      without requiring service-role access in the web app.
-- ============================================================

begin;

drop policy if exists admin_action_log_insert on public.admin_action_log;
create policy admin_action_log_insert
on public.admin_action_log
for insert
to authenticated
with check (
  app_auth.current_role() = 'admin'
  and business_id = app_auth.current_business_id()
  and actor_user_id = auth.uid()
);

drop policy if exists purge_audit_log_medic_insert on public.purge_audit_log;
create policy purge_audit_log_medic_insert
on public.purge_audit_log
for insert
to authenticated
with check (
  public.is_current_user_active_medic()
  and business_id = public.get_my_business_id()
  and medic_user_id = auth.uid()
);

drop policy if exists submissions_superuser_update on public.submissions;
create policy submissions_superuser_update
on public.submissions
for update
to authenticated
using (
  app_auth.current_role() = 'superuser'
)
with check (
  app_auth.current_role() = 'superuser'
);

commit;
