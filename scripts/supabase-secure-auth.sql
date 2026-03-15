-- Lock Vinology tables so anon/browser access cannot read or write cellar data directly.
-- Server-side access will use SUPABASE_SERVICE_ROLE_KEY through Vercel API routes.

alter table if exists public.wines enable row level security;
alter table if exists public.tasting_notes enable row level security;
alter table if exists public.profile enable row level security;
alter table if exists public.audits enable row level security;
alter table if exists public.grape_aliases enable row level security;
alter table if exists public.cellar_events enable row level security;
alter table if exists public.cellar_snapshots enable row level security;

drop policy if exists "public_all" on public.wines;
drop policy if exists "public_all" on public.tasting_notes;
drop policy if exists "public_all" on public.profile;
drop policy if exists "public_all_audits" on public.audits;
drop policy if exists "public_all_grape_aliases" on public.grape_aliases;
drop policy if exists "public_all_cellar_events" on public.cellar_events;
drop policy if exists "public_all_cellar_snapshots" on public.cellar_snapshots;

revoke all on table public.wines from anon, authenticated;
revoke all on table public.tasting_notes from anon, authenticated;
revoke all on table public.profile from anon, authenticated;
revoke all on table public.audits from anon, authenticated;
revoke all on table public.grape_aliases from anon, authenticated;
revoke all on table public.cellar_events from anon, authenticated;
revoke all on table public.cellar_snapshots from anon, authenticated;
