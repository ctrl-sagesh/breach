'use client';

// The terminal view: typed output with a skippable typing effect, a Kali-style prompt that follows the session's mode
// (shell, password, form, choice), history, tab completion (a second tab lists the options), Ctrl+L and Ctrl+C,
// a fast-cycling password guesser while a cracker runs, and the mobile quick-key bar.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { WORDLIST } from '../engine/commands/crypto';
import { CANCEL_MARK } from '../engine/replay';
import { Out, type GameSession } from '../engine/session';
import type { Line } from '../engine/types';
import { keyVariantFor, play } from '../lib/audio';
import { skippable, type Skippable } from '../lib/deferred';
import { vibrateKey } from '../lib/haptics';
import type { TypingSpeed } from '../lib/save';
import { advance, completeAll, toEntries, type Entry } from '../lib/typeout';
import QuickKeys from './QuickKeys';

export interface TerminalProps {
  session: GameSession;
  speed: TypingSpeed;
  onUpdate: () => void;
  onQuit: () => void;
  onFlash: (kind: 'granted' | 'denied') => void;
  /**
   * Every line the player sends, in order, with Ctrl+C at a question logged as CANCEL_MARK. Feeds the replay.
   * `bs` is how many Backspace/Delete keystrokes were typed while composing that line (a suspicion signal; see
   * engine/replay.ts's suspicionFor). Reset to 0 after each call.
   */
  onCommand?: (raw: string, bs: number) => void;
}

/** Commands that run a password attack. They show the guesser for a moment before the result. */
const CRACK_COMMAND = /^\s*(john|hashcat|crack)\b/;
const GUESS_MS = 1300;

const KIND_CLASS: Record<Line['kind'], string> = {
  out: 'text-[var(--fg)]',
  echo: 'text-[var(--fg)] opacity-70',
  err: 'text-[var(--alert)]',
  ok: 'text-[var(--fg)] glow font-semibold',
  warn: 'text-[var(--warn)]',
  dim: 'text-[var(--dim)]',
  sys: 'text-[var(--fg)] glow',
  title: 'text-[var(--fg)] glow font-bold tracking-widest',
  glitch: 'text-[var(--fg)]',
  dir: 'kali-dir',
  exec: 'kali-exec',
};

function Row({ entry }: { entry: Entry }) {
  const { line, shown } = entry;
  const text = line.text.slice(0, shown);
  const typing = shown < line.text.length;
  if (line.kind === 'glitch') {
    return (
      <div className="whitespace-pre-wrap py-0.5">
        <span className="glitch glow" data-text={text}>
          {text}
        </span>
      </div>
    );
  }
  if (line.segments && !typing) {
    return (
      <div className="whitespace-pre-wrap break-words">
        {line.segments.map((piece, i) => (
          <span key={i} className={KIND_CLASS[piece.kind]}>
            {piece.text}
          </span>
        ))}
        {!line.text ? ' ' : null}
      </div>
    );
  }
  return (
    <div className={`whitespace-pre-wrap break-words ${KIND_CLASS[line.kind]}`}>
      {text || ' '}
      {typing ? <span className="caret">▮</span> : null}
    </div>
  );
}

/** The prompt, coloured the way Kali colours it: green user@host, blue path, red for root. */
function Prompt({ session }: { session: GameSession }) {
  if (session.pending) return <>{session.prompt()}</>;
  const p = session.promptParts();
  return (
    <>
      <span className={p.root ? 'kali-root' : 'kali-user'}>
        {p.user}@{p.host}
      </span>
      <span>:</span>
      <span className="kali-path">{p.path}</span>
      <span>
        {p.symbol}{' '}
      </span>
    </>
  );
}

export default function Terminal({ session, speed, onUpdate, onQuit, onFlash, onCommand }: TerminalProps) {
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(session.intro(), speed));
  const [input, setInput] = useState('');
  const [histIndex, setHistIndex] = useState<number | null>(null);
  const [guess, setGuess] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** The input that last produced an ambiguous tab. A second tab on the same input lists the options. */
  const lastTab = useRef<string | null>(null);
  /** The guesser's pending result, while a crack command runs. Skipped early so a keystroke is never lost to it. */
  const crackTimer = useRef<Skippable | null>(null);
  /** Backspace/delete keystrokes typed since the last command was sent. A soft suspicion signal; see TerminalProps. */
  const bsCount = useRef(0);

  // One timer drives the typing effect for the whole terminal. Output is revealed in order.
  useEffect(() => {
    if (speed === 'instant') return;
    const timer = window.setInterval(() => setEntries((prev) => advance(prev, speed === 'fast' ? 6 : 3)), 16);
    return () => window.clearInterval(timer);
  }, [speed]);

  // The guesser cycles through the wordlist while a cracker runs.
  const cracking = guess !== null;
  useEffect(() => {
    if (!cracking) return;
    const timer = window.setInterval(() => setGuess(WORDLIST[Math.floor(Math.random() * WORDLIST.length)]), 55);
    return () => window.clearInterval(timer);
  }, [cracking]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, guess]);

  const mode = session.inputMode();
  const finished = session.finished;

  const append = (lines: Line[], clear: boolean) => {
    setEntries((prev) => {
      if (clear) return [];
      return [...completeAll(prev), ...toEntries(lines, speed)];
    });
  };

  const emit = (out: Out) => {
    append(out.lines, out.clear);
    for (const sound of out.sounds) play(sound);
    if (out.sounds.includes('granted')) onFlash('granted');
    else if (out.sounds.includes('denied')) onFlash('denied');
    setTick((t) => t + 1);
    onUpdate();
    if (out.quit) onQuit();
  };

  /** Finishes any reply still typing out, and any running cracker, right away. Called on every keystroke, so none are lost to an animation. */
  const skipAnimations = () => {
    setEntries(completeAll);
    crackTimer.current?.skip();
  };

  const run = (raw: string) => {
    if (session.finished) return;
    skipAnimations();
    onCommand?.(raw, bsCount.current);
    bsCount.current = 0;
    setInput('');
    setHistIndex(null);
    const out = session.input(raw);
    if (mode === 'shell' && CRACK_COMMAND.test(raw)) {
      // The command echo shows at once. The guesser runs, then the result lands.
      append(out.lines.slice(0, 1), false);
      setGuess(WORDLIST[0]);
      crackTimer.current = skippable(() => {
        setGuess(null);
        const rest = new Out();
        rest.lines.push(...out.lines.slice(1));
        rest.sounds.push(...out.sounds);
        rest.quit = out.quit;
        emit(rest);
        crackTimer.current = null;
      }, GUESS_MS);
      return;
    }
    if (mode === 'shell' && raw.trim()) play(out.lines.some((l) => l.kind === 'err') ? 'error' : 'command');
    emit(out);
  };

  const tab = () => {
    const before = input;
    const result = session.complete(before);
    setInput(result.value);
    if (result.options.length > 1 && result.value === before) {
      // Nothing more to complete. The first tab does nothing, the second lists the options, like bash.
      if (lastTab.current === before) {
        append([{ text: result.options.join('  '), kind: 'dim' }], false);
        lastTab.current = null;
      } else {
        lastTab.current = before;
      }
    } else {
      lastTab.current = null;
    }
  };

  const recall = (direction: 'up' | 'down') => {
    if (mode !== 'shell') return;
    const hist = session.history;
    if (hist.length === 0) return;
    let next: number | null;
    if (direction === 'up') {
      next = histIndex === null ? hist.length - 1 : Math.max(0, histIndex - 1);
    } else {
      next = histIndex === null ? null : histIndex + 1 >= hist.length ? null : histIndex + 1;
    }
    setHistIndex(next);
    setInput(next === null ? '' : hist[next]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    skipAnimations();
    if (e.key === 'Backspace' || e.key === 'Delete') bsCount.current++;
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === 'l') {
      e.preventDefault();
      setEntries([]);
      return;
    }
    if (e.ctrlKey && key === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      if (mode === 'shell') {
        append([{ text: `${session.prompt()}${input}^C`, kind: 'echo' }], false);
        setInput('');
        setHistIndex(null);
      } else {
        const o = new Out();
        if (session.cancelPending(o)) {
          onCommand?.(CANCEL_MARK, bsCount.current);
          bsCount.current = 0;
          append(o.lines, false);
        }
      }
      return;
    }
    if (e.key === 'Escape') {
      setEntries(completeAll);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      recall(e.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (mode === 'shell') tab();
      return;
    }
    if (!e.ctrlKey && !e.metaKey) {
      const variant = keyVariantFor(e.key);
      if (variant) {
        play(variant);
        vibrateKey();
      }
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(input);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onClick={() => inputRef.current?.focus()}>
      <div ref={scrollRef} className="term-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 leading-relaxed">
        {entries.map((entry, i) => (
          <Row key={i} entry={entry} />
        ))}
        {cracking ? (
          <p className="whitespace-pre text-[var(--warn)]" aria-live="off">
            {`  guessing  ${guess}`}
          </p>
        ) : null}
        {!finished ? (
          <form onSubmit={onSubmit} className="flex items-baseline gap-2">
            <span className="shrink-0 whitespace-pre-wrap glow">
              <Prompt session={session} />
            </span>
            <input
              ref={inputRef}
              className="term-input"
              value={input}
              onChange={(e) => {
                // Not just onKeyDown: paste and IME input change the value without a plain keydown.
                skipAnimations();
                setInput(e.target.value);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => {
                const el = scrollRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
              type={mode === 'password' ? 'password' : 'text'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="terminal input"
              autoFocus
            />
          </form>
        ) : null}
      </div>
      {!finished ? (
        <QuickKeys
          mode={mode}
          onRun={(cmd) => run(cmd)}
          onInsert={(text) => {
            skipAnimations();
            setInput(text);
            inputRef.current?.focus();
          }}
          onTab={() => {
            skipAnimations();
            if (mode === 'shell') tab();
            inputRef.current?.focus();
          }}
          onHistory={(dir) => {
            skipAnimations();
            recall(dir);
            inputRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
