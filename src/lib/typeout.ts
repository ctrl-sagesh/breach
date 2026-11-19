// The terminal's typing effect: output is revealed a few characters at a time. Pure and framework-free,
// so the engine of the effect (and the "finish early" behaviour that keeps keystrokes from being lost
// while it runs) is tested without rendering anything.

import type { Line } from '../engine/types';
import type { TypingSpeed } from './save';

export interface Entry {
  line: Line;
  shown: number;
}

export function toEntries(lines: Line[], speed: TypingSpeed): Entry[] {
  return lines.map((line) => ({ line, shown: speed === 'instant' ? line.text.length : 0 }));
}

/** Reveals up to `step` characters of the first unfinished line. Returns the same array when nothing changes. */
export function advance(entries: Entry[], step: number): Entry[] {
  const idx = entries.findIndex((e) => e.shown < e.line.text.length);
  if (idx < 0) return entries;
  const backlog = entries.reduce((n, e) => n + (e.line.text.length - e.shown), 0);
  const amount = backlog > 400 ? step * 8 : step;
  const next = entries.slice();
  const e = entries[idx];
  next[idx] = { ...e, shown: Math.min(e.line.text.length, e.shown + amount) };
  return next;
}

/** Jumps every line straight to fully shown. Used to finish the animation instantly, so a keystroke is never lost. */
export function completeAll(entries: Entry[]): Entry[] {
  if (entries.every((e) => e.shown >= e.line.text.length)) return entries;
  return entries.map((e) => ({ ...e, shown: e.line.text.length }));
}
