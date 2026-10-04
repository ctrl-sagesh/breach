// Achievements: the list is well formed, each unlock fires on its own condition, nothing unlocks twice,
// and the facts come from real sessions (the easter egg, sudo tries, pipes, aliases, files read).

import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/engine/session';
import { MISSIONS } from '../src/missions';
import { BUG_REPORT_CONTACT, EASTER_EGG_PATH } from '../src/missions/shared';
import { ACHIEVEMENTS, achievementById, newlyUnlocked, readEveryPublicFileIn, type AchievementFacts } from '../src/lib/achievements';

const base: AchievementFacts = {
  tier: 'medium',
  trace: 40,
  hints: 2,
  score: 500,
  seconds: 600,
  isDaily: false,
  campaignDoneOnTier: false,
  streak: 0,
  sudoTotal: 0,
  usedAliases: true,
  usedPipe: false,
  eggFound: false,
  readEveryPublicFile: false,
  hourLocal: 14,
};

const unlocks = (f: Partial<AchievementFacts>) => newlyUnlocked({ ...base, ...f }, []).map((a) => a.id);

describe('achievement list', () => {
  it('has between 15 and 20 achievements with unique ids', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(15);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(20);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('has the obvious ones and some hidden ones', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    for (const id of ['campaign-complete', 'clean-sweep', 'no-hints-hard', 'streak-7']) expect(ids).toContain(id);
    expect(ACHIEVEMENTS.filter((a) => a.hidden).length).toBeGreaterThanOrEqual(4);
  });

  it('every achievement has a title, a description and an icon', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.trim(), a.id).not.toBe('');
      expect(a.description.trim(), a.id).not.toBe('');
      expect(a.icon.trim(), a.id).not.toBe('');
    }
  });
});

describe('unlock conditions', () => {
  it('zero trace unlocks clean sweep, and not otherwise', () => {
    expect(unlocks({ trace: 0 })).toContain('clean-sweep');
    expect(unlocks({ trace: 1 })).not.toContain('clean-sweep');
  });

  it('no hints on Hard unlocks unassisted, but no hints on Medium does not', () => {
    expect(unlocks({ tier: 'hard', hints: 0 })).toContain('no-hints-hard');
    expect(unlocks({ tier: 'medium', hints: 0 })).not.toContain('no-hints-hard');
    expect(unlocks({ tier: 'hard', hints: 1 })).not.toContain('no-hints-hard');
  });

  it('a seven day streak unlocks streak-7 only at seven', () => {
    expect(unlocks({ isDaily: true, streak: 7 })).toEqual(expect.arrayContaining(['daily-first', 'streak-7']));
    expect(unlocks({ isDaily: true, streak: 6 })).not.toContain('streak-7');
  });

  it('finishing the campaign unlocks campaign complete', () => {
    expect(unlocks({ campaignDoneOnTier: true })).toContain('campaign-complete');
  });

  it('ghost rank, speed, pipes and real tools each follow their own facts', () => {
    expect(unlocks({ score: 850 })).toContain('ghost-rank');
    expect(unlocks({ score: 849 })).not.toContain('ghost-rank');
    expect(unlocks({ seconds: 179 })).toContain('speed-run');
    expect(unlocks({ seconds: 180 })).not.toContain('speed-run');
    expect(unlocks({ usedPipe: true })).toContain('pipe-dreams');
    expect(unlocks({ usedAliases: false })).toContain('kali-only');
  });

  it('five sudo tries unlocks asking nicely, four does not', () => {
    expect(unlocks({ sudoTotal: 5 })).toContain('sudo-five');
    expect(unlocks({ sudoTotal: 4 })).not.toContain('sudo-five');
  });

  it('night shift needs a finish between midnight and four', () => {
    expect(unlocks({ hourLocal: 3 })).toContain('night-owl');
    expect(unlocks({ hourLocal: 4 })).not.toContain('night-owl');
  });

  it('the first finish always unlocks first breach', () => {
    expect(unlocks({})).toContain('first-breach');
  });
});

describe('newlyUnlocked', () => {
  it('never returns an achievement that is already unlocked', () => {
    const got = newlyUnlocked({ ...base, trace: 0 }, ['clean-sweep', 'first-breach']).map((a) => a.id);
    expect(got).not.toContain('clean-sweep');
    expect(got).not.toContain('first-breach');
  });

  it('achievementById finds a definition and returns undefined for a stranger', () => {
    expect(achievementById('egg-hunter')?.hidden).toBe(true);
    expect(achievementById('made-up')).toBeUndefined();
  });
});

describe('facts come from real sessions', () => {
  it('reading the hidden file on the rig records the egg, and it names the contact', () => {
    const s = new GameSession(MISSIONS[0]);
    s.input(`cat ${EASTER_EGG_PATH}`);
    expect(s.reads.has(`rig:${EASTER_EGG_PATH}`)).toBe(true);
    expect(s.machine.files[EASTER_EGG_PATH].content).toContain(BUG_REPORT_CONTACT);
  });

  it('each sudo attempt is counted', () => {
    const s = new GameSession(MISSIONS[0]);
    for (let i = 0; i < 5; i++) s.input('sudo cat /etc/shadow');
    expect(s.sudoTries).toBe(5);
  });

  it('a pipeline marks the run as using pipes, and an alias marks it as not real-tools-only', () => {
    const s = new GameSession(MISSIONS[0]);
    s.input('echo hi | wc -l');
    expect(s.usedPipe).toBe(true);
    expect(s.usedAliases).toBe(false);
    s.input('scan');
    expect(s.usedAliases).toBe(true);
  });

  it('readEveryPublicFileIn is false until every public file on a remote host has been read', () => {
    const s = new GameSession(MISSIONS[0]);
    expect(readEveryPublicFileIn(s)).toBe(false);
    for (const machine of s.mission.machines) {
      if (machine.id === 'rig') continue;
      for (const [path, file] of Object.entries(machine.files)) {
        if (!file.private) s.reads.add(`${machine.id}:${path}`);
      }
    }
    expect(readEveryPublicFileIn(s)).toBe(true);
  });
});
