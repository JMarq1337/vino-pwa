alter table public.profile
  add column if not exists pin_hash text default '';

alter table public.profile
  add column if not exists pin_salt text default '';

alter table public.profile
  add column if not exists pin_digits integer;

update public.profile
set
  pin_hash = coalesce(pin_hash, ''),
  pin_salt = coalesce(pin_salt, '')
where id = 1;
