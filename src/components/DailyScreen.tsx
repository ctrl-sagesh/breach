'use client';

// The daily challenge: today's job, the countdown to the next UTC reset, your streak, and one attempt per tier per day.

import { useEffect, useState } from 'react';
import { DIFFICULTY, TIERS } from '../engine/difficulty';
import type { Tier } from '../engine/types';
import { dailyMission, dailyNumber, msUntilReset, streakFor, utcDate } from '../lib/daily';
import type { SaveData } from '../lib/save';
import { Header, Screen } from './ui';
import Icon from './Icon';

interface DailyScreenProps {
  save: SaveData;
  tier: Tier;
  onTier: (tier: Tier) => void;
  onStart: () => void;
  onBoard: () => void;
  onBack: () => void;
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export default function DailyScreen({ save, tier, onTier, onStart, onBoard, onBack }: DailyScreenProps) {
  const today = utcDate();
  const job = dailyMission(today);
  const [left, setLeft] = useState(msUntilReset());

  useEffect(() => {
    const timer = window.setInterval(() => setLeft(msUntilReset()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const doneDates = Object.keys(save.dailies).filter((d) => Object.values(save.dailies[d] ?? {}).some(Boolean));
  const streak = streakFor(doneDates, today);
  const result = save.dailies[today]?.[tier];
  const attempted = (save.attempts[tier][job.id] ?? 0) > 0;
  const blocked = Boolean(result) || attempted;

  return (
    <Screen>
      <Header title={`DAILY ${dailyNumber(today)}`} subtitle={`${job.title}. Same job, everywhere, until UTC midnight.`} icon="calendar" />

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div className="panel p-3">
          <p className="text-xs tracking-widest text-[var(--dim)]">NEXT JOB IN</p>
          <p className="glow tabular-nums">{countdown(left)}</p>
        </div>
        <div className="panel p-3">
          <p className="text-xs tracking-widest text-[var(--dim)]">STREAK</p>
          <p className="glow tabular-nums">
            {streak} day{streak === 1 ? '' : 's'}
          </p>
        </div>
        <div className="panel col-span-2 p-3 sm:col-span-1">
          <p className="text-xs tracking-widest text-[var(--dim)]">TODAY ON {DIFFICULTY[tier].label.toUpperCase()}</p>
          <p>{result ? `Cleared: ${result.points} pts` : attempted ? 'Attempted. One try per day.' : 'Open'}</p>
        </div>
      </div>

      <div className="mb-6" role="radiogroup" aria-label="difficulty for the daily">
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tier === t} className="btn flex items-center justify-center gap-2 !min-h-[40px] text-xs sm:text-sm" onClick={() => onTier(t)}>
              <Icon name="tier" level={(TIERS.indexOf(t) + 1) as 1 | 2 | 3} size={14} />
              {DIFFICULTY[t].label} x{DIFFICULTY[t].pointMultiplier}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">One attempt per day on each difficulty. The job resets at midnight UTC.</p>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <button type="button" className="btn flex items-center justify-center gap-2" onClick={onStart} disabled={blocked}>
          <Icon name="play" size={16} />
          {blocked ? 'Already attempted today' : 'Start today\'s job'}
        </button>
        <button type="button" className="btn flex items-center justify-center gap-2" onClick={onBoard}>
          <Icon name="radar" size={16} />
          Today's board
        </button>
        <button type="button" className="btn flex items-center justify-center gap-2" onClick={onBack}>
          <Icon name="back" size={16} />
          Back
        </button>
      </div>
    </Screen>
  );
}
