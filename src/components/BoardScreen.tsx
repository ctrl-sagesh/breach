'use client';

// The global leaderboard: campaign totals, one job, or today's daily, per tier. Top 50 and your own place.
// Shows OFFLINE when the board cannot be reached. Nothing else in the game depends on it.

import { useEffect, useState } from 'react';
import { DIFFICULTY, TIERS } from '../engine/difficulty';
import type { Tier } from '../engine/types';
import { MISSIONS } from '../missions';
import { utcDate } from '../lib/daily';
import { fetchCampaignBoard, fetchMissionBoard, fetchMyRank, getPlayerId, leaderboardConfigured, type CampaignRow, type MissionRow } from '../lib/leaderboard';
import { Header, Screen } from './ui';
import Icon from './Icon';

type Scope = { kind: 'campaign' } | { kind: 'mission'; index: number } | { kind: 'daily' };
type Load =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'offline' }
  | { state: 'ready'; campaign?: CampaignRow[]; missions?: MissionRow[]; rank: number | null };

interface BoardScreenProps {
  tier: Tier;
  onTier: (tier: Tier) => void;
  onBack: () => void;
}

export default function BoardScreen({ tier, onTier, onBack }: BoardScreenProps) {
  const [scope, setScope] = useState<Scope>({ kind: 'campaign' });
  const [load, setLoad] = useState<Load>({ state: 'idle' });

  useEffect(() => {
    if (!leaderboardConfigured()) {
      setLoad({ state: 'offline' });
      return;
    }
    let cancelled = false;
    setLoad({ state: 'loading' });
    const run = async () => {
      try {
        const playerId = getPlayerId();
        if (scope.kind === 'campaign') {
          const [rows, rank] = await Promise.all([fetchCampaignBoard(tier), fetchMyRank(playerId, tier).catch(() => null)]);
          if (!cancelled) setLoad({ state: 'ready', campaign: rows, rank });
        } else {
          const id = scope.kind === 'daily' ? `daily-${utcDate()}` : MISSIONS[scope.index].id;
          const slot = scope.kind === 'daily' ? `daily:${utcDate()}` : 'campaign';
          const rows = await fetchMissionBoard(id, tier, slot);
          if (!cancelled) setLoad({ state: 'ready', missions: rows, rank: null });
        }
      } catch {
        if (!cancelled) setLoad({ state: 'offline' });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [scope, tier]);

  const tabs: { label: string; scope: Scope }[] = [
    { label: 'Campaign', scope: { kind: 'campaign' } },
    { label: "Today's daily", scope: { kind: 'daily' } },
  ];

  return (
    <Screen>
      <Header title="GLOBAL BOARD" subtitle="Scores are checked by replaying your run. Top 50 shown." icon="radar" />

      <div className="mb-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="difficulty">
        {TIERS.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tier === t} className="btn flex items-center justify-center gap-2 !min-h-[40px] text-xs sm:text-sm" onClick={() => onTier(t)}>
            <Icon name="tier" level={(TIERS.indexOf(t) + 1) as 1 | 2 | 3} size={14} />
            {DIFFICULTY[t].label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="board">
        {tabs.map((t) => (
          <button key={t.label} type="button" role="tab" aria-selected={scope.kind === t.scope.kind} className="btn text-xs" onClick={() => setScope(t.scope)}>
            {t.label}
          </button>
        ))}
        <label className="flex items-center gap-2 text-xs">
          <span className="text-[var(--dim)]">Job</span>
          <select
            className="panel px-2 py-2 text-xs"
            value={scope.kind === 'mission' ? scope.index : ''}
            onChange={(e) => setScope({ kind: 'mission', index: Number(e.target.value) })}
          >
            <option value="" disabled>
              pick a job
            </option>
            {MISSIONS.map((m, i) => (
              <option key={m.id} value={i}>
                {String(m.number).padStart(2, '0')} {m.codename}
              </option>
            ))}
          </select>
        </label>
      </div>

      {load.state === 'offline' ? (
        <section className="panel p-4 text-sm" aria-label="offline">
          <p className="mb-1 font-semibold tracking-widest">OFFLINE</p>
          <p>The global board cannot be reached right now. Your own scores are still saved on this device, and the game works the same.</p>
        </section>
      ) : null}
      {load.state === 'loading' ? <p className="text-sm text-[var(--dim)]">Loading the board...</p> : null}

      {load.state === 'ready' && load.campaign ? (
        <section className="mb-6">
          {load.rank !== null ? <p className="mb-3 text-sm">Your place on the {DIFFICULTY[tier].label} board: <span className="glow">#{load.rank}</span></p> : null}
          {load.campaign.length === 0 ? <p className="text-sm text-[var(--dim)]">Nobody has posted yet. Be the first.</p> : null}
          <ol className="space-y-1 text-sm">
            {load.campaign.map((r, i) => (
              <li key={`${r.nickname}-${i}`} className="panel flex justify-between gap-3 px-3 py-2">
                <span>
                  {String(i + 1).padStart(2, '0')}  {r.nickname}
                </span>
                <span className="tabular-nums">
                  {r.points} pts · {r.missions}/{MISSIONS.length}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {load.state === 'ready' && load.missions ? (
        <section className="mb-6">
          {load.missions.length === 0 ? <p className="text-sm text-[var(--dim)]">No scores yet on this board.</p> : null}
          <ol className="space-y-1 text-sm">
            {load.missions.map((r, i) => (
              <li key={`${r.nickname}-${i}`} className="panel flex justify-between gap-3 px-3 py-2">
                <span>
                  {String(i + 1).padStart(2, '0')}  {r.nickname}
                </span>
                <span className="tabular-nums">
                  {r.score} · {r.seconds}s · trace {r.trace}%
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="mt-auto">
        <button type="button" className="btn flex w-full items-center justify-center gap-2" onClick={onBack}>
          <Icon name="back" size={16} />
          Back
        </button>
      </div>
    </Screen>
  );
}
