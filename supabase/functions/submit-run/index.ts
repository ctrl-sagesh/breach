// submit-run: the only thing that writes to the leaderboard.
// It never trusts a score from the browser. It replays the command log through the same engine the game uses
// (bundled into engine.js by scripts/build-edge.mjs), and stores the score the replay produces.
// Deno runtime. Deploy with: npx supabase functions deploy submit-run --no-verify-jwt

import { MISSIONS, corsHeaders, dailyMission, nicknameProblem, parseAllowedOrigins, shiftDate, utcDate, validateRun } from '../_shared/engine.js';

// Comma-separated list of exact origins or single-wildcard-subdomain patterns, e.g. 'https://a.test,https://*.b.test'.
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS') ?? '');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// The server-side key. The name depends on the project's key setup, so check the function secrets in the dashboard.
const SECRET_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_HITS = 60;
const MAX_BODY_BYTES = 200_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Calls the Supabase REST API with the server-side key. Used only for the tables browsers cannot write to. */
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SECRET_KEY,
      authorization: `Bearer ${SECRET_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
}

async function rateLimited(playerId: string): Promise<boolean> {
  const res = await rest(`rate_limits?player_id=eq.${playerId}&select=*`);
  const rows = (await res.json()) as { window_start: string; hits: number }[];
  const now = Date.now();
  const row = rows[0];
  const fresh = !row || now - Date.parse(row.window_start) > RATE_WINDOW_MS;
  const hits = fresh ? 1 : row.hits + 1;
  const windowStart = fresh ? new Date(now).toISOString() : row.window_start;
  await rest('rate_limits', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ player_id: playerId, window_start: windowStart, hits }),
  });
  return !fresh && hits > RATE_MAX_HITS;
}

Deno.serve(async (req) => {
  // Computed per request: the allow-origin header echoes only the caller's origin, and only when it matches.
  const cors = corsHeaders(req.headers.get('origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'POST only' }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, reason: 'request too large' }, 413);

  let body: {
    playerId?: string;
    nickname?: string;
    scope?: 'campaign' | 'daily';
    date?: string;
    run?: { missionId: string; tier: 'easy' | 'medium' | 'hard'; commands: { t: number; cmd: string }[]; claimedScore?: number };
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, reason: 'not JSON' }, 400);
  }

  if (typeof body.playerId !== 'string' || !UUID.test(body.playerId)) return json({ ok: false, reason: 'bad player id' }, 400);
  if (!body.run) return json({ ok: false, reason: 'missing run' }, 400);
  if (!SUPABASE_URL || !SECRET_KEY) return json({ ok: false, reason: 'server is not configured' }, 503);

  if (await rateLimited(body.playerId)) return json({ ok: false, reason: 'too many submissions. Try again later.' }, 429);

  // Find or create the player. Nicknames are unique and set once.
  const existing = (await (await rest(`players?id=eq.${body.playerId}&select=id,nickname`)).json()) as { id: string; nickname: string }[];
  if (existing.length === 0) {
    const nickname = body.nickname ?? '';
    const problem = nicknameProblem(nickname);
    if (problem) return json({ ok: false, reason: problem }, 422);
    const created = await rest('players', { method: 'POST', body: JSON.stringify({ id: body.playerId, nickname }) });
    if (created.status === 409) return json({ ok: false, reason: 'that nickname is taken' }, 409);
    if (!created.ok) return json({ ok: false, reason: 'could not create player' }, 502);
  }

  // Which missions the run may be replayed against. Daily runs regenerate the job from the UTC date.
  const today = utcDate();
  let missions: readonly (typeof MISSIONS)[number][] = MISSIONS;
  let slot = 'campaign';
  if (body.scope === 'daily') {
    const date = body.date ?? today;
    if (date !== today && date !== shiftDate(today, -1)) return json({ ok: false, reason: 'that daily job has closed' }, 422);
    missions = [dailyMission(date)];
    slot = `daily:${date}`;
  }

  const result = validateRun(body.run, missions);
  if (!result.ok) return json({ ok: false, reason: result.reason }, 422);

  // Campaign: keep the best score per mission and tier. Daily: one attempt per day per tier.
  const mine = (await (await rest(
    `runs?player_id=eq.${body.playerId}&mission_id=eq.${body.run.missionId}&tier=eq.${body.run.tier}&slot=eq.${slot}&select=id,score`,
  )).json()) as { id: number; score: number }[];
  if (slot.startsWith('daily:') && mine.length > 0) return json({ ok: false, reason: 'you have already attempted this daily on this tier' }, 409);
  if (mine.length > 0 && mine[0].score >= result.score) {
    return json({ ok: true, improved: false, score: result.score, points: result.points, seconds: result.seconds, trace: result.trace, hints: result.hints });
  }

  const row = {
    player_id: body.playerId,
    mission_id: body.run.missionId,
    tier: body.run.tier,
    slot,
    score: result.score,
    points: result.points,
    seconds: result.seconds,
    trace: result.trace,
    hints: result.hints,
    // The checked command log, so the best run for a job can be watched. Only the typed text and timing are kept.
    commands: body.run.commands.map((c) => ({ t: c.t, cmd: c.cmd })),
  };
  const write = mine.length
    ? await rest(`runs?id=eq.${mine[0].id}`, { method: 'PATCH', body: JSON.stringify(row) })
    : await rest('runs', { method: 'POST', body: JSON.stringify(row) });
  if (!write.ok) return json({ ok: false, reason: 'could not save the run' }, 502);

  return json({ ok: true, improved: true, score: result.score, points: result.points, seconds: result.seconds, trace: result.trace, hints: result.hints });
});
