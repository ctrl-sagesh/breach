-- BREACH leaderboard schema.
-- Browsers can only READ. Writes happen in the submit-run Edge Function, which uses the server-side secret key
-- and so bypasses row-level security. There are no insert, update or delete policies for anon or authenticated users.

create table if not exists public.players (
  id uuid primary key,
  nickname text not null unique
    check (char_length(nickname) between 3 and 16 and nickname ~ '^[A-Za-z0-9_-]+$'),
  created_at timestamptz not null default now()
);

-- One row per player, mission, tier and slot. The slot is 'campaign' for campaign jobs, or 'daily:YYYY-MM-DD'.
-- Campaign rows keep the player's best score. Daily rows are one attempt per day per tier.
create table if not exists public.runs (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  mission_id text not null,
  tier text not null check (tier in ('easy', 'medium', 'hard')),
  slot text not null check (slot = 'campaign' or slot like 'daily:%'),
  score integer not null check (score between 100 and 1000),
  points integer not null check (points >= 0),
  seconds integer not null check (seconds >= 0),
  trace integer not null check (trace between 0 and 100),
  hints integer not null check (hints >= 0),
  created_at timestamptz not null default now(),
  unique (player_id, mission_id, tier, slot)
);

create index if not exists runs_board_idx on public.runs (mission_id, tier, slot, score desc);

-- Rate limiting for the Edge Function. Service role only.
create table if not exists public.rate_limits (
  player_id uuid primary key references public.players(id) on delete cascade,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

-- Campaign totals per player and tier: the sum of points over every campaign job they have finished.
create or replace view public.campaign_totals
with (security_invoker = true) as
select
  r.player_id,
  p.nickname,
  r.tier,
  count(*)::int as missions,
  sum(r.points)::int as points,
  round(avg(r.score))::int as avg_score
from public.runs r
join public.players p on p.id = r.player_id
where r.slot = 'campaign'
group by r.player_id, p.nickname, r.tier;

-- Your place on a campaign board. Called as an RPC from the browser; read only.
create or replace function public.player_rank(p_player uuid, p_tier text)
returns integer
language sql
stable
security invoker
as $$
  select 1 + count(*)::int
  from public.campaign_totals t
  where t.tier = p_tier
    and t.points > coalesce((select points from public.campaign_totals where player_id = p_player and tier = p_tier), 0);
$$;

-- Row-level security: the public may read, nobody but the service role may write.
alter table public.players enable row level security;
alter table public.runs enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists "players are readable" on public.players;
create policy "players are readable" on public.players for select to anon, authenticated using (true);

drop policy if exists "runs are readable" on public.runs;
create policy "runs are readable" on public.runs for select to anon, authenticated using (true);

-- rate_limits has RLS on and no policies: no one but the service role can see it.

grant select on public.players, public.runs, public.campaign_totals to anon, authenticated;
grant execute on function public.player_rank(uuid, text) to anon, authenticated;
