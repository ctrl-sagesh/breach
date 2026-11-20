// Per-run flag variation. A leaderboard run's flag text changes with the server-issued token's seed, so a
// command log recorded on one run (including its final `submit <flag>`) fails if resubmitted against another.
// Pure and generic: it works for every mission whose complete flag is embedded verbatim, in plaintext, somewhere
// the player reads it directly (true for 6 of 8 campaign missions, plus every daily job). The two exceptions
// are marked on the mission itself with `varyFlag: false` — see m03-lighthouse and m04-blue-lines.

import { seededRandom } from './daily';
import type { MissionDef } from '../engine/types';

const FLAG_SUFFIXES = [
  'k7', 'q2', 'r9', 'z4', 'm1', 'x8', 't3', 'v6', 'n5', 'w0', 'p2', 'j9', 'h6', 'c1', 'f8', 'y3',
] as const;

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

/** Replaces every exact occurrence of `from` with `to` in every string leaf. Never mutates `value`. */
function substituteDeep<T>(value: T, from: string, to: string): T {
  if (typeof value === 'string') return value.split(from).join(to) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => substituteDeep(v, from, to)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = substituteDeep(v, from, to);
    return out as T;
  }
  return value;
}

/**
 * Varies a mission's flag deterministically from a seed. Returns a new MissionDef; the input is never changed
 * (mission files are module-level singletons shared across every attempt and test in the process).
 */
export function applyFlagVariation(mission: MissionDef, seed: number): MissionDef {
  if (mission.varyFlag === false) return mission;
  const rand = seededRandom(seed);
  const suffix = pick(rand, FLAG_SUFFIXES);
  const variedFlag = mission.flag.replace(/\}$/, `_${suffix}}`);
  return substituteDeep(mission, mission.flag, variedFlag);
}
