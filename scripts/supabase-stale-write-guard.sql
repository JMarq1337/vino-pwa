-- Vinology stale-client write guard
-- Run this once in Supabase SQL editor.
-- Purpose: block writes from old cached app versions so stale local state cannot overwrite newer data.

create table if not exists public.app_guard_config (
  id integer primary key default 1,
  min_app_version text not null default '7.57.0',
  enforce boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_guard_config (id, min_app_version, enforce)
values (1, '7.57.0', true)
on conflict (id) do update
set min_app_version = excluded.min_app_version,
    enforce = excluded.enforce,
    updated_at = now();

create or replace function public.parse_semver(v text)
returns int[]
language plpgsql
immutable
as $$
declare
  parts text[];
  outv int[] := array[0,0,0];
  i int;
begin
  parts := regexp_split_to_array(coalesce(v,''), '[^0-9]+');
  if parts is null then
    return outv;
  end if;
  for i in 1..least(coalesce(array_length(parts,1),0),3) loop
    begin
      outv[i] := coalesce(nullif(parts[i], '')::int, 0);
    exception when others then
      outv[i] := 0;
    end;
  end loop;
  return outv;
end;
$$;

create or replace function public.semver_gte(a text, b text)
returns boolean
language plpgsql
immutable
as $$
declare
  av int[] := public.parse_semver(a);
  bv int[] := public.parse_semver(b);
begin
  if av[1] <> bv[1] then return av[1] > bv[1]; end if;
  if av[2] <> bv[2] then return av[2] > bv[2]; end if;
  return av[3] >= bv[3];
end;
$$;

create or replace function public.enforce_min_app_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
  hdr jsonb;
  client_version text;
begin
  -- allow trusted backend roles
  if current_user in ('postgres','service_role','supabase_admin') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select min_app_version, enforce
  into cfg
  from public.app_guard_config
  where id = 1;

  if not coalesce(cfg.enforce, false) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  begin
    hdr := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    hdr := '{}'::jsonb;
  end;

  client_version := coalesce(
    hdr->>'x-app-version',
    hdr->>'X-App-Version',
    ''
  );

  if client_version = '' then
    raise exception 'Write blocked: missing app version. Refresh to continue.'
      using errcode = '42501';
  end if;

  if not public.semver_gte(client_version, coalesce(cfg.min_app_version, '0.0.0')) then
    raise exception 'Write blocked: app version % is older than required %.',
      client_version, cfg.min_app_version
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Attach guards only to tables that already exist in this project.
do $$
begin
  if to_regclass('public.wines') is not null then
    execute 'drop trigger if exists trg_guard_wines on public.wines';
    execute 'create trigger trg_guard_wines before insert or update or delete on public.wines for each row execute function public.enforce_min_app_version()';
  end if;

  if to_regclass('public.profile') is not null then
    execute 'drop trigger if exists trg_guard_profile on public.profile';
    execute 'create trigger trg_guard_profile before insert or update or delete on public.profile for each row execute function public.enforce_min_app_version()';
  end if;

  if to_regclass('public.tasting_notes') is not null then
    execute 'drop trigger if exists trg_guard_tasting_notes on public.tasting_notes';
    execute 'create trigger trg_guard_tasting_notes before insert or update or delete on public.tasting_notes for each row execute function public.enforce_min_app_version()';
  end if;

  if to_regclass('public.audits') is not null then
    execute 'drop trigger if exists trg_guard_audits on public.audits';
    execute 'create trigger trg_guard_audits before insert or update or delete on public.audits for each row execute function public.enforce_min_app_version()';
  end if;

  if to_regclass('public.grape_aliases') is not null then
    execute 'drop trigger if exists trg_guard_grape_aliases on public.grape_aliases';
    execute 'create trigger trg_guard_grape_aliases before insert or update or delete on public.grape_aliases for each row execute function public.enforce_min_app_version()';
  end if;

  if to_regclass('public.cellar_events') is not null then
    execute 'drop trigger if exists trg_guard_cellar_events on public.cellar_events';
    execute 'create trigger trg_guard_cellar_events before insert or update or delete on public.cellar_events for each row execute function public.enforce_min_app_version()';
  end if;

  if to_regclass('public.cellar_snapshots') is not null then
    execute 'drop trigger if exists trg_guard_cellar_snapshots on public.cellar_snapshots';
    execute 'create trigger trg_guard_cellar_snapshots before insert or update or delete on public.cellar_snapshots for each row execute function public.enforce_min_app_version()';
  end if;
end
$$;

-- Optional: verify current config
select id, min_app_version, enforce, updated_at from public.app_guard_config where id = 1;
