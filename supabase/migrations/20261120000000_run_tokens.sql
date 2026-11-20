-- Leaderboard hardening: server-issued run tokens, suspicion scoring, and a health-check table for the
-- keepalive workflow. See src/engine/replay.ts (checkToken, suspicionFor, SUSPICION_HIDE_THRESHOLD) and
-- src/lib/variation.ts (applyFlagVariation) for the code that uses these.

-- One row per attempt that asked to be posted. The server's own start time and seed live here, out of the
-- browser's reach. Single use: submit-run claims a token with a conditional update (used_at is.null).
create table if not exists public.run_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  mission_id text not null,
  tier text not null check (tier in ('easy', 'medium', 'hard')),
  scope text not null check (scope in ('campaign', 'daily')),
  -- The daily's UTC date. Null for a campaign token.
  date text,
  seed bigint not null,
  started_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '3 hours')
);

alter table public.run_tokens enable row level security;
-- Service role only: no anon/authenticated policies, same pattern as rate_limits and auth_attempts.
revoke all on public.run_tokens from anon, authenticated;

-- Suspicion scoring and review state on runs. suspicion/suspicion_reasons are written by submit-run from
-- src/engine/replay.ts's suspicionFor. reviewed lets a human clear a flagged run without touching its score.
alter table public.runs add column if not exists suspicion integer not null default 0 check (suspicion between 0 and 100);
alter table public.runs add column if not exists suspicion_reasons text[] not null default '{}';
alter table public.runs add column if not exists reviewed boolean not null default false;

-- Hide flagged runs from the public board (but keep them, and keep them visible to their own player through
-- the submit-run response) until reviewed. campaign_totals is declared security_invoker = true, so it inherits
-- this same filter automatically. service_role bypasses RLS, so submit-run still sees every row.
-- Keep "70" in sync with SUSPICION_HIDE_THRESHOLD in src/engine/replay.ts.
drop policy if exists "runs are readable" on public.runs;
create policy "runs are readable" on public.runs for select to anon, authenticated using (suspicion < 70 or reviewed);

-- For a human to review in the Supabase SQL editor: select * from public.flagged_runs;
-- To clear one back onto the board without touching its score: update public.runs set reviewed = true where id = <id>;
create or replace view public.flagged_runs
with (security_invoker = true) as
select r.id, p.nickname, r.mission_id, r.tier, r.slot, r.score, r.suspicion, r.suspicion_reasons, r.created_at
from public.runs r
join public.players p on p.id = r.player_id
where r.suspicion >= 70 and not r.reviewed
order by r.suspicion desc, r.created_at desc;

grant select on public.flagged_runs to service_role;

-- A table the keepalive workflow's health action writes to and immediately deletes from, so a passing check
-- proves the database can still write, without ever touching real leaderboard data.
create table if not exists public.health_check (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now()
);

alter table public.health_check enable row level security;
revoke all on public.health_check from anon, authenticated;
