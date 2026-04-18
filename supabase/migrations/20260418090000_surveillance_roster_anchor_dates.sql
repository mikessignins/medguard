begin;

-- Add anchor date and cycle JSON to allow the platform to project swing
-- schedules indefinitely from a single entry point.
--
-- anchor_date       : first day of cycle 1 (first day of first on-site period)
-- roster_cycle_json : array of {days: int, period: "on"|"off"} segments
--
-- Simple pattern example (2 weeks on / 2 weeks off):
--   [{"days": 14, "period": "on"}, {"days": 14, "period": "off"}]
--
-- Rolling pattern example (5d on / 2d off / 4d on / 3d off):
--   [{"days": 5, "period": "on"}, {"days": 2, "period": "off"},
--    {"days": 4, "period": "on"}, {"days": 3, "period": "off"}]

alter table public.surveillance_worker_rosters
  add column if not exists anchor_date       date  null,
  add column if not exists roster_cycle_json jsonb null
    check (
      roster_cycle_json is null
      or (
        jsonb_typeof(roster_cycle_json) = 'array'
        and jsonb_array_length(roster_cycle_json) > 0
      )
    );

comment on column public.surveillance_worker_rosters.anchor_date is
  'First day of cycle 1 — the first day of the first on-site period. All future swing windows are projected forward from this date indefinitely until amended or worker is demobbed.';

comment on column public.surveillance_worker_rosters.roster_cycle_json is
  'JSON array of {days,period} segments defining one complete roster cycle. Works for both simple on/off patterns and multi-segment rolling rosters.';

-- Refresh the index to include the new anchor column for scheduling queries
drop index if exists surveillance_worker_rosters_worker_idx;
create index if not exists surveillance_worker_rosters_worker_idx
  on public.surveillance_worker_rosters (surveillance_worker_id, anchor_date, updated_at desc);

commit;
