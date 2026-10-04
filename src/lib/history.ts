// The ops log: every attempt on this device, with its outcome, timing and the command log that produced it.
// Pure functions only, so the stats, the favourite command and the merge rules can be tested directly.

import type { RunCommand } from '../engine/replay';
import type { Tier } from '../engine/types';

export type Outcome = 'cleared' | 'traced' | 'aborted' | 'timed-out';

export interface AttemptRecord {
  /** Unique per attempt. Used to merge histories from two devices without duplicates. */
  id: string;
  /** ISO time the attempt ended. */
  at: string;
  missionId: string;
  scope: 'campaign' | 'daily';
  tier: Tier;
  /** 1 for the first try at this job on this tier, 2 for the next, and so on. */
  attemptNo: number;
  outcome: Outcome;
  /** Base score. Zero unless the job was cleared. */
  score: number;
  points: number;
  seconds: number;
  trace: number;
  hints: number;
  commands: RunCommand[];
}

/** Newest attempts kept. Older ones are dropped to keep the save small. */
export const HISTORY_LIMIT = 200;

/** Adds an attempt, keeps the newest HISTORY_LIMIT, newest first. */
export function addAttempt(history: readonly AttemptRecord[], record: AttemptRecord): AttemptRecord[] {
  return mergeHistory(history, [record]);
}

/** Union of two histories by id, newest first, capped. Safe to call with the same attempt twice. */
export function mergeHistory(a: readonly AttemptRecord[], b: readonly AttemptRecord[]): AttemptRecord[] {
  const byId = new Map<string, AttemptRecord>();
  for (const r of [...a, ...b]) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).slice(0, HISTORY_LIMIT);
}

export interface MissionStats {
  attempts: number;
  /** The attempt number of the first clear, or null if never cleared. */
  firstClearAttempt: number | null;
  bestScore: number | null;
  bestSeconds: number | null;
  /** Share of attempts that cleared the job, 0 to 1. */
  clearRate: number;
}

/** Stats for one job on one tier, from the history. */
export function missionStats(history: readonly AttemptRecord[], missionId: string, tier: Tier): MissionStats {
  const mine = history.filter((r) => r.missionId === missionId && r.tier === tier);
  const cleared = mine.filter((r) => r.outcome === 'cleared');
  const firstClear = cleared.length ? Math.min(...cleared.map((r) => r.attemptNo)) : null;
  return {
    attempts: mine.length,
    firstClearAttempt: firstClear,
    bestScore: cleared.length ? Math.max(...cleared.map((r) => r.score)) : null,
    bestSeconds: cleared.length ? Math.min(...cleared.map((r) => r.seconds)) : null,
    clearRate: mine.length ? cleared.length / mine.length : 0,
  };
}

/** The command typed most often across every attempt, with how many times. Null if nothing was typed yet. */
export function favouriteCommand(history: readonly AttemptRecord[]): { name: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const r of history) {
    for (const c of r.commands) {
      const name = c.cmd.trim().split(/\s+/)[0];
      if (!name || name === '\u0003' || name.includes('{') || name.includes('|')) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) if (!best || count > best.count) best = { name, count };
  return best;
}

/** Total seconds spent in attempts, counting each attempt once. */
export function totalSeconds(history: readonly AttemptRecord[]): number {
  return history.reduce((sum, r) => sum + r.seconds, 0);
}
