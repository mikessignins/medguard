-- ============================================================
-- Migration 029 — Normalize submission comments into rows
-- ============================================================
-- Purpose:
--   1. Remove the read-modify-write race on submissions.comments JSON arrays.
--   2. Make medic comments append-only and audit-friendly.
--   3. Backfill existing comments from submissions.comments into a dedicated table.
-- ============================================================

begin;

create table if not exists public.submission_comments (
  id text primary key default gen_random_uuid()::text,
  submission_id text not null references public.submissions(id) on delete cascade,
  business_id text not null references public.businesses(id) on delete cascade,
  site_id text not null references public.sites(id) on delete cascade,
  medic_user_id text not null,
  medic_name text not null,
  note text not null,
  outcome text null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  legacy_comment_id text null unique,
  constraint submission_comments_note_not_blank check (btrim(note) <> ''),
  constraint submission_comments_medic_name_not_blank check (btrim(medic_name) <> '')
);

create index if not exists submission_comments_submission_created_idx
  on public.submission_comments (submission_id, created_at, id);

create index if not exists submission_comments_scope_idx
  on public.submission_comments (business_id, site_id, created_at);

alter table public.submission_comments enable row level security;

drop policy if exists submission_comments_select on public.submission_comments;
drop policy if exists submission_comments_insert on public.submission_comments;

create policy submission_comments_select
on public.submission_comments
for select
to authenticated
using (
  get_my_role() = 'medic'
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
);

create policy submission_comments_insert
on public.submission_comments
for insert
to authenticated
with check (
  get_my_role() = 'medic'
  and business_id = get_my_business_id()
  and site_id = any(get_my_site_ids())
  and medic_user_id = (select auth.uid())::text
);

insert into public.submission_comments (
  id,
  submission_id,
  business_id,
  site_id,
  medic_user_id,
  medic_name,
  note,
  outcome,
  created_at,
  edited_at,
  legacy_comment_id
)
select
  coalesce(nullif(comment_item->>'id', ''), gen_random_uuid()::text) as id,
  s.id as submission_id,
  s.business_id,
  s.site_id,
  coalesce(nullif(comment_item->>'medic_user_id', ''), 'unknown'),
  coalesce(nullif(comment_item->>'medic_name', ''), 'Unknown Medic'),
  btrim(coalesce(comment_item->>'note', '')),
  nullif(comment_item->>'outcome', ''),
  coalesce((comment_item->>'created_at')::timestamptz, s.submitted_at, now()),
  case
    when nullif(comment_item->>'edited_at', '') is not null then (comment_item->>'edited_at')::timestamptz
    else null
  end,
  nullif(comment_item->>'id', '')
from public.submissions s
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(s.comments) = 'array' then s.comments
    else '[]'::jsonb
  end
) as comment_item
where btrim(coalesce(comment_item->>'note', '')) <> ''
on conflict (legacy_comment_id) do nothing;

create or replace function public.prevent_submission_comment_modification()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  raise exception 'Submission comments are append-only and cannot be modified or deleted.'
    using errcode = 'P0001';
end;
$function$;

drop trigger if exists submission_comments_prevent_update on public.submission_comments;
create trigger submission_comments_prevent_update
  before update on public.submission_comments
  for each row execute function public.prevent_submission_comment_modification();

drop trigger if exists submission_comments_prevent_delete on public.submission_comments;
create trigger submission_comments_prevent_delete
  before delete on public.submission_comments
  for each row execute function public.prevent_submission_comment_modification();

commit;
