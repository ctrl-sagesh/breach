'use client';

// The first screen people see. A live terminal with a typed tagline, a big START button for people who do not type,
// the difficulty tiers, a daily challenge slot, and Continue when a save exists. Behind it runs the world backdrop.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DIFFICULTY, TIERS } from '../engine/difficulty';
import type { Line, Tier } from '../engine/types';
import { landingReply, TAGLINE } from '../lib/landing';
import Decrypt from './Decrypt';
import Icon from './Icon';
import WorldBackdrop from './WorldBackdrop';

interface LandingProps {
  tier: Tier;
  hasSave: boolean;
  onStart: () => void;
  onContinue: () => void;
  /** Fires once, on the first click or key. Browsers only allow audio after a gesture. */
  onFirstGesture: () => void;
}

const INTRO: Line[] = [
  { text: 'guest@breach:~$ cat tagline.txt', kind: 'echo' },
];

const LOG_LIMIT = 10;

export default function Landing({ tier, hasSave, onStart, onContinue, onFirstGesture }: LandingProps) {
  const [typed, setTyped] = useState(0);
  const [log, setLog] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Typed tagline. Reduced motion shows it all at once.
  useEffect(() => {
    if (document.documentElement.classList.contains('reduce-motion')) {
      setTyped(TAGLINE.length);
      return;
    }
    const timer = window.setInterval(() => {
      setTyped((n) => {
        if (n >= TAGLINE.length) {
          window.clearInterval(timer);
          return n;
        }
        return n + 1;
      });
    }, 28);
    return () => window.clearInterval(timer);
  }, []);

  // The first gesture anywhere unlocks audio.
  useEffect(() => {
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      onFirstGesture();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
    return () => {
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
  }, [onFirstGesture]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = input;
    setInput('');
    if (!raw.trim()) return;
    const reply = landingReply(raw);
    if (reply.action === 'clear') {
      setLog([]);
      return;
    }
    const echo: Line = { text: `guest@breach:~$ ${raw.trim()}`, kind: 'echo' };
    setLog((prev) => [...prev, echo, ...reply.lines].slice(-LOG_LIMIT));
    if (reply.action === 'start') onStart();
  };

  const visibleTagline = TAGLINE.slice(0, typed);
  const tagDone = typed >= TAGLINE.length;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <WorldBackdrop />
      <div className="landing-vignette pointer-events-none fixed inset-0" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-2xl">
        <h1 className="glow mb-1 text-center text-3xl font-bold tracking-[0.35em] sm:text-4xl">
          <Decrypt text="BREACH" />
        </h1>
        <p className="mb-6 text-center text-xs tracking-[0.3em] text-[var(--dim)]">FREELANCE INTRUSION TERMINAL</p>

        <section className="panel mb-6 p-4 text-sm" aria-label="live terminal">
          {INTRO.map((l, i) => (
            <p key={i} className="text-[var(--fg)] opacity-70">
              {l.text}
            </p>
          ))}
          <p className="my-2 min-h-[3.2rem] leading-relaxed text-[var(--fg)]">
            {visibleTagline}
            {!tagDone ? <span className="caret">▮</span> : null}
          </p>

          <div className="term-scroll max-h-40 space-y-0.5 overflow-y-auto text-[13px] leading-snug">
            {log.map((l, i) => (
              <p key={i} className={l.kind === 'err' ? 'text-[var(--alert)]' : l.kind === 'warn' ? 'text-[var(--warn)]' : l.kind === 'ok' ? 'glow' : l.kind === 'dir' ? 'kali-dir' : l.kind === 'echo' ? 'opacity-70' : ''}>
                {l.text}
              </p>
            ))}
          </div>

          <form onSubmit={submit} className="mt-2 flex items-baseline gap-2">
            <span className="shrink-0 whitespace-pre glow">
              <span className="kali-user">guest@breach</span>
              <span>:</span>
              <span className="kali-path">~</span>
              <span>$ </span>
            </span>
            <input
              ref={inputRef}
              className="term-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="landing terminal input"
              placeholder="type start to begin"
            />
          </form>
        </section>

        <div className="mb-6 flex flex-col items-center gap-3">
          <button type="button" className="btn btn-start" onClick={onStart}>
            <Icon name="play" size={18} />
            Start hacking
          </button>
          {hasSave ? (
            <button type="button" className="btn flex items-center justify-center gap-2 text-sm" onClick={onContinue}>
              <Icon name="back" size={16} className="rotate-180" />
              Continue jobs
            </button>
          ) : null}
        </div>

        <section className="mb-6" aria-label="difficulty tiers">
          <p className="mb-2 text-center text-xs tracking-[0.3em] text-[var(--dim)]">CHOOSE YOUR HEAT</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIERS.map((t, i) => (
              <div key={t} className={`panel flex items-start gap-3 p-3 text-xs ${t === tier ? 'border-[var(--fg)]' : ''}`}>
                <Icon name="tier" level={(i + 1) as 1 | 2 | 3} size={24} />
                <div>
                  <p className="glow font-semibold tracking-widest">{DIFFICULTY[t].label.toUpperCase()} x{DIFFICULTY[t].pointMultiplier}</p>
                  <p className="mt-1 leading-snug text-[var(--dim)]">{DIFFICULTY[t].description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel flex items-center gap-3 p-3 text-xs" aria-label="daily challenge">
          <Icon name="calendar" size={24} />
          <div className="flex-1">
            <p className="tracking-widest text-[var(--dim)]">DAILY CHALLENGE</p>
            <p>A fresh breach every day. Coming soon.</p>
          </div>
          <span className="border border-[var(--edge)] px-2 py-1 text-[10px] tracking-widest text-[var(--dim)]">SOON</span>
        </section>
      </div>
    </main>
  );
}
