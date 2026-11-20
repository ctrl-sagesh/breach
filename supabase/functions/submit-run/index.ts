// submit-run: the only thing that writes to the leaderboard. Three actions in one function:
//   start  - issues a server-side run token (start time + a per-run seed) before an attempt begins.
//   submit - (default, no action field, for the original request shape) replays the command log through the
//            same engine the game uses (bundled into engine.js by scripts/build-edge.mjs) and stores the score
//            the replay produces. Never trusts a score from the browser. Requires a valid, unused run token.
//   health - inserts and deletes one row in health_check, for the keepalive workflow. Never touches the leaderboard.
// Deno runtime. Deploy with: npx supabase functions deploy submit-run --no-verify-jwt

import {
  MISSIONS,
  applyFlagVariation,
  checkToken,
  corsHeaders,
  dailyMission,
  nicknameProblem,
  parseAllowedOrigins,
  shiftDate,
  suspicionFor,
  utcDate,
  validateRun,
} from '../_shared/engine.js';

// Comma-separated list of exact origins or single-wildcard-subdomain patterns, e.g. 'https://a.test,https://*.b.test'.
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS') ?? '');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// The server-side key's env var name has changed across Supabase projects. Check whichever of these is actually set.
const SECRET_KEY_SOURCE = Deno.env.get('SUPABASE_SECRET_KEY') ? 'SUPABASE_SECRET_KEY' : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SUPABASE_SERVICE_ROLE_KEY' : null;
const SECRET_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Logged once at boot. Never logs a secret value, only whether each one is present and where the key came from.
console.log(`submit-run: boot. SUPABASE_URL=${SUPABASE_URL ? 'set' : 'MISSING'} secretKey=${SECRET_KEY_SOURCE ?? 'MISSING (checked SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY)'}`);

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_HITS = 60;
const MAX_BODY_BYTES = 200_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIERS = ['easy', 'medium', 'hard'];

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

/** Logs the real reason a write failed (PostgREST's own error body), so the generic reply to the caller still leaves a trail. */
async function logFailedWrite(label: string, res: Response): Promise<void> {
  const text = await res.text().catch(() => '<unreadable>');
  console.error(`submit-run: ${label} failed: ${res.status} ${text}`);
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

/** Inserts and deletes one throwaway row, proving the database can still write. Never touches the leaderboard. */
async function health(): Promise<{ ok: boolean; reason?: string }> {
  const created = await rest('health_check', { method: 'POST', body: JSON.stringify({}) });
  if (!created.ok) {
    await logFailedWrite('health insert', created);
    return { ok: false, reason: 'insert failed' };
  }
  const rows = (await created.json()) as { id: number }[];
  const id = rows[0]?.id;
  if (id === undefined) return { ok: false, reason: 'insert returned no row' };
  const deleted = await rest(`health_check?id=eq.${id}`, { method: 'DELETE' });
  if (!deleted.ok) {
    await logFailedWrite('health delete', deleted);
    return { ok: false, reason: 'delete failed' };
  }
  return { ok: true };
}

/** Finds which missions a daily or campaign claim may be replayed against, and the slot its run lives in. */
function missionsFor(scope: 'campaign' | 'daily', date: string | undefined): { missions: { id: string }[]; slot: string } | null {
  if (scope !== 'daily') return { missions: MISSIONS, slot: 'campaign' };
  const today = utcDate();
  if (!date || (date !== today && date !== shiftDate(today, -1))) return null;
  return { missions: [dailyMission(date)], slot: `daily:${date}` };
}

interface TokenRecord {
  id: string;
  player_id: string;
  mission_id: string;
  tier: string;
  scope: string;
  date: string | null;
  started_at: string;
  used_at: string | null;
  expires_at: string;
}

Deno.serve(async (req) => {
  // Computed per request: the allow-origin header echoes only the caller's origin, and only when it matches.
  // Guarded on its own: a request must still get a response (and CORS headers) even if this throws.
  let cors: Record<string, string>;
  try {
    cors = corsHeaders(req.headers.get('origin'), ALLOWED_ORIGINS);
  } catch (err) {
    console.error('submit-run: corsHeaders failed:', err);
    cors = {};
  }
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

  // Everything below can fail (a bad env var, a missing table or column, the database being unreachable). Whatever
  // breaks, the caller gets a clear JSON error instead of a bare 502, and the real cause goes to the function log.
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ ok: false, reason: 'POST only' }, 405);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, reason: 'request too large' }, 413);

    let body: {
      action?: 'start' | 'submit' | 'health';
      playerId?: string;
      nickname?: string;
      missionId?: string;
      tier?: 'easy' | 'medium' | 'hard';
      scope?: 'campaign' | 'daily';
      date?: string;
      run?: { missionId: string; tier: 'easy' | 'medium' | 'hard'; commands: { t: number; cmd: string; bs?: number }[]; claimedScore?: number; token?: string };
    };
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, reason: 'not JSON' }, 400);
    }

    if (!SUPABASE_URL || !SECRET_KEY) return json({ ok: false, reason: 'server is not configured' }, 503);

    if (body.action === 'health') {
      const result = await health();
      return json(result, result.ok ? 200 : 500);
    }

    if (typeof body.playerId !== 'string' || !UUID.test(body.playerId)) return json({ ok: false, reason: 'bad player id' }, 400);
    if (await rateLimited(body.playerId)) return json({ ok: false, reason: 'too many submissions. Try again later.' }, 429);

    if (body.action === 'start') {
      const missionId = body.missionId ?? '';
      const tier = body.tier ?? '';
      const scope = body.scope ?? 'campaign';
      if (!TIERS.includes(tier)) return json({ ok: false, reason: 'bad tier' }, 400);
      if (scope !== 'campaign' && scope !== 'daily') return json({ ok: false, reason: 'bad scope' }, 400);
      const found = missionsFor(scope, body.date);
      if (!found) return json({ ok: false, reason: 'that daily job has closed' }, 422);
      if (!found.missions.some((m) => m.id === missionId)) return json({ ok: false, reason: 'unknown mission' }, 422);

      const seed = Math.floor(Math.random() * 2 ** 31);
      const created = await rest('run_tokens', {
        method: 'POST',
        body: JSON.stringify({ player_id: body.playerId, mission_id: missionId, tier, scope, date: scope === 'daily' ? body.date : null, seed }),
      });
      if (!created.ok) {
        await logFailedWrite('token create', created);
        return json({ ok: false, reason: 'could not start the run' }, 502);
      }
      const rows = (await created.json()) as { id: string; seed: number }[];
      return json({ ok: true, token: rows[0].id, seed: rows[0].seed });
    }

    // Default action: submit.
    if (!body.run) return json({ ok: false, reason: 'missing run' }, 400);

    // Find or create the player. Nicknames are unique and set once.
    const existing = (await (await rest(`players?id=eq.${body.playerId}&select=id,nickname`)).json()) as { id: string; nickname: string }[];
    if (existing.length === 0) {
      const nickname = body.nickname ?? '';
      const problem = nicknameProblem(nickname);
      if (problem) return json({ ok: false, reason: problem }, 422);
      const created = await rest('players', { method: 'POST', body: JSON.stringify({ id: body.playerId, nickname }) });
      if (created.status === 409) return json({ ok: false, reason: 'that nickname is taken' }, 409);
      if (!created.ok) {
        await logFailedWrite('create player', created);
        return json({ ok: false, reason: 'could not create player' }, 502);
      }
    }

    const tokenId = body.run.token ?? '';
    if (!UUID.test(tokenId)) return json({ ok: false, reason: 'missing or invalid run token' }, 422);
    const tokenRows = (await (await rest(`run_tokens?id=eq.${tokenId}&select=*`)).json()) as TokenRecord[];
    const tokenRow = tokenRows[0];
    if (!tokenRow) return json({ ok: false, reason: 'missing or invalid run token' }, 422);

    const scope = body.scope === 'daily' ? 'daily' : 'campaign';
    const lastCommandMs = body.run.commands.length ? body.run.commands[body.run.commands.length - 1].t : 0;
    const tokenCheck = checkToken(
      {
        playerId: tokenRow.player_id,
        missionId: tokenRow.mission_id,
        tier: tokenRow.tier as 'easy' | 'medium' | 'hard',
        scope: tokenRow.scope as 'campaign' | 'daily',
        date: tokenRow.date,
        startedAt: Date.parse(tokenRow.started_at),
        usedAt: tokenRow.used_at ? Date.parse(tokenRow.used_at) : null,
        expiresAt: Date.parse(tokenRow.expires_at),
      },
      { playerId: body.playerId, missionId: body.run.missionId, tier: body.run.tier, scope, date: body.date },
      lastCommandMs,
      Date.now(),
    );
    if (!tokenCheck.ok) return json({ ok: false, reason: tokenCheck.reason }, 422);

    // Atomically claim the token. Zero rows back means another request already consumed it.
    const claimed = await rest(`run_tokens?id=eq.${tokenId}&used_at=is.null`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) });
    const claimedRows = claimed.ok ? ((await claimed.json()) as unknown[]) : [];
    if (!claimed.ok || claimedRows.length === 0) return json({ ok: false, reason: 'that run token has already been used' }, 422);

    // Which missions the run may be replayed against, built from the token's own stored claim, varied by its seed.
    const found = missionsFor(scope, tokenRow.date ?? undefined);
    if (!found) return json({ ok: false, reason: 'that daily job has closed' }, 422);
    const base = found.missions.find((m) => m.id === tokenRow.mission_id);
    if (!base) return json({ ok: false, reason: 'unknown mission' }, 422);
    const varied = applyFlagVariation(base, tokenRow.seed);

    const result = validateRun(body.run, [varied]);
    if (!result.ok) return json({ ok: false, reason: result.reason }, 422);

    const suspicion = suspicionFor(body.run, result);

    // Campaign: keep the best score per mission and tier. Daily: one attempt per day per tier.
    const slot = found.slot;
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
      suspicion: suspicion.score,
      suspicion_reasons: suspicion.reasons,
      // The checked command log, so the best run for a job can be watched. Only the typed text and timing are kept.
      commands: body.run.commands.map((c) => ({ t: c.t, cmd: c.cmd })),
    };
    const write = mine.length
      ? await rest(`runs?id=eq.${mine[0].id}`, { method: 'PATCH', body: JSON.stringify(row) })
      : await rest('runs', { method: 'POST', body: JSON.stringify(row) });
    if (!write.ok) {
      await logFailedWrite('run write', write);
      return json({ ok: false, reason: 'could not save the run' }, 502);
    }

    return json({ ok: true, improved: true, score: result.score, points: result.points, seconds: result.seconds, trace: result.trace, hints: result.hints });
  } catch (err) {
    console.error('submit-run: unhandled error:', err instanceof Error ? (err.stack ?? err.message) : err);
    return json({ ok: false, reason: 'internal error, please try again' }, 500);
  }
});
