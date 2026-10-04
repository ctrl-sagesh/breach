'use client';

import { DIFFICULTY, TIERS } from '../engine/difficulty';
import { MISSIONS } from '../missions';
import type { SaveData } from '../lib/save';
import { missionUnlocked } from '../lib/progress';
import type { Tier } from '../engine/types';
import { Header, Screen } from './ui';
import TierBadge from './TierBadge';
import Icon from './Icon';

interface MissionSelectProps {
  save: SaveData;
  onTier: (tier: Tier) => void;
  onOpen: (index: number) => void;
  onBack: () => void;
}

export default function MissionSelect({ save, onTier, onOpen, onBack }: MissionSelectProps) {
  const tier = save.tier;
  return (
    <Screen>
      <Header title="JOB BOARD" subtitle="Anonymous postings. Pay on delivery." icon="map" />

      <div className="mb-6" role="radiogroup" aria-label="difficulty">
        <p className="mb-2 text-xs tracking-widest text-[var(--dim)]">DIFFICULTY</p>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tier === t}
              className="btn !min-h-[40px] text-xs sm:text-sm"
              onClick={() => onTier(t)}
            >
              <Icon name="tier" level={(TIERS.indexOf(t) + 1) as 1 | 2 | 3} size={16} />
              {tier === t ? '● ' : '○ '}
              {DIFFICULTY[t].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">{DIFFICULTY[tier].description}</p>
      </div>

      <ol className="space-y-3">
        {MISSIONS.map((m, index) => {
          const unlocked = missionUnlocked(save, tier, index);
          const result = save.completed[tier][m.id];
          const attempts = save.attempts[tier][m.id] ?? 0;
          const status = !unlocked ? 'LOCKED' : result ? `CLEARED  ${result.points} pts` : 'OPEN';
          return (
            <li key={m.id} className="boot-in" style={{ animationDelay: `${index * 120}ms` }}>
              <button
                type="button"
                className={`btn flex w-full flex-col items-start gap-1 text-left sm:flex-row sm:items-center sm:justify-between ${!unlocked ? 'locked-flicker' : ''}`}
                disabled={!unlocked}
                onClick={() => onOpen(index)}
                aria-label={`Mission ${m.number} ${m.codename}, ${status.toLowerCase()}`}
              >
                <span>
                  <span className="text-[var(--dim)]">{String(m.number).padStart(2, '0')}  </span>
                  <span className="glow font-semibold">{m.codename}</span>
                  <span className="block text-xs normal-case tracking-normal text-[var(--dim)]">
                    {unlocked ? m.title : 'Complete the previous job on this difficulty to unlock.'}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex gap-1" aria-label="cleared on difficulties">
                    {TIERS.map((t) => (
                      <TierBadge key={t} tier={t} cleared={Boolean(save.completed[t][m.id])} />
                    ))}
                  </span>
                  <span>
                    {status}
                    {attempts ? `  (${attempts} attempt${attempts === 1 ? '' : 's'})` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto pt-8">
        <button type="button" className="btn w-full" onClick={onBack}>
          Back
        </button>
      </div>
    </Screen>
  );
}
