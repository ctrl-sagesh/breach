// Per-tier mission locking: a mission unlocked on one difficulty can still be locked on another.
// The briefing's tier picker and the attempt-starting logic both read this, so a player cannot
// clear job 1 on Easy and then start job 2 on Hard before clearing job 1 there too.

import { describe, expect, it } from 'vitest';
import { missionUnlocked, unlockedTiers } from '../src/lib/progress';
import { DEFAULT_SAVE, type SaveData } from '../src/lib/save';
import { MISSIONS } from '../src/missions';

function saveWith(completed: Partial<SaveData['completed']>): SaveData {
  return { ...DEFAULT_SAVE, completed: { ...DEFAULT_SAVE.completed, ...completed } };
}

describe('missionUnlocked', () => {
  it('the first job is always unlocked, on every tier', () => {
    const save = saveWith({});
    expect(missionUnlocked(save, 'easy', 0)).toBe(true);
    expect(missionUnlocked(save, 'medium', 0)).toBe(true);
    expect(missionUnlocked(save, 'hard', 0)).toBe(true);
  });

  it('a later job is locked on a tier where the previous job was never cleared', () => {
    const save = saveWith({ easy: { [MISSIONS[0].id]: { score: 10, points: 10, tier: 'easy', seconds: 1, trace: 0, hints: 0 } } });
    expect(missionUnlocked(save, 'easy', 1)).toBe(true);
    // Cleared on Easy only: still locked on Medium and Hard.
    expect(missionUnlocked(save, 'medium', 1)).toBe(false);
    expect(missionUnlocked(save, 'hard', 1)).toBe(false);
  });
});

describe('unlockedTiers', () => {
  it('reports the lock for every tier at once, so the briefing picker can disable just the locked ones', () => {
    const save = saveWith({ easy: { [MISSIONS[0].id]: { score: 10, points: 10, tier: 'easy', seconds: 1, trace: 0, hints: 0 } } });
    expect(unlockedTiers(save, 1)).toEqual({ easy: true, medium: false, hard: false });
  });

  it('every tier is unlocked for job 1', () => {
    expect(unlockedTiers(saveWith({}), 0)).toEqual({ easy: true, medium: true, hard: true });
  });
});
