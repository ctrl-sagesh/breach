'use client';

// Achievement UI: the toast that pops when something unlocks (with a chime), and the achievements screen.
// Hidden achievements stay as question marks until they are earned.

import { useEffect } from 'react';
import { play } from '../lib/audio';
import { ACHIEVEMENTS, type AchievementDef } from '../lib/achievements';
import Icon from './Icon';
import { Header, Screen } from './ui';

export function AchievementToast({ items, onDismiss }: { items: AchievementDef[]; onDismiss: () => void }) {
  useEffect(() => {
    if (items.length === 0) return;
    play('achievement');
    const t = window.setTimeout(onDismiss, 3800);
    return () => window.clearTimeout(t);
  }, [items, onDismiss]);

  if (items.length === 0) return null;
  return (
    <div className="fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map((a) => (
        <button key={a.id} type="button" onClick={onDismiss} className="panel flex w-full max-w-sm items-center gap-3 p-3 text-left text-sm">
          <Icon name={a.icon} size={22} />
          <span>
            <span className="block text-xs tracking-[0.25em] text-[var(--dim)]">ACHIEVEMENT UNLOCKED</span>
            <span className="glow font-semibold">{a.title}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

interface AchievementsScreenProps {
  unlocked: string[];
  onBack: () => void;
}

export default function AchievementsScreen({ unlocked, onBack }: AchievementsScreenProps) {
  const have = new Set(unlocked);
  const earned = ACHIEVEMENTS.filter((a) => have.has(a.id)).length;
  return (
    <Screen>
      <Header title="ACHIEVEMENTS" subtitle={`${earned} of ${ACHIEVEMENTS.length} unlocked. Stored on this device only.`} icon="check" />
      <ul className="mb-8 space-y-2">
        {ACHIEVEMENTS.map((a) => {
          const got = have.has(a.id);
          const hidden = a.hidden && !got;
          return (
            <li key={a.id} className={`panel flex items-start gap-3 p-3 text-sm ${got ? '' : 'opacity-60'}`}>
              <Icon name={got ? a.icon : 'lock'} size={22} />
              <div className="flex-1">
                <p className={got ? 'glow font-semibold' : 'font-semibold'}>{hidden ? '??? hidden achievement' : a.title}</p>
                <p className="text-xs text-[var(--dim)]">{hidden ? 'Keep looking. It will show up when you find it.' : a.description}</p>
              </div>
              <span className="text-[10px] tracking-widest text-[var(--dim)]">{got ? 'UNLOCKED' : 'LOCKED'}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto">
        <button type="button" className="btn flex w-full items-center justify-center gap-2" onClick={onBack}>
          <Icon name="back" size={16} />
          Back
        </button>
      </div>
    </Screen>
  );
}
