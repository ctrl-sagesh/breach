// Per-run flag variation: a leaderboard run's flag changes with its token's seed, deterministically, without
// mutating the shared mission singletons, and without breaking the two missions that opt out.

import { describe, expect, it } from 'vitest';
import { applyFlagVariation } from '../src/lib/variation';
import { validateRun } from '../src/engine/replay';
import { MISSIONS } from '../src/missions';
import type { Tier } from '../src/engine/types';

const M01 = MISSIONS.find((m) => m.id === 'm01-dead-drop')!;
const M03 = MISSIONS.find((m) => m.id === 'm03-lighthouse')!;
const M04 = MISSIONS.find((m) => m.id === 'm04-blue-lines')!;

describe('applyFlagVariation', () => {
  it('varies the flag deterministically: same seed, same flag; different seed, a different one', () => {
    const a = applyFlagVariation(M01, 1);
    const b = applyFlagVariation(M01, 1);
    expect(a.flag).toBe(b.flag);
    expect(a.flag).not.toBe(M01.flag);
    expect(a.flag.startsWith('BREACH{sticky_notes_are_forever_')).toBe(true);

    const seeds = [2, 3, 4, 5, 6, 7];
    const flags = new Set(seeds.map((s) => applyFlagVariation(M01, s).flag));
    // With a pool of 16 suffixes, some of these six seeds landing on different ones is overwhelmingly likely.
    expect(flags.size).toBeGreaterThan(1);
  });

  it('never mutates the mission it varies', () => {
    const before = JSON.stringify(M01);
    applyFlagVariation(M01, 42);
    expect(JSON.stringify(M01)).toBe(before);
  });

  it('leaves m03-lighthouse and m04-blue-lines untouched: their flags are not plainly swappable', () => {
    // m03's flag is only ever stored rot13-transformed; m04's is built by the player from a log fragment.
    expect(applyFlagVariation(M03, 5)).toBe(M03);
    expect(applyFlagVariation(M04, 5)).toBe(M04);
  });

  it('a varied mission is still fully beatable, with the varied flag substituted into the final submit', () => {
    const varied = applyFlagVariation(M01, 7);
    expect(varied.flag).not.toBe(M01.flag);
    const steps = M01.solution.map((cmd) => (cmd === `submit ${M01.flag}` ? `submit ${varied.flag}` : cmd));
    const commands = steps.map((cmd, i) => ({ t: i * 1000, cmd }));
    const result = validateRun({ missionId: varied.id, tier: 'medium' as Tier, commands }, [varied]);
    expect(result.ok, !result.ok ? result.reason : undefined).toBe(true);
  });

  it('replaying the original (unvaried) flag against a varied mission fails: the point of the whole feature', () => {
    const varied = applyFlagVariation(M01, 7);
    const commands = M01.solution.map((cmd, i) => ({ t: i * 1000, cmd }));
    const result = validateRun({ missionId: varied.id, tier: 'medium' as Tier, commands }, [varied]);
    expect(result.ok).toBe(false);
  });
});
