// Achievements: fifteen unlocks, kept in the save on this device only. Each one is a plain test over the facts from a
// finished run. Five are hidden until earned. Unlocks are computed from facts, never from anything a page can edit.

import type { GameSession } from '../engine/session';
import type { Tier } from '../engine/types';
import type { IconName } from '../components/Icon';
import { MISSIONS } from '../missions';
import { EASTER_EGG_PATH } from '../missions/shared';

export interface AchievementFacts {
  tier: Tier;
  trace: number;
  hints: number;
  score: number;
  seconds: number;
  isDaily: boolean;
  /** True when this win completes the whole campaign on this tier. */
  campaignDoneOnTier: boolean;
  /** Days in a row with a completed daily, counting today. */
  streak: number;
  /** Lifetime sudo attempts, across every run. */
  sudoTotal: number;
  usedAliases: boolean;
  usedPipe: boolean;
  eggFound: boolean;
  readEveryPublicFile: boolean;
  hourLocal: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  hidden?: boolean;
  test: (f: AchievementFacts) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-breach', title: 'First breach', description: 'Finish any job.', icon: 'check', test: () => true },
  { id: 'clean-sweep', title: 'Clean sweep', description: 'Finish a job with zero trace.', icon: 'radar', test: (f) => f.trace === 0 },
  { id: 'hard-win', title: 'Hard mode', description: 'Finish a job on Hard.', icon: 'tier', test: (f) => f.tier === 'hard' },
  { id: 'no-hints-hard', title: 'Unassisted', description: 'Finish a job on Hard with no hints.', icon: 'lock', test: (f) => f.tier === 'hard' && f.hints === 0 },
  { id: 'ghost-rank', title: 'Ghost', description: 'Rank Ghost on a single job.', icon: 'transfer', test: (f) => f.score >= 850 },
  { id: 'speed-run', title: 'Quick hands', description: 'Finish a job in under three minutes.', icon: 'terminal', test: (f) => f.seconds < 180 },
  { id: 'campaign-complete', title: 'Campaign complete', description: 'Finish every job in the campaign on one tier.', icon: 'card', test: (f) => f.campaignDoneOnTier },
  { id: 'daily-first', title: 'Today\'s job', description: 'Finish a daily challenge.', icon: 'calendar', test: (f) => f.isDaily },
  { id: 'streak-7', title: 'Seven in a row', description: 'Finish a daily challenge seven days running.', icon: 'calendar', test: (f) => f.streak >= 7 },
  { id: 'pipe-dreams', title: 'Pipe dreams', description: 'Finish a job using a pipeline.', icon: 'map', test: (f) => f.usedPipe },
  { id: 'kali-only', title: 'Real tools', description: 'Finish a job with the real command names only.', icon: 'help', hidden: true, test: (f) => !f.usedAliases },
  { id: 'sudo-five', title: 'Asking nicely', description: 'Try sudo five times.', icon: 'alert', hidden: true, test: (f) => f.sudoTotal >= 5 },
  { id: 'egg-hunter', title: 'Found the bug report', description: 'Find the hidden file on the rig.', icon: 'unlock', hidden: true, test: (f) => f.eggFound },
  { id: 'read-host', title: 'Full read', description: 'Read every public file on one host.', icon: 'settings', hidden: true, test: (f) => f.readEveryPublicFile },
  { id: 'night-owl', title: 'Night shift', description: 'Finish a job between midnight and four in the morning.', icon: 'sound-on', hidden: true, test: (f) => f.hourLocal < 4 },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achievementById(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}

/** True when every public (not private) file on every remote host of the mission was opened in this attempt. */
export function readEveryPublicFileIn(session: GameSession): boolean {
  for (const machine of session.mission.machines) {
    if (machine.id === 'rig') continue;
    const publicFiles = Object.entries(machine.files)
      .filter(([, file]) => !file.private)
      .map(([path]) => path);
    if (publicFiles.length === 0) continue;
    if (publicFiles.every((path) => session.reads.has(`${machine.id}:${path}`))) return true;
  }
  return false;
}

/** The facts an attempt leaves behind, read once at the moment of the win. */
export function factsFromWin(session: GameSession, extra: { score: number; isDaily: boolean; campaignDoneOnTier: boolean; streak: number; sudoTotal: number; now: Date }): AchievementFacts {
  return {
    tier: session.tier,
    trace: session.trace,
    hints: session.hintsUsed,
    score: extra.score,
    seconds: session.elapsedSeconds(),
    isDaily: extra.isDaily,
    campaignDoneOnTier: extra.campaignDoneOnTier,
    streak: extra.streak,
    sudoTotal: extra.sudoTotal,
    usedAliases: session.usedAliases,
    usedPipe: session.usedPipe,
    eggFound: session.reads.has(`rig:${EASTER_EGG_PATH}`),
    readEveryPublicFile: readEveryPublicFileIn(session),
    hourLocal: extra.now.getHours(),
  };
}

/** Achievements this run earns that are not already unlocked. Order follows the list above. */
export function newlyUnlocked(facts: AchievementFacts, unlocked: readonly string[]): AchievementDef[] {
  const have = new Set(unlocked);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(facts));
}

/** Whether the campaign is complete on a tier, counting only the campaign's own missions. */
export function campaignDone(completed: Record<string, unknown>): boolean {
  return MISSIONS.every((m) => Boolean(completed[m.id]));
}
