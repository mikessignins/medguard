-- Adds a reversible inactive state for medic accounts so admins can remove
-- medics from active operations without moving them back into pending approval.

alter table public.user_accounts
  add column if not exists is_inactive boolean not null default false;

create index if not exists user_accounts_business_role_inactive_idx
  on public.user_accounts (business_id, role, is_inactive);
