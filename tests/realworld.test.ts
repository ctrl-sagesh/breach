// Real-world cards: every campaign job and every daily template has a complete card.

import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/missions';
import { dailyMission } from '../src/lib/daily';
import { realWorldFor } from '../src/lib/realworld';

describe('real-world debrief cards', () => {
  it.each(MISSIONS.map((m) => [m.codename, m] as const))('%s has a complete card', (_name, m) => {
    const card = realWorldFor(m);
    expect(card).not.toBeNull();
    expect(card!.attack.trim()).not.toBe('');
    expect(card!.example.trim()).not.toBe('');
    expect(card!.defence.trim()).not.toBe('');
  });

  it('every daily template maps to a card', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const m = dailyMission(date);
      expect(realWorldFor(m), date).not.toBeNull();
      seen.add(m.realWorldKey!);
    }
    expect(seen.size).toBe(3);
  });

  it('a card stays short enough to read in well under 30 seconds', () => {
    for (const m of MISSIONS) {
      const card = realWorldFor(m)!;
      expect(card.example.length + card.defence.length).toBeLessThan(400);
    }
  });
});
