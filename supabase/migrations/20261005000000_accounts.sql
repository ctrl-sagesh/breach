-- BREACH accounts and cloud save. Still no login: a player is an anonymous id, with a recovery key to restore on another device.
--
-- Security model:
--   * The browser can read nickname and the public board tables. It cannot read key_hash, token_hash or save.
--   * Only the account Edge Function writes, using the server-side key, which bypasses row-level security.
--   * Restore attempts and sync calls are rate limited through auth_attempts, which browsers cannot see at all.

-- Recovery key (hashed with a server-side pepper), sync token (hashed), and the cloud copy of the save.
alter table public.players add column if not exists key_hash text unique;
alter table public.players add column if not exists token_hash text;
alter table public.players add column if not exists save jsonb;
alter table public.players add column if not exists save_updated_at timestamptz;

-- The replay of a run, so the global #1 run can be watched. Written only by submit-run, after the replay checks it.
alter table public.runs add column if not exists commands jsonb;

-- Rate limit buckets for restore and sync. No policies, so no browser role can see or change them.
create table if not exists public.auth_attempts (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;

-- Column-level privacy on players: the browser sees id, nickname and created_at only.
revoke select on public.players from anon, authenticated;
grant select (id, nickname, created_at) on public.players to anon, authenticated;

-- The public tables keep working: they read only the columns the browser may see.
grant select (id, nickname, created_at) on public.players to anon, authenticated;
