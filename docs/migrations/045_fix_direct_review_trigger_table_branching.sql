-- Migration 045 — Fix table-specific branching in direct review guard
--
-- The shared trigger function referenced columns from other tables inside
-- compound conditions. PostgreSQL can still try to resolve those fields against
-- the current trigger record, so module_submissions updates could fail while
-- evaluating submissions-only fields such as OLD.decision.

create or replace function public.prevent_direct_clinical_review_update()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if coalesce(current_setting('medguard.authorized_clinical_write', true), '') = 'on' then
    return new;
  end if;

  if tg_table_name = 'submissions' then
    if old.status is distinct from new.status
       or old.decision is distinct from new.decision then
      raise exception 'Clinical review state must be changed through an approved review RPC.'
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  if tg_table_name = 'medication_declarations' then
    if old.medic_review_status is distinct from new.medic_review_status
       or old.medic_comments is distinct from new.medic_comments
       or old.review_required is distinct from new.review_required
       or old.medic_name is distinct from new.medic_name
       or old.medic_reviewed_at is distinct from new.medic_reviewed_at then
      raise exception 'Medication review state must be changed through an approved review RPC.'
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  if tg_table_name = 'module_submissions' then
    if old.status is distinct from new.status
       or old.review_payload is distinct from new.review_payload
       or old.reviewed_at is distinct from new.reviewed_at
       or old.reviewed_by is distinct from new.reviewed_by then
      raise exception 'Module review state must be changed through an approved review RPC.'
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  return new;
end;
$function$;
