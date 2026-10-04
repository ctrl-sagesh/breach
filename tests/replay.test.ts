// The leaderboard replay validator: legitimate runs pass, and edited scores, fake timing, incomplete runs and
// impossible sequences are rejected. The score always comes from the replay.

import { describe, expect, it } from 'vitest';
import { validateRun, type RunCommand, type RunLog } from '../src/engine/replay';
import { TIERS } from '../src/engine/difficulty';
import { MISSIONS } from '../src/missions';
import type { Tier } from '../src/engine/types';

const MISSION = MISSIONS[0];

/** The Kali walkthrough, one command a second: how a person would play it. */
function humanRun(tier: Tier, steps: string[] = MISSION.kaliSolution): RunLog {
  return {
    missionId: MISSION.id,
    tier,
    commands: steps.map((cmd, i) => ({ t: i * 1000, cmd })),
  };
}

describe('replay validator: legitimate runs', () => {
  it.each(TIERS)('accepts the walkthrough on %s and computes the score itself', (tier) => {
    const r = validateRun(humanRun(tier), MISSIONS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.score).toBeGreaterThanOrEqual(100);
    expect(r.score).toBeLessThanOrEqual(1000);
    expect(r.trace).toBeLessThan(100);
    expect(r.points).toBeGreaterThan(0);
  });

  it('accepts a run whose claimed score matches the replay', () => {
    const first = validateRun(humanRun('medium'), MISSIONS);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(validateRun({ ...humanRun('medium'), claimedScore: first.score }, MISSIONS).ok).toBe(true);
  });

  it('reports whether aliases were used, for achievements', () => {
    const old = validateRun(humanRun('medium', MISSION.solution), MISSIONS); // scan, connect, login
    expect(old.ok && old.usedAliases).toBe(true);
    const kali = validateRun(humanRun('medium', MISSION.kaliSolution), MISSIONS);
    expect(kali.ok && kali.usedAliases).toBe(false);
  });
});

describe('replay validator: edited scores', () => {
  it('rejects a claimed score that differs from the replayed score', () => {
    const r = validateRun({ ...humanRun('medium'), claimedScore: 1000 }, MISSIONS);
    // The replay of this walkthrough is well under 1000 (it takes time), so a claimed 1000 is an edit.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/claimed score/);
  });
});

describe('replay validator: fake timing', () => {
  it('rejects commands closer together than a person can type them', () => {
    const run: RunLog = { missionId: MISSION.id, tier: 'medium', commands: MISSION.kaliSolution.map((cmd, i) => ({ t: i * 50, cmd })) };
    const r = validateRun(run, MISSIONS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too close together/);
  });

  it('rejects an entire run that is too fast overall, even with gaps that look fine', () => {
    const run: RunLog = { missionId: MISSION.id, tier: 'medium', commands: MISSION.kaliSolution.map((cmd, i) => ({ t: i * 130, cmd })) };
    const r = validateRun(run, MISSIONS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too fast overall/);
  });

  it('rejects timestamps that go backwards', () => {
    const commands: RunCommand[] = humanRun('medium').commands.map((c) => ({ ...c }));
    commands[5].t = commands[3].t;
    const r = validateRun({ ...humanRun('medium'), commands }, MISSIONS);
    expect(r.ok).toBe(false);
  });

  it('rejects fractional or negative timestamps', () => {
    const bad = humanRun('medium');
    bad.commands[2] = { t: 2.5, cmd: bad.commands[2].cmd };
    expect(validateRun(bad, MISSIONS).ok).toBe(false);
    const neg = humanRun('medium');
    neg.commands[0] = { t: -1, cmd: neg.commands[0].cmd };
    expect(validateRun(neg, MISSIONS).ok).toBe(false);
  });
});

describe('replay validator: incomplete and impossible runs', () => {
  it('rejects a run that stops before the flag is accepted', () => {
    const r = validateRun(humanRun('medium', MISSION.kaliSolution.slice(0, -2)), MISSIONS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/incomplete/);
  });

  it('rejects a run that submits the wrong flag', () => {
    const steps = [...MISSION.kaliSolution.slice(0, -1), 'submit BREACH{wrong}'];
    expect(validateRun(humanRun('medium', steps), MISSIONS).ok).toBe(false);
  });

  it('rejects commands sent after the attempt has been won', () => {
    const r = validateRun(humanRun('medium', [...MISSION.kaliSolution, 'ls']), MISSIONS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/after the attempt ended/);
  });

  it('rejects a run that ends in a trace kill', () => {
    const steps = Array.from({ length: 40 }, () => 'john deadbeef');
    const r = validateRun(humanRun('easy', steps), MISSIONS);
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown mission, an unknown tier, an empty run and an oversized run', () => {
    expect(validateRun({ ...humanRun('medium'), missionId: 'nope' }, MISSIONS).ok).toBe(false);
    expect(validateRun({ ...humanRun('medium'), tier: 'insane' as Tier }, MISSIONS).ok).toBe(false);
    expect(validateRun({ ...humanRun('medium'), commands: [] }, MISSIONS).ok).toBe(false);
    const huge = Array.from({ length: 2001 }, (_, i) => ({ t: i * 1000, cmd: 'ls' }));
    expect(validateRun({ ...humanRun('medium'), commands: huge }, MISSIONS).ok).toBe(false);
  });

  it('rejects a command that is absurdly long', () => {
    const steps = [...MISSION.kaliSolution];
    steps[1] = 'echo ' + 'x'.repeat(400);
    expect(validateRun(humanRun('medium', steps), MISSIONS).ok).toBe(false);
  });
});
