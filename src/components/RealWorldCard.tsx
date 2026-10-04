'use client';

// The debrief's classified file: the real attack the job copied, one real example, and the defence. Under thirty
// seconds to read, and skippable at any time.

import { useState } from 'react';
import type { RealWorldCard as Card } from '../lib/realworld';
import Icon from './Icon';

export default function RealWorldCard({ card }: { card: Card }) {
  const [skipped, setSkipped] = useState(false);
  if (skipped) return null;

  return (
    <section className="panel relative mb-8 p-4 text-sm" aria-label="real world file">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs tracking-[0.25em] text-[var(--warn)]">
          <Icon name="lock" size={16} />
          CLASSIFIED // REAL WORLD FILE
        </p>
        <button type="button" className="btn !min-h-[32px] !px-2 !py-1 text-xs" onClick={() => setSkipped(true)}>
          Skip
        </button>
      </div>
      <p className="mb-3 text-base font-semibold tracking-wide glow">{card.attack}</p>
      <div className="space-y-3 leading-relaxed">
        <div>
          <p className="text-xs tracking-widest text-[var(--dim)]">REAL EXAMPLE</p>
          <p>{card.example}</p>
        </div>
        <div>
          <p className="text-xs tracking-widest text-[var(--dim)]">HOW DEFENDERS STOP IT</p>
          <p>{card.defence}</p>
        </div>
      </div>
    </section>
  );
}
