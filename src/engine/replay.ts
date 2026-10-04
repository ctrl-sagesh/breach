// Replay validator for leaderboard runs. The client never sends a score. It sends the commands it typed and when,
// and this module replays them through the same deterministic engine. The score comes from the replay alone.
// Pure: no network, no storage, no DOM. The Edge Function calls this with the mission list it bundles.

import { pointsFor } from './difficulty';
import { scoreMission } from './scoring';
import { GameSession, Out } from './session';
import { TIERS } from './difficulty';
import type { Line, MissionDef, Tier } from './types';

/** Logged in place of a command when the player presses Ctrl+C at a password or question prompt. */
export const CANCEL_MARK = '\u0003';

export interface RunCommand {
  /** Milliseconds since the attempt started. Must be whole, non-decreasing. */
  t: number;
  cmd: string;
}

export interface RunLog {
  missionId: string;
  tier: Tier;
  commands: RunCommand[];
  /** Optional. If the client sends one, it must match the replayed score exactly, or the run is rejected. */
  claimedScore?: number;
}

export type ReplayResult =
  | { ok: true; score: number; points: number; seconds: number; trace: number; hints: number; endingId: string | null; usedAliases: boolean; usedPipe: boolean }
  | { ok: false; reason: string };

export const RUN_LIMITS = {
  maxCommands: 2000,
  maxCommandLength: 300,
  /** Two commands cannot land closer together than this. Faster than a person can type or paste one by one. */
  minGapMs: 120,
  /** Averaged over the whole run. Typing and reading a walkthrough takes longer than a script needs. */
  minAverageMs: 500,
} as const;

const fail = (reason: string): ReplayResult => ({ ok: false, reason });

/** Replays one run and returns the score the engine computes, or why the run is not valid. */
export function validateRun(run: RunLog, missions: readonly MissionDef[]): ReplayResult {
  const mission = missions.find((m) => m.id === run.missionId);
  if (!mission) return fail('unknown mission');
  if (!TIERS.includes(run.tier)) return fail('unknown tier');
  if (!Array.isArray(run.commands) || run.commands.length === 0) return fail('empty run');
  if (run.commands.length > RUN_LIMITS.maxCommands) return fail('too many commands');

  let prev = -1;
  for (const c of run.commands) {
    if (typeof c !== 'object' || c === null) return fail('malformed command');
    if (!Number.isInteger(c.t) || c.t < 0) return fail('bad timestamp');
    if (typeof c.cmd !== 'string' || c.cmd.length > RUN_LIMITS.maxCommandLength) return fail('bad command text');
    if (c.t < prev) return fail('timestamps go backwards');
    if (prev >= 0 && c.t - prev < RUN_LIMITS.minGapMs) return fail('impossible timing: commands too close together');
    prev = c.t;
  }
  if (prev < run.commands.length * RUN_LIMITS.minAverageMs) return fail('impossible timing: the run is too fast overall');

  // The engine's clock is driven by the log, so the replay sees the same times the player did.
  let clock = 0;
  const session = new GameSession(mission, { tier: run.tier, now: () => clock });
  for (const c of run.commands) {
    if (session.finished) return fail('commands after the attempt ended');
    clock = c.t;
    if (c.cmd === CANCEL_MARK) session.cancelPending(new Out());
    else session.input(c.cmd);
  }

  if (session.status === 'failed') return fail(session.failReason === 'time' ? 'the clock ran out' : 'trace reached 100%');
  if (session.status !== 'won') return fail('incomplete run: the flag was never accepted');

  const seconds = session.elapsedSeconds();
  const score = scoreMission(seconds, session.trace, session.hintsUsed);
  if (run.claimedScore !== undefined && run.claimedScore !== score) return fail('claimed score does not match the replay');

  return {
    ok: true,
    score,
    points: pointsFor(score, run.tier),
    seconds,
    trace: session.trace,
    hints: session.hintsUsed,
    endingId: session.endingId,
    usedAliases: session.usedAliases,
    usedPipe: session.usedPipe,
  };
}

export interface TimelineStep {
  /** When the command was typed, in ms from the start of the attempt. */
  t: number;
  /** The command as typed (or the cancel marker). */
  cmd: string;
  /** Every line the engine printed for it, the echo line first. */
  lines: Line[];
}

/**
 * Re-runs a logged attempt through the engine and keeps what each command printed. The viewer plays this back.
 * Because the engine is deterministic, the output matches the original attempt line for line.
 */
export function replayTimeline(mission: MissionDef, tier: Tier, commands: readonly RunCommand[]): TimelineStep[] {
  let clock = 0;
  const session = new GameSession(mission, { tier, now: () => clock });
  return commands.map((c) => {
    clock = c.t;
    if (c.cmd === CANCEL_MARK) {
      const out = new Out();
      session.cancelPending(out);
      return { t: c.t, cmd: c.cmd, lines: out.lines };
    }
    return { t: c.t, cmd: c.cmd, lines: session.input(c.cmd).lines };
  });
}
