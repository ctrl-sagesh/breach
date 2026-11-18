// Engine-level tests: the parts of the game that are not tied to one mission.

import { describe, expect, it } from 'vitest';
import { fromBase64, fromHex, rot13, toBase64, toHex } from '../src/engine/encoding';
import { canRead, listDir, normalizePath } from '../src/engine/fs';
import { GameSession, splitCommand } from '../src/engine/session';
import { runLoginQuery, tokenize, type LoginRow } from '../src/engine/sql';
import { rankFor, scoreMission, type MissionResult } from '../src/engine/scoring';
import { DEFAULT_SAVE, loadSave, type SaveData } from '../src/lib/save';
import { clearedOnAnyTier, missionUnlocked, summarize } from '../src/lib/progress';
import { applyTier, DIFFICULTY, pointsFor } from '../src/engine/difficulty';
import { MISSIONS } from '../src/missions';
import type { MachineDef, Tier } from '../src/engine/types';

const ROWS: LoginRow[] = [
  { username: 'admin', password: 'Cr3st-Ledger!9' },
  { username: 'clerk', password: 'payday2024' },
];
const TEMPLATE = "SELECT id, username FROM users WHERE username = '{username}' AND password = '{password}'";

function result(score: number, tier: Tier = 'medium'): MissionResult {
  return { score, points: score, tier, seconds: 0, trace: 0, hints: 0 };
}

describe('quick-start briefing', () => {
  it('intro() is generic without quickBriefing', () => {
    const s = new GameSession(MISSIONS[0], { tier: 'easy' });
    const lines = s.intro().map((l) => l.text);
    expect(lines.some((t) => t.includes(MISSIONS[0].codename))).toBe(false);
  });

  it('intro() prints the job and its opening scenario line when quickBriefing is set', () => {
    const s = new GameSession(MISSIONS[0], { tier: 'easy', quickBriefing: true });
    const lines = s.intro().map((l) => l.text);
    expect(lines[0]).toContain(MISSIONS[0].codename);
    expect(lines[0]).toContain(MISSIONS[0].client);
    const scenario = typeof MISSIONS[0].briefing[0] === 'string' ? MISSIONS[0].briefing[0] : (MISSIONS[0].briefing[0] as { text: string }).text;
    expect(lines).toContain(scenario);
  });
});

describe('Hard Friday', () => {
  it('forces no hints and at least hard-tier trace speed, on every tier', () => {
    const friday = { ...MISSIONS[0], hardFriday: true };
    for (const tier of ['easy', 'medium', 'hard'] as Tier[]) {
      const s = new GameSession(friday, { tier });
      expect(s.hintLimit).toBe(0);
      expect(s.config.traceMultiplier).toBeGreaterThanOrEqual(DIFFICULTY.hard.traceMultiplier);
    }
  });

  it('leaves an ordinary day alone', () => {
    const s = new GameSession(MISSIONS[0], { tier: 'easy' });
    expect(s.hintLimit).toBe(3);
  });
});

describe('SQL login form', () => {
  it('accepts the right password', () => {
    const r = runLoginQuery(TEMPLATE, 'clerk', 'payday2024', ROWS);
    expect(r.ok && r.user).toBe('clerk');
  });

  it('rejects a wrong password', () => {
    expect(runLoginQuery(TEMPLATE, 'admin', 'nope', ROWS).ok).toBe(false);
  });

  it('a lone quote breaks the string and returns a syntax error', () => {
    const r = runLoginQuery(TEMPLATE, "admin'", 'x', ROWS);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/syntax/i);
  });

  it('a tautology with a comment logs in as the first row, whatever the password', () => {
    const r = runLoginQuery(TEMPLATE, "' OR '1'='1' --", 'anything', ROWS);
    expect(r.ok && r.user).toBe('admin');
  });

  it('AND binds tighter than OR, so a tautology without a comment still needs the password', () => {
    const r = runLoginQuery(TEMPLATE, "' OR '1'='1", 'anything', ROWS);
    expect(r.ok).toBe(false);
  });

  it('a numeric tautology in the password field works too', () => {
    const r = runLoginQuery(TEMPLATE, 'nobody', "' OR 1=1 --", ROWS);
    expect(r.ok && r.user).toBe('admin');
  });

  it('the SQL tokenizer treats -- and # as comments outside strings', () => {
    expect(tokenize("a = 'x' -- trailing").map((t) => t.value)).toEqual(['a', '=', 'x']);
    expect(tokenize("a = 'x' # trailing").map((t) => t.value)).toEqual(['a', '=', 'x']);
  });
});

describe('encodings', () => {
  it('round-trips base64, hex and rot13', () => {
    const text = 'BREACH{round_trip_ok}';
    expect(fromBase64(toBase64(text))).toBe(text);
    expect(fromHex(toHex(text))).toBe(text);
    expect(rot13(rot13(text))).toBe(text);
  });

  it('rejects malformed input instead of returning garbage', () => {
    expect(() => fromBase64('!!!not base64!!!')).toThrow();
    expect(() => fromHex('xyz')).toThrow();
  });
});

describe('paths and permissions', () => {
  const machine: MachineDef = {
    id: 'm',
    hostname: 'm',
    ip: '1.1.1.1',
    neighbors: [],
    defaultUser: 'guest',
    users: [],
    ports: [],
    files: {
      '/home/bob/secret.txt': { content: 's', owner: 'bob', private: true },
      '/home/guest/hi.txt': { content: 'hi' },
    },
    dirs: { '/home/bob': { owner: 'bob', private: true } },
  };

  it('normalises ., .., ~ and relative paths', () => {
    expect(normalizePath('../x/./y', '/a/b', '/home/g')).toBe('/a/x/y');
    expect(normalizePath('~/docs', '/', '/home/g')).toBe('/home/g/docs');
    expect(normalizePath('/../..', '/', '/')).toBe('/');
  });

  it('blocks private paths and their children for other users, but not for root', () => {
    expect(canRead(machine, '/home/bob/secret.txt', 'guest')).toBe(false);
    expect(canRead(machine, '/home/bob/secret.txt', 'bob')).toBe(true);
    expect(canRead(machine, '/home/bob/secret.txt', 'root')).toBe(true);
    expect(canRead(machine, '/home/guest/hi.txt', 'guest')).toBe(true);
  });

  it('lists implied directories', () => {
    expect(listDir(machine, '/home').map((e) => `${e.type}:${e.name}`)).toEqual(['dir:bob', 'dir:guest']);
  });
});

describe('shell splitting', () => {
  it('keeps quoted phrases together', () => {
    expect(splitCommand('grep "Accepted password" /var/log')).toEqual(['grep', 'Accepted password', '/var/log']);
    expect(splitCommand('  ls   -la  ')).toEqual(['ls', '-la']);
  });
});

describe('session behaviour', () => {
  const first = MISSIONS[0];

  it('starts on the rig with the prompt for its default user', () => {
    const s = new GameSession(first);
    expect(s.machine.id).toBe('rig');
    expect(s.prompt()).toBe('ghost@ghost-rig:~$ ');
  });

  it('fails the mission at 100% trace and then refuses input', () => {
    const s = new GameSession(first);
    let guard = 0;
    while (s.status === 'playing' && guard++ < 200) s.input('crack deadbeef');
    expect(s.status).toBe('failed');
    expect(s.trace).toBe(100);
    expect(s.input('ls').lines.some((l) => l.text.includes('Session closed'))).toBe(true);
  });

  it('warns at 70% trace', () => {
    const s = new GameSession(first);
    const lines: string[] = [];
    let guard = 0;
    while (s.trace < 70 && guard++ < 50) lines.push(...s.input('crack deadbeef').lines.map((l) => l.text));
    expect(lines.some((t) => t.includes('TRACE 70%'))).toBe(true);
  });

  it('a running security process multiplies trace gain, and root-owned kills are refused for guest', () => {
    const pivot = MISSIONS[5];
    const s = new GameSession(pivot);
    s.input('connect 10.13.37.100');
    const before = s.trace;
    s.input('scan');
    expect(s.trace - before).toBe(8); // 5 * 1.5, rounded
    expect(s.input('kill 412').lines.some((l) => l.text.includes('Operation not permitted'))).toBe(true);
  });

  it('recovery needs the answers, and a wrong answer fails the login', () => {
    const s = new GameSession(MISSIONS[4]);
    s.input('connect 10.13.37.90');
    s.input('login rfoster');
    s.input('?');
    s.input('biscuit');
    s.input('lakeport');
    s.input('wrong');
    expect(s.frame.user).toBe('guest');
    expect(s.failedLogins).toBe(1);
  });

  it('the finale ignores out-of-range choices, then records the ending', () => {
    const finale = MISSIONS[7];
    const s = new GameSession(finale);
    for (const step of finale.solution.slice(0, -1)) s.input(step);
    expect(s.status).toBe('choosing');
    s.input('9');
    expect(s.status).toBe('choosing');
    s.input('3');
    expect(s.status).toBe('won');
    expect(s.endingId).toBe('sell');
  });

  it('tab completes commands and neighbour ips', () => {
    const s = new GameSession(first);
    expect(s.complete('sc').value).toBe('scan ');
    expect(s.complete('connect 10.13.37.').options).toEqual(['10.13.37.20']);
  });

  it('exit closes a remote session, and exit on the rig asks to abort', () => {
    const s = new GameSession(first);
    s.input('connect 10.13.37.20');
    expect(s.stack.length).toBe(2);
    s.input('exit');
    expect(s.stack.length).toBe(1);
    expect(s.input('exit').quit).toBe(true);
  });
});

describe('scoring and ranks', () => {
  it('takes points for time, trace and hints, and never drops below 100', () => {
    expect(scoreMission(0, 0, 0)).toBe(1000);
    expect(scoreMission(60, 10, 1)).toBe(1000 - 20 - 20 - 120);
    expect(scoreMission(99999, 100, 3)).toBe(100);
  });

  it('Ghost needs every mission finished with strong scores', () => {
    const ids = ['a', 'b'];
    expect(rankFor({ a: result(900), b: result(900) }, ids).name).toBe('Ghost');
    expect(rankFor({ a: result(900) }, ids).name).not.toBe('Ghost');
  });
});

describe("save system and progress", () => {
  const blank = (): SaveData => ({ ...DEFAULT_SAVE, completed: { easy: {}, medium: {}, hard: {} }, attempts: { easy: {}, medium: {}, hard: {} } });

  it("returns fresh defaults when localStorage is unavailable (node test environment)", () => {
    expect(loadSave()).toEqual(blank());
  });

  it("unlocks missions in order, per tier", () => {
    const save = blank();
    expect(missionUnlocked(save, "medium", 0)).toBe(true);
    expect(missionUnlocked(save, "medium", 1)).toBe(false);
    save.completed.medium[MISSIONS[0].id] = result(500);
    expect(missionUnlocked(save, "medium", 1)).toBe(true);
    expect(missionUnlocked(save, "hard", 1)).toBe(false);
  });

  it("summarises hints, average trace, points and the result grid for one tier", () => {
    const save = blank();
    save.completed.hard[MISSIONS[0].id] = { score: 900, points: 2250, tier: "hard", seconds: 1, trace: 10, hints: 0 };
    const summary = summarize(save, "hard");
    expect(summary.completed).toBe(1);
    expect(summary.avgTrace).toBe(10);
    expect(summary.points).toBe(2250);
    expect(summary.grid[0]).toBe("🟩");
    expect(summarize(save, "easy").completed).toBe(0);
  });

  it("theme unlocks count missions cleared on any tier", () => {
    const save = blank();
    save.completed.easy[MISSIONS[0].id] = result(500, "easy");
    save.completed.hard[MISSIONS[1].id] = result(500, "hard");
    expect(clearedOnAnyTier(save)).toBe(2);
  });
});

describe("difficulty tiers", () => {
  it("applies tier overrides without touching the base mission", () => {
    const base = MISSIONS[0];
    const hard = applyTier(base, "hard");
    expect(hard).not.toBe(base);
    const baseFiles = base.machines.find((m) => m.id === "fenwick")!.files;
    const hardFiles = hard.machines.find((m) => m.id === "fenwick")!.files;
    expect(Object.keys(hardFiles).length).toBeGreaterThan(Object.keys(baseFiles).length);
    expect(Object.keys(base.machines.find((m) => m.id === "fenwick")!.files)).toEqual(Object.keys(baseFiles));
    expect(applyTier(base, "medium")).toBe(base);
  });

  it("every hard decoy is additive: base files and users remain", () => {
    for (const m of MISSIONS) {
      const hard = applyTier(m, "hard");
      for (const machine of m.machines) {
        const hm = hard.machines.find((x) => x.id === machine.id)!;
        for (const path of Object.keys(machine.files)) expect(hm.files[path]).toBeDefined();
        for (const user of machine.users) expect(hm.users.some((u) => u.name === user.name)).toBe(true);
      }
    }
  });

  it("hard allows one hint; easy and medium allow three", () => {
    const hard = new GameSession(MISSIONS[0], { tier: "hard" });
    hard.input("hint");
    expect(hard.hintsUsed).toBe(1);
    expect(hard.input("hint").lines.some((l) => l.text.includes("No hints left"))).toBe(true);
    const medium = new GameSession(MISSIONS[0], { tier: "medium" });
    for (let i = 0; i < 3; i++) medium.input("hint");
    expect(medium.hintsUsed).toBe(3);
  });

  it("easy gains less trace than medium for the same noisy action", () => {
    const easy = new GameSession(MISSIONS[0], { tier: "easy" });
    const medium = new GameSession(MISSIONS[0], { tier: "medium" });
    easy.input("scan");
    medium.input("scan");
    expect(easy.trace).toBeLessThan(medium.trace);
  });

  it("hard gains more trace than medium for the same noisy action", () => {
    const hard = new GameSession(MISSIONS[0], { tier: "hard" });
    const medium = new GameSession(MISSIONS[0], { tier: "medium" });
    hard.input("scan");
    medium.input("scan");
    expect(hard.trace).toBeGreaterThan(medium.trace);
  });

  it("tab completes arguments on every tier, hard included", () => {
    for (const tier of ["easy", "medium", "hard"] as const) {
      const s = new GameSession(MISSIONS[0], { tier });
      expect(s.complete("sc").value).toBe("scan ");
      expect(s.complete("connect 10.13.37.").options).toEqual(["10.13.37.20"]);
    }
  });

  it("hard has a 20 minute clock that fails the attempt when it runs out", () => {
    let now = 0;
    const s = new GameSession(MISSIONS[0], { tier: "hard", now: () => now });
    expect(s.timeRemaining()).toBe(1200);
    now = 1199 * 1000;
    expect(s.expireIfLate()).toBe(false);
    now = 1200 * 1000;
    expect(s.expireIfLate()).toBe(true);
    expect(s.status).toBe("failed");
    expect(s.failReason).toBe("time");
  });

  it("medium and easy have no clock", () => {
    const s = new GameSession(MISSIONS[0], { tier: "medium", now: () => 10 ** 12 });
    expect(s.timeRemaining()).toBeNull();
    expect(s.expireIfLate()).toBe(false);
  });

  it("points are multiplied by the tier and rank is not", () => {
    expect(pointsFor(1000, "easy")).toBe(1000);
    expect(pointsFor(1000, "medium")).toBe(1500);
    expect(pointsFor(1000, "hard")).toBe(2500);
  });

  it("the alarm fires once at 75% trace", () => {
    const s = new GameSession(MISSIONS[5], { tier: "medium" });
    s.trace = 74;
    const out = s.input("connect 10.13.37.100");
    const alarms = out.sounds.filter((x) => x === "alarm").length;
    expect(alarms).toBe(1);
  });
});

describe("save migration", () => {
  it("version 1 progress becomes medium progress and mute becomes sfx off", () => {
    const v1 = { version: 1, completed: { [MISSIONS[0].id]: { score: 800, seconds: 1, trace: 2, hints: 1 } }, attempts: { [MISSIONS[0].id]: 2 }, muted: true, crt: false, theme: "amber", typing: "fast" };
    const store = new Map<string, string>([["breach.save.v1", JSON.stringify(v1)]]);
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } };
    try {
      const migrated = loadSave();
      expect(migrated.version).toBe(2);
      expect(migrated.completed.medium[MISSIONS[0].id].score).toBe(800);
      expect(migrated.attempts.medium[MISSIONS[0].id]).toBe(2);
      expect(migrated.sfx).toBe(false);
      expect(migrated.theme).toBe("amber");
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
});
