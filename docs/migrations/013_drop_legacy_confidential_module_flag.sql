begin;

alter table public.businesses
  drop column if exists confidential_med_dec_enabled;

commit;
