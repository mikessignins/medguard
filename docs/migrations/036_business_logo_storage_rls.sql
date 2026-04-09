-- ============================================================
-- Migration 036 — Business logo storage RLS
-- ============================================================
-- Purpose:
--   1. Allow authenticated superusers to manage objects in the
--      `business-logos` storage bucket without relying on service-role.
--   2. Reduce service-role usage in the business logo upload route.
-- ============================================================

begin;

drop policy if exists "Superusers can insert business logos" on storage.objects;
create policy "Superusers can insert business logos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-logos'
  and public.get_my_role() = 'superuser'
);

drop policy if exists "Superusers can update business logos" on storage.objects;
create policy "Superusers can update business logos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-logos'
  and public.get_my_role() = 'superuser'
)
with check (
  bucket_id = 'business-logos'
  and public.get_my_role() = 'superuser'
);

drop policy if exists "Superusers can delete business logos" on storage.objects;
create policy "Superusers can delete business logos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-logos'
  and public.get_my_role() = 'superuser'
);

commit;
