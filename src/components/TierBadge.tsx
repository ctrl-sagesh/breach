'use client';

import type { Tier } from '../engine/types';
import { DIFFICULTY } from '../engine/difficulty';

/** Small tag showing a difficulty, filled in when the job is cleared on that tier. */
export default function TierBadge({ tier, cleared }: { tier: Tier; cleared: boolean }) {
  const label = DIFFICULTY[tier].label;
  return (
    <span
      title={`${label}: ${cleared ? 'cleared' : 'not cleared'}`}
      className={`inline-block border px-1 py-px text-[10px] uppercase tracking-wider ${
        cleared ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]' : 'border-[var(--edge)] text-[var(--dim)]'
      }`}
    >
      {label[0]}
    </span>
  );
}
