-- Vinology data-safety patch (run once in Supabase SQL editor)

-- 1) Alias learning table (used by varietal/category auto-learning)
create table if not exists public.grape_aliases (
  alias text primary key,
  wine_type text not null,
  source text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Change event ledger (append-only, used for recovery/audit trail)
create table if not exists public.cellar_events (
  id text primary key,
  entity text not null,
  action text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 3) Optional future snapshot table (reserved)
create table if not exists public.cellar_snapshots (
  id text primary key,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Shared timestamp helper (safe to rerun)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_grape_aliases_updated_at on public.grape_aliases;
create trigger trg_grape_aliases_updated_at
before update on public.grape_aliases
for each row
execute function public.set_updated_at();

-- RLS
alter table public.grape_aliases enable row level security;
alter table public.cellar_events enable row level security;
alter table public.cellar_snapshots enable row level security;

-- Policies (anon app key compatible)
drop policy if exists "public_all_grape_aliases" on public.grape_aliases;
create policy "public_all_grape_aliases"
on public.grape_aliases
for all
to anon
using (true)
with check (true);

drop policy if exists "public_all_cellar_events" on public.cellar_events;
create policy "public_all_cellar_events"
on public.cellar_events
for all
to anon
using (true)
with check (true);

drop policy if exists "public_all_cellar_snapshots" on public.cellar_snapshots;
create policy "public_all_cellar_snapshots"
on public.cellar_snapshots
for all
to anon
using (true)
with check (true);

-- Helpful indexes
create index if not exists idx_cellar_events_created_at on public.cellar_events(created_at desc);
create index if not exists idx_cellar_events_entity on public.cellar_events(entity, entity_id);
create index if not exists idx_cellar_snapshots_created_at on public.cellar_snapshots(created_at desc);
