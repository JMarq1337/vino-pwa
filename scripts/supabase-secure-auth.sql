-- Lock Vinology tables so anon/browser access cannot read or write cellar data directly.
-- Server-side access will use SUPABASE_SERVICE_ROLE_KEY through Vercel API routes.
-- Safe to run even if optional safety tables have not been created yet.

do $$
begin
  if to_regclass('public.wines') is not null then
    execute 'alter table public.wines enable row level security';
    execute 'drop policy if exists "public_all" on public.wines';
    execute 'revoke all on table public.wines from anon, authenticated';
  end if;

  if to_regclass('public.tasting_notes') is not null then
    execute 'alter table public.tasting_notes enable row level security';
    execute 'drop policy if exists "public_all" on public.tasting_notes';
    execute 'revoke all on table public.tasting_notes from anon, authenticated';
  end if;

  if to_regclass('public.profile') is not null then
    execute 'alter table public.profile enable row level security';
    execute 'drop policy if exists "public_all" on public.profile';
    execute 'revoke all on table public.profile from anon, authenticated';
  end if;

  if to_regclass('public.audits') is not null then
    execute 'alter table public.audits enable row level security';
    execute 'drop policy if exists "public_all_audits" on public.audits';
    execute 'revoke all on table public.audits from anon, authenticated';
  end if;

  if to_regclass('public.grape_aliases') is not null then
    execute 'alter table public.grape_aliases enable row level security';
    execute 'drop policy if exists "public_all_grape_aliases" on public.grape_aliases';
    execute 'revoke all on table public.grape_aliases from anon, authenticated';
  end if;

  if to_regclass('public.cellar_events') is not null then
    execute 'alter table public.cellar_events enable row level security';
    execute 'drop policy if exists "public_all_cellar_events" on public.cellar_events';
    execute 'revoke all on table public.cellar_events from anon, authenticated';
  end if;

  if to_regclass('public.cellar_snapshots') is not null then
    execute 'alter table public.cellar_snapshots enable row level security';
    execute 'drop policy if exists "public_all_cellar_snapshots" on public.cellar_snapshots';
    execute 'revoke all on table public.cellar_snapshots from anon, authenticated';
  end if;
end
$$;
