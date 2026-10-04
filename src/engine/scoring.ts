// Scoring and ranks. Pure functions so they are easy to test and tune.
import type { Tier } from './types';

export const MAX_MISSION_SCORE = 1000;
export const MIN_MISSION_SCORE = 100;

export interface MissionResult {
  /** Base score (1000 scale) used for rank. */
  score: number;
  /** Points awarded after the tier multiplier. */
  points: number;
  tier: Tier;
  seconds: number;
  trace: number;
  hints: number;
  endingId?: string;
}

/** 1000 base. Time, trace and hints each take points away. Completed missions never score below 100. */
export function scoreMission(seconds: number, trace: number, hints: number): number {
  const timePenalty = Math.min(400, Math.floor(seconds / 3));
  const tracePenalty = Math.min(300, trace * 2);
  const hintPenalty = hints * 120;
  return Math.max(MIN_MISSION_SCORE, MAX_MISSION_SCORE - timePenalty - tracePenalty - hintPenalty);
}

export interface Rank {
  name: string;
  minAverage: number;
}

/** Ordered from highest to lowest. */
export const RANKS: Rank[] = [
  { name: 'Ghost', minAverage: 850 },
  { name: 'Shadow Broker', minAverage: 750 },
  { name: 'Black Hat', minAverage: 600 },
  { name: 'Keyboard Cowboy', minAverage: 450 },
  { name: 'Packet Sniffer', minAverage: 300 },
  { name: 'Script Kiddie', minAverage: 0 },
];

/** Rank for one mission, from that mission's own base score. Each job is ranked on its own. */
export function rankForScore(score: number): Rank {
  return RANKS.find((r) => score >= r.minAverage) ?? RANKS[RANKS.length - 1];
}

/**
 * Campaign rank: the average over every mission in the campaign. Missions you have not finished count as zero,
 * so Ghost requires finishing all of them with strong scores.
 */
export function rankFor(results: Record<string, MissionResult | undefined>, missionIds: string[]): Rank {
  const total = missionIds.reduce((sum, id) => sum + (results[id]?.score ?? 0), 0);
  const average = missionIds.length ? total / missionIds.length : 0;
  return RANKS.find((r) => average >= r.minAverage) ?? RANKS[RANKS.length - 1];
}
