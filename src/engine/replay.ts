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
  /** Backspace/delete keystrokes typed while composing this line. Used only as a soft suspicion signal. */
  bs?: number;
}

export interface RunLog {
  missionId: string;
  tier: Tier;
  commands: RunCommand[];
  /** Optional. If the client sends one, it must match the replayed score exactly, or the run is rejected. */
  claimedScore?: number;
  /** The server-issued run token this attempt was started with. Required to post a run; see checkToken. */
  token?: string;
}

export type ReplayResult =
  | {
      ok: true;
      score: number;
      points: number;
      seconds: number;
      trace: number;
      hints: number;
      endingId: string | null;
      usedAliases: boolean;
      usedPipe: boolean;
      /** How many commands produced an error-kind line. A soft suspicion signal: see suspicionFor. */
      errorCommands: number;
    }
  | { ok: false; reason: string };

export const RUN_LIMITS = {
  maxCommands: 2000,
  maxCommandLength: 300,
  /** Two commands cannot land closer together than this. Faster than a person can type or paste one by one. */
  minGapMs: 120,
  /**
   * Averaged over the whole run. A fast player who already knows a mission can clear 300-600ms a command
   * with no reading time at all, so this sits well under that, not at a "typical" human pace: it exists to
   * catch a script whose gaps sit just above minGapMs on every single command, not to second-guess a quick player.
   */
  minAverageMs: 200,
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
  let errorCommands = 0;
  const session = new GameSession(mission, { tier: run.tier, now: () => clock });
  for (const c of run.commands) {
    if (session.finished) return fail('commands after the attempt ended');
    clock = c.t;
    let out: Out;
    if (c.cmd === CANCEL_MARK) {
      out = new Out();
      session.cancelPending(out);
    } else {
      out = session.input(c.cmd);
    }
    if (out.lines.some((l) => l.kind === 'err')) errorCommands++;
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
    errorCommands,
  };
}

/** The server's side of a run-token check. Hard rejects only — see RUN_LIMITS for the pre-existing timing checks. */
export interface TokenRow {
  playerId: string;
  missionId: string;
  tier: Tier;
  scope: 'campaign' | 'daily';
  /** The daily's UTC date, or null for a campaign token. */
  date: string | null;
  /** Epoch ms when the server issued the token. */
  startedAt: number;
  /** Epoch ms when the token was consumed, or null if unused. */
  usedAt: number | null;
  /** Epoch ms when the token stops being valid. */
  expiresAt: number;
}

export interface TokenClaim {
  playerId: string;
  missionId: string;
  tier: Tier;
  scope: 'campaign' | 'daily';
  date?: string;
}

/** Clock skew and request latency allowance for the server-elapsed-vs-claimed-duration check. */
export const TOKEN_TOLERANCE_MS = 5000;

/**
 * Checks a run token against the run it's being used to post. `lastCommandMs` is the run's own claimed
 * duration (the last command's `t`). `nowMs` is the server's clock at submit time. Every failure here is a
 * hard reject: a missing, reused, expired, mismatched or physically-impossible token.
 */
export function checkToken(token: TokenRow, claim: TokenClaim, lastCommandMs: number, nowMs: number): { ok: true } | { ok: false; reason: string } {
  if (token.usedAt !== null) return { ok: false, reason: 'that run token has already been used' };
  if (nowMs > token.expiresAt) return { ok: false, reason: 'that run token has expired' };
  if (token.playerId !== claim.playerId) return { ok: false, reason: 'that run token belongs to a different player' };
  if (token.missionId !== claim.missionId || token.tier !== claim.tier) return { ok: false, reason: 'that run token was issued for a different mission' };
  if (token.scope !== claim.scope || (token.date ?? undefined) !== claim.date) return { ok: false, reason: 'that run token was issued for a different attempt' };
  const serverElapsed = nowMs - token.startedAt;
  if (serverElapsed < lastCommandMs - TOKEN_TOLERANCE_MS) return { ok: false, reason: 'impossible timing: the server saw less time pass than the run claims' };
  return { ok: true };
}

/** A run is hidden from the public board (but kept, and still visible to its own player) at or above this suspicion. */
export const SUSPICION_HIDE_THRESHOLD = 70; // keep in sync with the RLS policy in the run_tokens migration

export interface SuspicionResult {
  score: number;
  reasons: string[];
}

/** Below this many commands, timing/correction signals are too noisy to mean anything. */
const SUSPICION_MIN_COMMANDS = 8;

/**
 * Soft signals only: never a reason to reject a run, only to keep it off the public top 10 pending review.
 * A legitimate, skilled, fast player can trip one of these; the score and reasons are there so a human can
 * look at the run (see the flagged_runs view) and clear it.
 */
export function suspicionFor(run: RunLog, result: Extract<ReplayResult, { ok: true }>): SuspicionResult {
  const reasons: string[] = [];
  let score = 0;
  const commands = run.commands;
  if (commands.length >= SUSPICION_MIN_COMMANDS) {
    const gaps: number[] = [];
    for (let i = 1; i < commands.length; i++) gaps.push(commands[i].t - commands[i - 1].t);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
    if (mean > 0 && Math.sqrt(variance) / mean < 0.15) {
      score += 40;
      reasons.push('unusually regular timing between commands');
    }

    if (commands.every((c) => (c.bs ?? 0) === 0)) {
      score += 25;
      reasons.push('no corrections typed in the whole run');
    }

    if (result.errorCommands === 0) {
      score += 15;
      reasons.push('no mistyped or rejected commands in the whole run');
    }
  }
  return { score: Math.min(100, score), reasons };
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
