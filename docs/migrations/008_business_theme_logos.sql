begin;

alter table public.businesses
  add column if not exists logo_url_light text,
  add column if not exists logo_url_dark text;

update public.businesses
set
  logo_url_light = coalesce(logo_url_light, logo_url),
  logo_url_dark = coalesce(logo_url_dark, logo_url)
where logo_url is not null;

commit;
