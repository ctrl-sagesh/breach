'use client';

// Achievement UI: the toast that pops when something unlocks (with a chime), and the achievements screen.
// Hidden achievements stay as question marks until they are earned.

import { useEffect, useState } from 'react';
import { play } from '../lib/audio';
import { ACHIEVEMENTS, type AchievementDef } from '../lib/achievements';
import Icon from './Icon';
import { Header, Screen } from './ui';

const TOAST_MS = 3200;

/**
 * Queues unlocked achievements one at a time, in a corner so they never sit over the score panel.
 * Stays empty until `active` (the debrief holds it off until its own stat count-up is done), then
 * shows the queue one card at a time and calls `onDone` once it has worked through all of them.
 */
export function AchievementToast({ items, active, onDone }: { items: AchievementDef[]; active: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  const current = active && index < items.length ? items[index] : null;

  useEffect(() => {
    if (!current) return;
    play('achievement');
    const t = window.setTimeout(() => setIndex((i) => i + 1), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [current]);

  useEffect(() => {
    if (active && items.length > 0 && index >= items.length) onDone();
  }, [active, items.length, index, onDone]);

  if (!current) return null;
  return (
    <div className="fixed bottom-3 right-3 z-[70] max-w-[min(90vw,20rem)]" role="status" aria-live="polite">
      <button type="button" onClick={() => setIndex((i) => i + 1)} className="panel flex w-full items-center gap-3 p-3 text-left text-sm">
        <Icon name={current.icon} size={22} />
        <span>
          <span className="block text-xs tracking-[0.25em] text-[var(--dim)]">ACHIEVEMENT UNLOCKED</span>
          <span className="glow font-semibold">{current.title}</span>
        </span>
      </button>
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
