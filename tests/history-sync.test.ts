// The ops log, the cloud sync merge, the recovery key and restore rate limiting.

import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/engine/session';
import { scoreMission } from '../src/engine/scoring';
import { validateRun, replayTimeline, type RunCommand } from '../src/engine/replay';
import { MISSIONS } from '../src/missions';
import { addAttempt, favouriteCommand, HISTORY_LIMIT, missionStats, mergeHistory, totalSeconds, type AttemptRecord } from '../src/lib/history';
import { mergeSaves } from '../src/lib/merge';
import { DEFAULT_SAVE, type SaveData } from '../src/lib/save';
import { admit, generateRecoveryKey, isWellFormedKey, KEY_WORDS, normalizeRecoveryKey, RESTORE_LIMIT } from '../src/lib/recoverykey';
import { seededRandom } from '../src/lib/daily';

function attempt(over: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: 'a1',
    at: '2026-10-04T10:00:00.000Z',
    missionId: MISSIONS[0].id,
    scope: 'campaign',
    tier: 'medium',
    attemptNo: 1,
    outcome: 'cleared',
    score: 900,
    points: 1350,
    seconds: 120,
    trace: 10,
    hints: 0,
    commands: [],
    ...over,
  };
}

const blank = (over: Partial<SaveData> = {}): SaveData => ({
  ...DEFAULT_SAVE,
  completed: { easy: {}, medium: {}, hard: {} },
  attempts: { easy: {}, medium: {}, hard: {} },
  ...over,
});

describe('ops log', () => {
  it('stats count attempts, first clear, best score and time, and clear rate', () => {
    const id = MISSIONS[0].id;
    const history = [
      attempt({ id: 'c', at: '2026-10-04T12:00:00.000Z', attemptNo: 3, score: 700, seconds: 200 }),
      attempt({ id: 'b', at: '2026-10-04T11:00:00.000Z', attemptNo: 2, outcome: 'traced', score: 0, seconds: 40 }),
      attempt({ id: 'a', at: '2026-10-04T10:00:00.000Z', attemptNo: 1, outcome: 'aborted', score: 0, seconds: 10 }),
    ];
    const s = missionStats(history, id, 'medium');
    expect(s.attempts).toBe(3);
    expect(s.firstClearAttempt).toBe(3);
    expect(s.bestScore).toBe(700);
    expect(s.bestSeconds).toBe(200);
    expect(s.clearRate).toBeCloseTo(1 / 3);
  });

  it('stats are per tier, and an uncleared job has no best', () => {
    const history = [attempt({ tier: 'hard', outcome: 'traced', score: 0 })];
    expect(missionStats(history, MISSIONS[0].id, 'medium').attempts).toBe(0);
    const hard = missionStats(history, MISSIONS[0].id, 'hard');
    expect(hard.bestScore).toBeNull();
    expect(hard.firstClearAttempt).toBeNull();
  });

  it('the favourite command is the most typed first word, and nothing is favourite before anything is typed', () => {
    expect(favouriteCommand([])).toBeNull();
    const cmds: RunCommand[] = [
      { t: 0, cmd: 'nmap' },
      { t: 1, cmd: 'ls -la' },
      { t: 2, cmd: 'ls' },
      { t: 3, cmd: 'cat x' },
    ];
    expect(favouriteCommand([attempt({ commands: cmds })])).toEqual({ name: 'ls', count: 2 });
  });

  it('adding an attempt keeps the newest first and caps the list', () => {
    let list: AttemptRecord[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      list = addAttempt(list, attempt({ id: `x${i}`, at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    }
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0].id).toBe(`x${HISTORY_LIMIT + 4}`);
  });

  it('adding the same attempt twice does not duplicate it', () => {
    const list = addAttempt([attempt()], attempt());
    expect(list).toHaveLength(1);
  });

  it('total time sums every attempt once', () => {
    expect(totalSeconds([attempt({ seconds: 60 }), attempt({ id: 'b', seconds: 90 })])).toBe(150);
  });
});

describe('sync merge', () => {
  it('keeps the better result for a job when both copies have one', () => {
    const id = MISSIONS[0].id;
    const local = blank({ completed: { easy: {}, medium: { [id]: { score: 700, points: 1050, tier: 'medium', seconds: 1, trace: 1, hints: 0 } }, hard: {} } });
    const remote = blank({ completed: { easy: {}, medium: { [id]: { score: 900, points: 1350, tier: 'medium', seconds: 1, trace: 1, hints: 0 } }, hard: {} } });
    expect(mergeSaves(local, remote).completed.medium[id].points).toBe(1350);
    expect(mergeSaves(remote, local).completed.medium[id].points).toBe(1350);
  });

  it('achievements are the union of both copies', () => {
    const merged = mergeSaves(blank({ achievements: ['a', 'b'] }), blank({ achievements: ['b', 'c'] }));
    expect([...merged.achievements].sort()).toEqual(['a', 'b', 'c']);
  });

  it('history is the union by id, newest first', () => {
    const merged = mergeSaves(blank({ history: [attempt({ id: 'x', at: '2026-10-04T10:00:00.000Z' })] }), blank({ history: [attempt({ id: 'y', at: '2026-10-05T10:00:00.000Z' })] }));
    expect(merged.history.map((h) => h.id)).toEqual(['y', 'x']);
  });

  it('attempts and sudo counters only go up', () => {
    const id = MISSIONS[0].id;
    const merged = mergeSaves(blank({ attempts: { easy: {}, medium: { [id]: 3 }, hard: {} }, counters: { sudoTries: 2 } }), blank({ attempts: { easy: {}, medium: { [id]: 5 }, hard: {} }, counters: { sudoTries: 7 } }));
    expect(merged.attempts.medium[id]).toBe(5);
    expect(merged.counters.sudoTries).toBe(7);
  });

  it('device settings stay as they are on this device', () => {
    const merged = mergeSaves(blank({ theme: 'amber', volume: 0.2, track: 'cold-room' } as Partial<SaveData>), blank({ theme: 'green', volume: 0.9 }));
    expect(merged.theme).toBe('amber');
    expect(merged.volume).toBe(0.2);
  });

  it('dailies merge per date and tier, keeping the better result', () => {
    const r = (points: number) => ({ score: 500, points, tier: 'easy' as const, seconds: 1, trace: 1, hints: 0 });
    const merged = mergeSaves(blank({ dailies: { '2026-10-04': { easy: r(100) } } }), blank({ dailies: { '2026-10-04': { easy: r(300), hard: r(50) } } }));
    expect(merged.dailies['2026-10-04'].easy!.points).toBe(300);
    expect(merged.dailies['2026-10-04'].hard!.points).toBe(50);
  });
});

describe('recovery keys', () => {
  it('a generated key has four words and four digits, and is well formed', () => {
    const key = generateRecoveryKey(seededRandom(11));
    expect(isWellFormedKey(key)).toBe(true);
    const parts = key.split('-');
    expect(parts).toHaveLength(5);
    expect(KEY_WORDS).toContain(parts[0]);
    expect(parts[4]).toMatch(/^\d{4}$/);
  });

  it('the same seed gives the same key, and different seeds give different keys', () => {
    expect(generateRecoveryKey(seededRandom(5))).toBe(generateRecoveryKey(seededRandom(5)));
    const keys = new Set(Array.from({ length: 200 }, (_, i) => generateRecoveryKey(seededRandom(i + 1))));
    expect(keys.size).toBeGreaterThan(190);
  });

  it('typing the key loosely still matches: case, spaces and underscores', () => {
    expect(normalizeRecoveryKey('  ghost amber_falcon CEDAR 7419 ')).toBe('GHOST-AMBER-FALCON-CEDAR-7419');
    expect(isWellFormedKey('ghost amber falcon cedar 7419')).toBe(true);
    expect(isWellFormedKey('GHOST-AMBER-7419')).toBe(false);
    expect(isWellFormedKey('')).toBe(false);
  });
});

describe('restore rate limiting', () => {
  const opts = RESTORE_LIMIT;

  it('allows the first ten attempts in an hour and refuses the eleventh', () => {
    let bucket = null as ReturnType<typeof admit>['next'] | null;
    const results: boolean[] = [];
    for (let i = 0; i < 11; i++) {
      const r = admit(bucket, 1000 + i, opts);
      results.push(r.allowed);
      bucket = r.next;
    }
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
  });

  it('refused attempts keep counting, so hammering does not reset the window', () => {
    let bucket = null as ReturnType<typeof admit>['next'] | null;
    for (let i = 0; i < 25; i++) bucket = admit(bucket, 1000 + i, opts).next;
    expect(bucket!.hits).toBe(25);
    expect(admit(bucket, 2000, opts).allowed).toBe(false);
  });

  it('a new window opens after an hour', () => {
    const full = { windowStart: 0, hits: 99 };
    expect(admit(full, RESTORE_LIMIT.windowMs - 1, opts).allowed).toBe(false);
    expect(admit(full, RESTORE_LIMIT.windowMs, opts).allowed).toBe(true);
  });
});

describe('replays match the original run', () => {
  const mission = MISSIONS[0];
  const steps = mission.kaliSolution;

  it('the replayed output equals what the original attempt printed, line for line', () => {
    // The original attempt: typed live at one command a second.
    let clock = 0;
    const live = new GameSession(mission, { tier: 'medium', now: () => clock });
    const commands: RunCommand[] = steps.map((cmd, i) => ({ t: i * 1000, cmd }));
    const liveLines = commands.map((c) => {
      clock = c.t;
      return live.input(c.cmd).lines.map((l) => l.text);
    });

    const timeline = replayTimeline(mission, 'medium', commands);
    expect(timeline.map((s) => s.lines.map((l) => l.text))).toEqual(liveLines);
  });

  it('the replay reaches the same result and score the validator computes', () => {
    const commands: RunCommand[] = steps.map((cmd, i) => ({ t: i * 1000, cmd }));
    const verdict = validateRun({ missionId: mission.id, tier: 'medium', commands }, MISSIONS);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const last = replayTimeline(mission, 'medium', commands).at(-1)!;
    expect(last.lines.some((l) => l.text.includes('FLAG ACCEPTED'))).toBe(true);
    expect(verdict.score).toBe(scoreMission(verdict.seconds, verdict.trace, verdict.hints));
  });
});

describe('best streak', () => {
  it('counts the longest run of consecutive days, not the current one', async () => {
    const { bestStreak } = await import('../src/lib/daily');
    expect(bestStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-09', '2026-10-10'])).toBe(3);
    expect(bestStreak([])).toBe(0);
    expect(bestStreak(['2026-10-04'])).toBe(1);
    expect(bestStreak(['2026-10-04', '2026-10-04'])).toBe(1);
  });
});
