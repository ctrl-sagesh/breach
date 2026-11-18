// Daily challenge: the same date gives the same job everywhere, every generated job is beatable on every tier,
// the countdown and streak logic is right, and a daily run passes the replay validator.

import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/engine/session';
import { validateRun } from '../src/engine/replay';
import { TIERS } from '../src/engine/difficulty';
import type { MissionDef, Tier } from '../src/engine/types';
import { dailyMission, dailyNumber, hashSeed, isHardFriday, msUntilReset, seededRandom, shiftDate, streakFor, utcDate } from '../src/lib/daily';

const DATES = Array.from({ length: 120 }, (_, i) => shiftDate('2026-01-01', i));

function play(mission: MissionDef, steps: string[], tier: Tier): GameSession {
  const s = new GameSession(mission, { tier });
  for (const step of steps) s.input(step);
  return s;
}

describe('daily generator', () => {
  it('the same date gives the same job, every time', () => {
    expect(JSON.stringify(dailyMission('2026-10-04'))).toBe(JSON.stringify(dailyMission('2026-10-04')));
  });

  it('different dates give different jobs', () => {
    const flags = new Set(DATES.slice(0, 30).map((d) => dailyMission(d).flag));
    expect(flags.size).toBeGreaterThan(25);
  });

  it('the seed is a stable hash, and the random sequence repeats for a seed', () => {
    expect(hashSeed('breach-daily:2026-10-04')).toBe(hashSeed('breach-daily:2026-10-04'));
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it.each(DATES)('%s is beatable on every tier with both walkthroughs', (date) => {
    const m = dailyMission(date);
    for (const tier of TIERS) {
      const kali = play(m, m.kaliSolution, tier);
      expect(kali.status, `${date} ${tier} kali`).toBe('won');
      expect(kali.trace, `${date} ${tier} trace`).toBeLessThan(100);
      const old = play(m, m.solution, tier);
      expect(old.status, `${date} ${tier} classic`).toBe('won');
    }
  });

  it('a daily run passes the replay validator when played at human speed', () => {
    const date = '2026-10-04';
    const m = dailyMission(date);
    const commands = m.kaliSolution.map((cmd, i) => ({ t: i * 1000, cmd }));
    const r = validateRun({ missionId: m.id, tier: 'medium', commands }, [m]);
    expect(r.ok).toBe(true);
  });

  it('every daily job has three hints and a rig', () => {
    for (const date of DATES.slice(0, 20)) {
      const m = dailyMission(date);
      expect(m.hints).toHaveLength(3);
      expect(m.machines.some((x) => x.id === 'rig')).toBe(true);
    }
  });
});

describe('Hard Friday', () => {
  it('flags Friday dates, and only Friday dates', () => {
    expect(isHardFriday('2026-01-02')).toBe(true);
    expect(isHardFriday('2026-01-01')).toBe(false);
    expect(isHardFriday('2026-01-03')).toBe(false);
  });

  it("a Friday's daily is marked hardFriday, with every decoy present", () => {
    const m = dailyMission('2026-01-02');
    expect(m.hardFriday).toBe(true);
    const target = m.machines.find((x) => x.id === 'target');
    const decoyCount = Object.keys(target?.files ?? {}).filter((p) => p.includes('old-menu') || p.includes('cron.log') || p.includes('welcome')).length;
    expect(decoyCount).toBe(3);
  });

  it('a non-Friday daily is not marked', () => {
    expect(dailyMission('2026-01-01').hardFriday).toBe(false);
  });
});

describe('UTC dates, countdown and streak', () => {
  it('uses the UTC calendar date', () => {
    expect(utcDate(new Date('2026-10-03T23:59:59Z'))).toBe('2026-10-03');
    expect(utcDate(new Date('2026-10-04T00:00:00Z'))).toBe('2026-10-04');
  });

  it('numbers day one as 2026-01-01 and walks across month ends', () => {
    expect(dailyNumber('2026-01-01')).toBe(1);
    expect(dailyNumber('2026-02-01')).toBe(32);
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('counts down to the next UTC midnight', () => {
    expect(msUntilReset(new Date('2026-10-03T23:59:59Z'))).toBe(1000);
    expect(msUntilReset(new Date('2026-10-04T00:00:00Z'))).toBe(86_400_000);
  });

  it('a streak counts consecutive completed days back from today', () => {
    expect(streakFor(['2026-10-01', '2026-10-02', '2026-10-03'], '2026-10-03')).toBe(3);
  });

  it('a streak survives until the day is over, then stops at a gap', () => {
    // Done yesterday, not yet today: the streak still shows.
    expect(streakFor(['2026-10-01', '2026-10-02'], '2026-10-03')).toBe(2);
    // A missed day breaks it.
    expect(streakFor(['2026-10-01', '2026-10-03'], '2026-10-03')).toBe(1);
    expect(streakFor([], '2026-10-03')).toBe(0);
  });
});
