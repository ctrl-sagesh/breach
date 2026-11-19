// The typing-reveal effect used by the terminal. completeAll is what lets the terminal finish an
// in-progress reply instantly the moment the player starts typing, so no keystroke is lost waiting on it.

import { describe, expect, it } from 'vitest';
import { advance, completeAll, toEntries, type Entry } from '../src/lib/typeout';
import type { Line } from '../src/engine/types';

const line = (text: string): Line => ({ text, kind: 'out' });

describe('toEntries', () => {
  it('starts at zero shown characters, except on instant speed', () => {
    const [a, b] = toEntries([line('hello'), line('world')], 'normal');
    expect(a.shown).toBe(0);
    expect(b.shown).toBe(0);
  });

  it('instant speed reveals everything right away', () => {
    const [a] = toEntries([line('hello')], 'instant');
    expect(a.shown).toBe(5);
  });
});

describe('advance', () => {
  it('reveals the first unfinished line, a few characters at a time', () => {
    const entries = toEntries([line('hello')], 'normal');
    const next = advance(entries, 2);
    expect(next[0].shown).toBe(2);
  });

  it('never overshoots the line length', () => {
    const entries: Entry[] = [{ line: line('hi'), shown: 1 }];
    expect(advance(entries, 10)[0].shown).toBe(2);
  });

  it('returns the same array once everything is fully shown, so re-rendering is skipped', () => {
    const entries = toEntries([line('hi')], 'instant');
    expect(advance(entries, 5)).toBe(entries);
  });
});

describe('completeAll', () => {
  it('jumps every line to fully shown in one step, mid-animation', () => {
    const entries: Entry[] = [
      { line: line('hello'), shown: 1 },
      { line: line('world'), shown: 0 },
    ];
    const done = completeAll(entries);
    expect(done[0].shown).toBe(5);
    expect(done[1].shown).toBe(5);
  });

  it('is a no-op (same array) once nothing is left typing, so calling it on every keystroke is cheap', () => {
    const entries = toEntries([line('hi')], 'instant');
    expect(completeAll(entries)).toBe(entries);
  });
});
