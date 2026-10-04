'use client';

// The ops log: every attempt on this device, styled like reading the history file on your rig. Per-job stats, a replay
// of any of your own attempts, and the best run on the global board once you have cleared that job on that tier.

import { useState } from 'react';
import { DIFFICULTY, TIERS } from '../engine/difficulty';
import type { RunCommand } from '../engine/replay';
import type { MissionDef, Tier } from '../engine/types';
import { MISSIONS } from '../missions';
import { dailyMission } from '../lib/daily';
import { favouriteCommand, missionStats, totalSeconds, type AttemptRecord, type Outcome } from '../lib/history';
import { fetchTopRun, leaderboardConfigured } from '../lib/leaderboard';
import type { SaveData } from '../lib/save';
import ReplayViewer from './ReplayViewer';
import { formatTime, Header, Screen } from './ui';

interface OpsLogProps {
  save: SaveData;
  tier: Tier;
  onTier: (tier: Tier) => void;
  onBack: () => void;
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  cleared: 'CLEARED',
  traced: 'TRACED',
  aborted: 'ABORTED',
  'timed-out': 'TIMED OUT',
};

const OUTCOME_CLASS: Record<Outcome, string> = {
  cleared: 'glow',
  traced: 'text-[var(--alert)]',
  aborted: 'text-[var(--dim)]',
  'timed-out': 'text-[var(--warn)]',
};

/** The mission an attempt was for. Daily attempts are rebuilt from their id, which carries the date. */
function missionOf(attempt: AttemptRecord): MissionDef | null {
  if (attempt.scope === 'daily') return dailyMission(attempt.missionId.slice('daily-'.length));
  return MISSIONS.find((m) => m.id === attempt.missionId) ?? null;
}

function labelOf(attempt: AttemptRecord): string {
  if (attempt.scope === 'daily') return `DAILY ${attempt.missionId.slice('daily-'.length)}`;
  const m = MISSIONS.find((x) => x.id === attempt.missionId);
  return m ? `${String(m.number).padStart(2, '0')} ${m.codename}` : attempt.missionId;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`;
}

export default function OpsLog({ save, tier, onTier, onBack }: OpsLogProps) {
  const [filter, setFilter] = useState<string>('all');
  const [replay, setReplay] = useState<{ title: string; mission: MissionDef; tier: Tier; commands: RunCommand[] } | null>(null);
  const [topState, setTopState] = useState<'idle' | 'loading' | 'none' | 'offline'>('idle');

  const shown = save.history.filter((a) => a.tier === tier && (filter === 'all' || a.missionId === filter));
  const fav = favouriteCommand(save.history);
  const hours = (totalSeconds(save.history) / 3600).toFixed(1);

  const watchTop = async (m: MissionDef) => {
    if (!leaderboardConfigured()) {
      setTopState('offline');
      return;
    }
    setTopState('loading');
    try {
      const top = await fetchTopRun(m.id, tier);
      if (!top) {
        setTopState('none');
        return;
      }
      setTopState('idle');
      setReplay({ title: `#1 ${top.nickname} · ${m.codename} · ${DIFFICULTY[tier].label}`, mission: m, tier, commands: top.commands });
    } catch {
      setTopState('offline');
    }
  };

  return (
    <Screen>
      <Header title="OPS LOG" subtitle={`~/.bash_history for this rig. ${save.history.length} attempts recorded. Newest first.`} icon="terminal" />

      <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="panel p-2">
          <p className="text-[var(--dim)]">TIME HACKING</p>
          <p className="glow tabular-nums">{hours} h</p>
        </div>
        <div className="panel p-2">
          <p className="text-[var(--dim)]">FAVOURITE COMMAND</p>
          <p className="glow">{fav ? `${fav.name} (${fav.count})` : 'none yet'}</p>
        </div>
        <div className="panel p-2 sm:col-span-2" role="radiogroup" aria-label="difficulty">
          <p className="mb-1 text-[var(--dim)]">DIFFICULTY</p>
          <div className="flex gap-1">
            {TIERS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tier === t} className="btn !min-h-[32px] !px-2 text-xs" onClick={() => onTier(t)}>
                {DIFFICULTY[t].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-[var(--dim)]">Job</span>
          <select className="panel px-2 py-2 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">all jobs</option>
            {MISSIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {String(m.number).padStart(2, '0')} {m.codename}
              </option>
            ))}
          </select>
        </label>
        {filter !== 'all' ? (
          <button type="button" className="btn !min-h-[36px] text-xs" onClick={() => watchTop(MISSIONS.find((m) => m.id === filter)!)} disabled={!save.completed[tier][filter]}>
            {save.completed[tier][filter] ? 'Watch the #1 run' : 'Clear this job to unlock the #1 run'}
          </button>
        ) : null}
        {topState === 'none' ? <span className="text-[var(--dim)]">Nobody has a replayable run for this job yet.</span> : null}
        {topState === 'offline' ? <span className="text-[var(--dim)]">The global board is offline right now.</span> : null}
        {topState === 'loading' ? <span className="text-[var(--dim)]">Fetching the board...</span> : null}
      </div>

      {filter !== 'all' ? <JobStats save={save} missionId={filter} tier={tier} /> : null}

      {replay ? (
        <ReplayViewer key={replay.title} title={replay.title} mission={replay.mission} tier={replay.tier} commands={replay.commands} onClose={() => setReplay(null)} />
      ) : null}

      {shown.length === 0 ? <p className="text-sm text-[var(--dim)]">No attempts on {DIFFICULTY[tier].label} yet. Nothing here is made up: every line is something you typed.</p> : null}

      <ol className="space-y-2 text-xs sm:text-sm">
        {shown.map((a) => {
          const m = missionOf(a);
          return (
            <li key={a.id} className="panel p-3 font-mono">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[var(--dim)]">{stamp(a.at)}</span>
                <span className={`${OUTCOME_CLASS[a.outcome]} font-semibold tracking-widest`}>{OUTCOME_LABEL[a.outcome]}</span>
              </div>
              <p className="mt-1">
                {labelOf(a)} <span className="text-[var(--dim)]">· attempt {a.attemptNo} · {DIFFICULTY[a.tier].label}</span>
              </p>
              <p className="tabular-nums text-[var(--dim)]">
                {a.outcome === 'cleared' ? `score ${a.score} · ${a.points} pts · ` : ''}time {formatTime(a.seconds)} · trace {a.trace}% · hints {a.hints}
              </p>
              {m && a.commands.length > 0 ? (
                <button
                  type="button"
                  className="btn mt-2 !min-h-[32px] !px-2 !py-1 text-xs"
                  onClick={() => setReplay({ title: `${labelOf(a)} · ${stamp(a.at)}`, mission: m, tier: a.tier, commands: a.commands })}
                >
                  Replay this run
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-auto pt-6">
        <button type="button" className="btn w-full" onClick={onBack}>
          Back
        </button>
      </div>
    </Screen>
  );
}

function JobStats({ save, missionId, tier }: { save: SaveData; missionId: string; tier: Tier }) {
  const s = missionStats(save.history, missionId, tier);
  return (
    <dl className="panel mb-4 grid grid-cols-2 gap-x-4 gap-y-2 p-3 text-xs sm:grid-cols-5">
      <div>
        <dt className="text-[var(--dim)]">ATTEMPTS</dt>
        <dd className="glow tabular-nums">{s.attempts}</dd>
      </div>
      <div>
        <dt className="text-[var(--dim)]">FIRST CLEAR</dt>
        <dd className="glow">{s.firstClearAttempt ? `attempt ${s.firstClearAttempt}` : 'not yet'}</dd>
      </div>
      <div>
        <dt className="text-[var(--dim)]">BEST SCORE</dt>
        <dd className="glow tabular-nums">{s.bestScore ?? '-'}</dd>
      </div>
      <div>
        <dt className="text-[var(--dim)]">BEST TIME</dt>
        <dd className="glow tabular-nums">{s.bestSeconds !== null ? formatTime(s.bestSeconds) : '-'}</dd>
      </div>
      <div>
        <dt className="text-[var(--dim)]">CLEAR RATE</dt>
        <dd className="glow tabular-nums">{Math.round(s.clearRate * 100)}%</dd>
      </div>
    </dl>
  );
}

