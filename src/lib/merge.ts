// Merging the local save with the cloud copy. The local save is the source of truth on each device, so the merge only
// adds what the other copy knows and keeps the better result when both have one. Device settings always stay local.
// Pure: runs in the browser and inside the sync Edge Function, from the same bundle.

import type { MissionResult } from '../engine/scoring';
import type { Tier } from '../engine/types';
import { HISTORY_LIMIT, mergeHistory } from './history';
import type { SaveData } from './save';

const TIERS: Tier[] = ['easy', 'medium', 'hard'];

function betterResult(a: MissionResult | undefined, b: MissionResult | undefined): MissionResult | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.points > a.points ? b : a;
}

/** Keeps the higher points result for every job on every tier. */
function mergeCompleted(a: SaveData['completed'], b: SaveData['completed']): SaveData['completed'] {
  const out = { easy: {}, medium: {}, hard: {} } as SaveData['completed'];
  for (const t of TIERS) {
    const ids = new Set([...Object.keys(a[t]), ...Object.keys(b[t])]);
    for (const id of ids) {
      const best = betterResult(a[t][id], b[t][id]);
      if (best) out[t][id] = best;
    }
  }
  return out;
}

/** Attempts only ever go up, so the larger count wins. */
function mergeAttempts(a: SaveData['attempts'], b: SaveData['attempts']): SaveData['attempts'] {
  const out = { easy: {}, medium: {}, hard: {} } as SaveData['attempts'];
  for (const t of TIERS) {
    for (const id of new Set([...Object.keys(a[t]), ...Object.keys(b[t])])) {
      out[t][id] = Math.max(a[t][id] ?? 0, b[t][id] ?? 0);
    }
  }
  return out;
}

function mergeDailies(a: SaveData['dailies'], b: SaveData['dailies']): SaveData['dailies'] {
  const out: SaveData['dailies'] = {};
  for (const date of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const row: SaveData['dailies'][string] = {};
    for (const t of TIERS) {
      const best = betterResult(a[date]?.[t], b[date]?.[t]);
      if (best) row[t] = best;
    }
    out[date] = row;
  }
  return out;
}

/**
 * Merges a remote save into a local one. `local` wins for anything that is a device preference, and for the identity
 * fields, which never come from the cloud. Everything else is the union, keeping the best result when both have one.
 */
export function mergeSaves(local: SaveData, remote: SaveData): SaveData {
  return {
    ...local,
    completed: mergeCompleted(local.completed, remote.completed),
    attempts: mergeAttempts(local.attempts, remote.attempts),
    achievements: [...new Set([...local.achievements, ...remote.achievements])],
    history: mergeHistory(local.history, remote.history).slice(0, HISTORY_LIMIT),
    dailies: mergeDailies(local.dailies, remote.dailies),
    counters: { sudoTries: Math.max(local.counters.sudoTries, remote.counters.sudoTries) },
    nickname: local.nickname ?? remote.nickname,
  };
}
