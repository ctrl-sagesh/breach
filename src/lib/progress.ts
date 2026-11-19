// Campaign-level summaries built from the save data: unlocks, rank, points and the share card.
// Everything here is per tier: each difficulty has its own progress, best scores and rank.

import { rankFor, type MissionResult, type Rank } from '../engine/scoring';
import { DIFFICULTY, TIERS } from '../engine/difficulty';
import type { Tier } from '../engine/types';
import { MISSIONS } from '../missions';
import type { SaveData } from './save';

export function missionUnlocked(save: SaveData, tier: Tier, index: number): boolean {
  if (index === 0) return true;
  return Boolean(save.completed[tier][MISSIONS[index - 1].id]);
}

/** Whether a mission is unlocked on each difficulty, for the tier picker on its briefing. */
export function unlockedTiers(save: SaveData, index: number): Record<Tier, boolean> {
  return Object.fromEntries(TIERS.map((t) => [t, missionUnlocked(save, t, index)])) as Record<Tier, boolean>;
}

export interface CampaignSummary {
  tier: Tier;
  completed: number;
  total: number;
  hints: number;
  avgTrace: number;
  points: number;
  rank: Rank;
  grid: string[];
}

export function summarize(save: SaveData, tier: Tier = save.tier): CampaignSummary {
  const results = save.completed[tier];
  const ids = MISSIONS.map((m) => m.id);
  const done = ids.map((id) => results[id]).filter((r): r is MissionResult => Boolean(r));
  const hints = done.reduce((sum, r) => sum + r.hints, 0);
  const avgTrace = done.length ? Math.round(done.reduce((sum, r) => sum + r.trace, 0) / done.length) : 0;
  const points = done.reduce((sum, r) => sum + r.points, 0);
  const grid = ids.map((id) => {
    const r = results[id];
    if (!r) return '⬛';
    if (r.hints === 0) return '🟩';
    if (r.hints <= 2) return '🟨';
    return '⬛';
  });
  return {
    tier,
    completed: done.length,
    total: MISSIONS.length,
    hints,
    avgTrace,
    points,
    rank: rankFor(results, ids),
    grid,
  };
}

/** Wordle-style text for the clipboard. */
export function buildShareCard(summary: CampaignSummary, endingLabel: string | null): string {
  const lines = [
    `BREACH [${DIFFICULTY[summary.tier].label}]: ${summary.completed}/${summary.total} missions, Rank ${summary.rank.name}`,
    `${summary.points} points · ${summary.hints} hint${summary.hints === 1 ? '' : 's'} · avg trace ${summary.avgTrace}%`,
    summary.grid.join(''),
  ];
  if (endingLabel) lines.push(`Ending: ${endingLabel}`);
  return lines.join('\n');
}

/** Distinct missions cleared on any difficulty. Used for theme unlocks, so every tier counts toward them. */
export function clearedOnAnyTier(save: SaveData): number {
  return MISSIONS.filter((m) => TIERS.some((t) => Boolean(save.completed[t][m.id]))).length;
}
