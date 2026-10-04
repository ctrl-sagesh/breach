// Difficulty tiers. This is the one place that tunes how each tier plays.
// Tiers change how a mission plays, never what it asks for: the solution still works on every tier.

import type { MissionDef, Tier } from './types';

export interface TierConfig {
  label: string;
  description: string;
  /** How many hints the hint command will give. */
  hintLimit: number;
  /** Multiplies every trace gain. Below 1 is forgiving, above 1 punishes noise. */
  traceMultiplier: number;
  /** Multiplies the points a completed mission awards. Rank is unaffected. */
  pointMultiplier: number;
  /** Seconds before the attempt fails. null means no limit. */
  timeLimitSeconds: number | null;
  showTimer: boolean;
  /** Show the first hint inside the briefing. */
  briefingTip: boolean;
  /**
   * How much account-recovery help the host gives away.
   * direct: the login "Forgot it?" line and the help footer. footer: help footer only. none: neither.
   */
  recoveryHints: 'direct' | 'footer' | 'none';
  /** The clue log fills itself from command output. Off means the player adds notes by hand. */
  autoClues: boolean;
}

export const TIERS: Tier[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY: Record<Tier, TierConfig> = {
  easy: {
    label: 'Easy',
    description: 'Forgiving trace, full tab completion, a tip in every briefing.',
    hintLimit: 3,
    traceMultiplier: 0.6,
    pointMultiplier: 1,
    timeLimitSeconds: null,
    showTimer: false,
    briefingTip: true,
    recoveryHints: 'direct',
    autoClues: true,
  },
  medium: {
    label: 'Medium',
    description: 'The standard balance. Three hints, full completion.',
    hintLimit: 3,
    traceMultiplier: 1,
    pointMultiplier: 1.5,
    timeLimitSeconds: null,
    showTimer: false,
    briefingTip: false,
    recoveryHints: 'footer',
    autoClues: true,
  },
  hard: {
    label: 'Hard',
    description: 'One hint, fast trace, decoys in every machine, a 20 minute clock.',
    hintLimit: 1,
    traceMultiplier: 1.6,
    pointMultiplier: 2.5,
    timeLimitSeconds: 20 * 60,
    showTimer: true,
    briefingTip: false,
    recoveryHints: 'none',
    autoClues: false,
  },
};

export function isTier(value: unknown): value is Tier {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

/** Points for a completed mission on a tier. Rounded to a whole number. */
export function pointsFor(baseScore: number, tier: Tier): number {
  return Math.round(baseScore * DIFFICULTY[tier].pointMultiplier);
}

/**
 * Returns the mission as it plays on `tier`: the base data with that tier's overrides merged in.
 * The input is never mutated, so the campaign list stays the same for every tier.
 */
export function applyTier(mission: MissionDef, tier: Tier): MissionDef {
  const override = mission.tierOverrides?.[tier];
  if (!override) return mission;

  const machines = mission.machines.map((machine) => {
    const extra = override.machines?.[machine.id];
    if (!extra) return machine;
    return {
      ...machine,
      files: { ...machine.files, ...(extra.files ?? {}) },
      users: [...machine.users, ...(extra.users ?? [])],
      processes: [...(machine.processes ?? []), ...(extra.processes ?? [])],
    };
  });

  const hidden = new Set(override.hideInbox ?? []);
  return {
    ...mission,
    machines,
    inbox: [...mission.inbox.filter((m) => !hidden.has(m.subject)), ...(override.inbox ?? [])],
  };
}
