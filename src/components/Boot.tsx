'use client';

// Fast boot: about two seconds of lines, then the landing page. Any key or tap finishes it at once.

import { useEffect, useState } from 'react';
import { play } from '../lib/audio';

interface BootLine {
  text: string;
  kind?: 'warn' | 'glitch';
}

const LINES: BootLine[] = [
  { text: 'BREACH BIOS v4.2.7  (c) 2031 ghost-rig' },
  { text: 'MEMORY ........................ 640K OK' },
  { text: 'NIC eth0 ...................... LINK UP' },
  { text: 'TRACE DAEMON .................. ACTIVE' },
  { text: 'WARNING: this terminal is being observed.', kind: 'warn' },
  { text: 'B R E A C H', kind: 'glitch' },
];

const STEP_MS = 230;
const HOLD_MS = 380;

interface BootProps {
  onDone: () => void;
}

export default function Boot({ onDone }: BootProps) {
  const [count, setCount] = useState(0);
  const ready = count >= LINES.length;

  useEffect(() => {
    if (ready) {
      const done = window.setTimeout(onDone, HOLD_MS);
      return () => window.clearTimeout(done);
    }
    const next = window.setTimeout(() => setCount((c) => c + 1), STEP_MS);
    return () => window.clearTimeout(next);
  }, [count, ready, onDone]);

  useEffect(() => {
    const skip = () => setCount(LINES.length);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, []);

  useEffect(() => {
    if (ready) play('enter');
  }, [ready]);

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-10 screen-curve">
      <div className="mx-auto w-full max-w-2xl space-y-1 text-sm leading-relaxed sm:text-base">
        {LINES.slice(0, count).map((line, i) => {
          if (line.kind === 'glitch') {
            return (
              <p key={i} className="pt-6 text-center text-2xl font-bold tracking-[0.4em]">
                <span className="glitch glow" data-text={line.text}>
                  {line.text}
                </span>
              </p>
            );
          }
          const cls = line.kind === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--fg)]';
          return (
            <p key={i} className={cls}>
              {line.text}
            </p>
          );
        })}
        {!ready ? (
          <p className="text-[var(--dim)]">
            <span className="caret">▮</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
