'use client';

import { DIFFICULTY, TIERS } from '../engine/difficulty';
import type { MissionDef, Tier } from '../engine/types';
import { Header, Screen, Story } from './ui';

interface BriefingProps {
  mission: MissionDef;
  tier: Tier;
  attempts: number;
  completed: boolean;
  onTier: (tier: Tier) => void;
  onAccept: () => void;
  onBack: () => void;
}

export default function Briefing({ mission, tier, attempts, completed, onTier, onAccept, onBack }: BriefingProps) {
  const config = DIFFICULTY[tier];
  return (
    <Screen>
      <Header title={`JOB ${String(mission.number).padStart(2, '0')}`} subtitle={`${mission.codename} :: ${mission.title}`} icon="terminal" />

      <div className="panel mb-6 p-4 text-sm">
        <p>
          <span className="text-[var(--dim)]">CLIENT </span>
          <span className="glow">{mission.client}</span>
        </p>
        <p>
          <span className="text-[var(--dim)]">STATUS </span>
          {completed ? 'Cleared on this difficulty. Run it again for more points.' : 'Open'}
        </p>
        {attempts > 0 ? (
          <p>
            <span className="text-[var(--dim)]">ATTEMPTS </span>
            {attempts}
          </p>
        ) : null}
      </div>

      <div className="mb-6" role="radiogroup" aria-label="difficulty for this job">
        <p className="mb-2 text-xs tracking-widest text-[var(--dim)]">DIFFICULTY</p>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tier === t} className="btn !min-h-[40px] text-xs sm:text-sm" onClick={() => onTier(t)}>
              {tier === t ? '● ' : '○ '}
              {DIFFICULTY[t].label} x{DIFFICULTY[t].pointMultiplier}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">{config.description}</p>
      </div>

      {config.briefingTip ? (
        <div className="mb-6 border-l-2 border-[var(--warn)] pl-3 text-sm">
          <p className="text-[var(--warn)]">TIP</p>
          <p>{mission.hints[0]}</p>
        </div>
      ) : null}

      <div className="mb-8">
        <Story lines={mission.briefing} />
      </div>

      <div className="mt-auto flex flex-col gap-3 sm:flex-row">
        <button type="button" className="btn flex-1" onClick={onAccept}>
          Accept job
        </button>
        <button type="button" className="btn flex-1" onClick={onBack}>
          Back
        </button>
      </div>
    </Screen>
  );
}
