-- ============================================================
-- Migration 046 — Module submission test-mode tagging
-- ============================================================
-- Module submissions already carry is_test, but the original trial trigger
-- only covered emergency and medication declarations. Trial businesses
-- cannot export PDFs, so module test records need the same DB-owned tagging
-- and review lock before dashboard cleanup and cron retention can work.
-- ============================================================

drop trigger if exists module_submissions_tag_test_trial on public.module_submissions;
create trigger module_submissions_tag_test_trial
  before insert on public.module_submissions
  for each row execute function public.auto_tag_test_during_trial();

create or replace function public.lock_is_test_when_reviewed()
returns trigger
language plpgsql
as $$
begin
  if new.is_test is not distinct from old.is_test then
    return new;
  end if;

  if tg_table_name = 'submissions' and old.status not in ('New') then
    raise exception 'Cannot change is_test on a submission that has already been reviewed (status: %).',
      old.status using errcode = 'P0001';
  end if;

  if tg_table_name = 'medication_declarations' and old.medic_review_status not in ('Pending') then
    raise exception 'Cannot change is_test on a medication declaration that has already been reviewed (status: %).',
      old.medic_review_status using errcode = 'P0001';
  end if;

  if tg_table_name = 'module_submissions' and old.status not in ('worker_only_complete', 'review_recommended', 'awaiting_medic_review') then
    raise exception 'Cannot change is_test on a module submission that has already been reviewed (status: %).',
      old.status using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists module_submissions_lock_is_test on public.module_submissions;
create trigger module_submissions_lock_is_test
  before update of is_test on public.module_submissions
  for each row execute function public.lock_is_test_when_reviewed();
