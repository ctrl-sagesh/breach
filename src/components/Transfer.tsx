'use client';

// The moment between the last command and the stats: the payload uploads, a bar fills, and ACCESS GRANTED lands.
// Reduced motion skips straight through.

import { useEffect, useState } from 'react';
import { play } from '../lib/audio';
import Icon from './Icon';

interface TransferProps {
  reduceMotion: boolean;
  onDone: () => void;
}

const TOTAL_STEPS = 48;
const STEP_MS = 42;
const LOG = [
  'opening tunnel to drop 10.66.0.99',
  'encrypting payload with the client key',
  'packing evidence: 4 files, 1 flag',
  'streaming to QUILL',
];

export default function Transfer({ reduceMotion, onDone }: TransferProps) {
  const [step, setStep] = useState(reduceMotion ? TOTAL_STEPS : 0);
  const [granted, setGranted] = useState(reduceMotion);

  useEffect(() => {
    if (step >= TOTAL_STEPS) {
      if (!granted) {
        setGranted(true);
        play('transfer');
      }
      return;
    }
    const timer = window.setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, granted]);

  useEffect(() => {
    if (!granted) return;
    const timer = window.setTimeout(onDone, reduceMotion ? 0 : 900);
    return () => window.clearTimeout(timer);
  }, [granted, onDone, reduceMotion]);

  const pct = Math.round((step / TOTAL_STEPS) * 100);
  const logged = Math.min(LOG.length, Math.floor((step / TOTAL_STEPS) * (LOG.length + 1)));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 screen-curve">
      <div className="w-full max-w-xl">
        <p className="mb-6 flex items-center gap-3 text-sm tracking-widest text-[var(--dim)]">
          <Icon name={granted ? 'unlock' : 'lock'} size={22} />
          {granted ? 'ACCESS GRANTED' : 'DATA TRANSFER'}
        </p>

        <div className="mb-4 whitespace-pre text-sm" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="transfer progress">
          {`[${'█'.repeat(Math.round(pct / 4)).padEnd(25, '░')}] ${String(pct).padStart(3)}%`}
        </div>

        <div className="space-y-1 text-sm">
          {LOG.slice(0, logged).map((l) => (
            <p key={l} className="text-[var(--dim)]">
              &gt; {l}
            </p>
          ))}
          {granted ? <p className="glow mt-4 text-lg font-bold tracking-[0.3em]">ACCESS GRANTED</p> : null}
        </div>
      </div>
    </main>
  );
}
