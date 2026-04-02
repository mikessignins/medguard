begin;

drop view if exists public.platform_metrics;

alter table public.businesses
  drop column if exists confidential_med_dec_enabled;

commit;
