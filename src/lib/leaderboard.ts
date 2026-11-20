// Leaderboard client. Reads boards straight from Supabase (the database only allows reads), and sends finished runs
// to the submit-run Edge Function. The browser never sends a score: only the command log, with timing.
// Everything degrades to "offline". Local scores always save first, so the game works with Supabase down or unset.

import type { Tier } from '../engine/types';
import type { RunCommand, RunLog } from '../engine/replay';

// These are read at build time. Set them in .env.local for development, and in Vercel's settings for production.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const TIMEOUT_MS = 8000;
/**
 * A cold-started Edge Function can take noticeably longer than its ~1.3s warm response; this needs to be
 * generous because the whole point is to call it early (while the player is still on the briefing or daily
 * screen, before the mission starts) and let it finish in the background. startRun also retries once.
 */
const START_TIMEOUT_MS = 10_000;
const PLAYER_KEY = 'breach.player';

export function leaderboardConfigured(): boolean {
  return Boolean(SUPABASE_URL && PUBLISHABLE_KEY);
}

/** An anonymous id kept on this device. Not tied to a name, an account or an email. */
export function getPlayerId(): string {
  try {
    const saved = window.localStorage.getItem(PLAYER_KEY);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const id = newUuid();
    window.localStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    // Storage is blocked. The id lasts for this page visit only.
    return newUuid();
  }
}

/**
 * Overwrites the local player id. Used only after a recovery-key restore adopts the server's real id for
 * that account — the id getPlayerId() would otherwise keep returning is a fresh one this device generated
 * for itself before the restore, which belongs to no account and would collide on nickname at submit time.
 * Every later getPlayerId() call (run tokens, submissions) uses this id from then on.
 */
export function setPlayerId(id: string): void {
  try {
    window.localStorage.setItem(PLAYER_KEY, id);
  } catch {
    // Storage is blocked; getPlayerId() already falls back to a page-visit-only id in that case.
  }
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What the browser sends. There is deliberately no score field. */
export interface Submission {
  playerId: string;
  nickname: string;
  scope: 'campaign' | 'daily';
  date?: string;
  run: RunLog;
}

/** Builds the request body from a finished attempt's command log. Pure, so tests can check exactly what leaves the browser. */
export function buildSubmission(input: {
  playerId: string;
  nickname: string;
  scope: 'campaign' | 'daily';
  date?: string;
  missionId: string;
  tier: Tier;
  commands: RunCommand[];
  /** The token this attempt was started with, if any. Omitted when the run can't be posted (see submitRun). */
  token?: string;
}): Submission {
  return {
    playerId: input.playerId,
    nickname: input.nickname,
    scope: input.scope,
    date: input.date,
    run: { missionId: input.missionId, tier: input.tier, commands: input.commands.map((c) => ({ t: c.t, cmd: c.cmd, bs: c.bs })), token: input.token },
  };
}

export type SubmitResult =
  | { status: 'saved'; score: number; points: number; improved: boolean }
  | { status: 'rejected'; reason: string }
  | { status: 'offline'; reason: string };

async function withTimeout(url: string, init: RequestInit, ms = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function headers(): Record<string, string> {
  return { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json' };
}

export interface StartedRun {
  token: string;
  seed: number;
}

async function startRunOnce(input: { playerId: string; missionId: string; tier: Tier; scope: 'campaign' | 'daily'; date?: string }): Promise<StartedRun | null> {
  try {
    const res = await withTimeout(
      `${SUPABASE_URL}/functions/v1/submit-run`,
      { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'start', ...input }) },
      START_TIMEOUT_MS,
    );
    const body = (await res.json()) as { ok: boolean; token?: string; seed?: number };
    if (!body.ok || !body.token || typeof body.seed !== 'number') return null;
    return { token: body.token, seed: body.seed };
  } catch {
    return null;
  }
}

/**
 * Asks the server for a run token before an attempt begins. The token pins a server-side start time and a
 * per-run seed (for flag variation). Retries once on any failure (a timeout, including a cold-started
 * function, or a network error) before giving up. Returns null only once both tries fail, or when the board
 * isn't configured — never throws. A run started without a token still plays normally; it just can't be
 * posted (see submitRun). Callers should start this as early as possible (when the briefing or daily screen
 * opens, not when the mission actually starts) so a cold start has time to finish in the background.
 */
export async function startRun(input: { playerId: string; missionId: string; tier: Tier; scope: 'campaign' | 'daily'; date?: string }): Promise<StartedRun | null> {
  if (!leaderboardConfigured()) return null;
  return (await startRunOnce(input)) ?? (await startRunOnce(input));
}

/** Sends a finished run for checking. Returns what the server decided. */
export async function submitRun(sub: Submission): Promise<SubmitResult> {
  if (!leaderboardConfigured()) return { status: 'offline', reason: 'The global board is not set up on this build.' };
  if (!sub.run.token) return { status: 'offline', reason: "Couldn't reach the board when this run started, so it only saved locally." };
  try {
    const res = await withTimeout(`${SUPABASE_URL}/functions/v1/submit-run`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(sub),
    });
    const body = (await res.json()) as { ok: boolean; reason?: string; score?: number; points?: number; improved?: boolean };
    if (!body.ok) return { status: 'rejected', reason: body.reason ?? 'The run was not accepted.' };
    return { status: 'saved', score: body.score ?? 0, points: body.points ?? 0, improved: Boolean(body.improved) };
  } catch {
    return { status: 'offline', reason: 'The global board is offline. Your score is saved on this device.' };
  }
}

export interface CampaignRow {
  nickname: string;
  points: number;
  missions: number;
  avg_score: number;
}

export interface MissionRow {
  nickname: string;
  score: number;
  seconds: number;
  trace: number;
  hints: number;
}

/** Top campaign totals for a tier. Throws when offline, so the screen can say so. */
export async function fetchCampaignBoard(tier: Tier, limit = 50): Promise<CampaignRow[]> {
  const res = await withTimeout(
    `${SUPABASE_URL}/rest/v1/campaign_totals?tier=eq.${tier}&select=nickname,points,missions,avg_score&order=points.desc&limit=${limit}`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`board ${res.status}`);
  return (await res.json()) as CampaignRow[];
}

/** Top scores for one job on one tier, or one daily. */
export async function fetchMissionBoard(missionId: string, tier: Tier, slot: string, limit = 50): Promise<MissionRow[]> {
  const res = await withTimeout(
    `${SUPABASE_URL}/rest/v1/runs?select=score,seconds,trace,hints,players(nickname)&mission_id=eq.${encodeURIComponent(missionId)}&tier=eq.${tier}&slot=eq.${encodeURIComponent(slot)}&order=score.desc&limit=${limit}`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`board ${res.status}`);
  const rows = (await res.json()) as { score: number; seconds: number; trace: number; hints: number; players: { nickname: string } | null }[];
  return rows.map((r) => ({ nickname: r.players?.nickname ?? '???', score: r.score, seconds: r.seconds, trace: r.trace, hints: r.hints }));
}

/**
 * Your place on the campaign board for a tier. Null unless you have a submitted campaign score on that tier,
 * so a board with nobody on it never shows a place.
 */
export async function fetchMyRank(playerId: string, tier: Tier): Promise<number | null> {
  const mine = await withTimeout(`${SUPABASE_URL}/rest/v1/campaign_totals?player_id=eq.${playerId}&tier=eq.${tier}&select=points`, {
    headers: headers(),
  });
  if (!mine.ok) throw new Error(`totals ${mine.status}`);
  const rows = (await mine.json()) as { points: number }[];
  if (rows.length === 0) return null;

  const res = await withTimeout(`${SUPABASE_URL}/rest/v1/rpc/player_rank`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_player: playerId, p_tier: tier }),
  });
  if (!res.ok) throw new Error(`rank ${res.status}`);
  const rank = (await res.json()) as number;
  return typeof rank === 'number' ? rank : null;
}

export interface TopRun {
  nickname: string;
  score: number;
  commands: RunCommand[];
}

/** The best campaign run on the board for one job and tier, with its command log. Null when nobody has one yet. */
export async function fetchTopRun(missionId: string, tier: Tier): Promise<TopRun | null> {
  const res = await withTimeout(
    `${SUPABASE_URL}/rest/v1/runs?select=score,commands,players(nickname)&mission_id=eq.${encodeURIComponent(missionId)}&tier=eq.${tier}&slot=eq.campaign&commands=not.is.null&order=score.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`top run ${res.status}`);
  const rows = (await res.json()) as { score: number; commands: RunCommand[]; players: { nickname: string } | null }[];
  const top = rows[0];
  if (!top) return null;
  return { nickname: top.players?.nickname ?? '???', score: top.score, commands: top.commands };
}
