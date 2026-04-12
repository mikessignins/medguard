-- ============================================================
-- Migration 043 — Public read access for business logos
-- ============================================================
-- Business logos are non-PHI branding assets used by public image tags
-- in the web app, PDFs, and the iOS app. Keep uploads restricted to
-- privileged server-side routes, but make logo reads public.
-- ============================================================

begin;

update storage.buckets
set public = true
where id = 'business-logos';

drop policy if exists "Public can read business logos" on storage.objects;
create policy "Public can read business logos"
on storage.objects
for select
to public
using (bucket_id = 'business-logos');

commit;
