// account: registration, restore by recovery key, cloud sync and rename. The only code that writes accounts or saves.
// Deno runtime. Deploy with: npx supabase functions deploy account --no-verify-jwt
//
// Recovery keys are stored as a keyed hash (HMAC with a server-side pepper). Sync tokens are stored as a SHA-256 hash.
// Restore and sync are rate limited through auth_attempts, and every save is checked for size before it is stored.

import { admit, generateRecoveryKey, isWellFormedKey, mergeSaves, normalizeRecoveryKey, nicknameProblem, RESTORE_LIMIT } from './engine.js';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PEPPER = Deno.env.get('RECOVERY_PEPPER') ?? '';

const MAX_BODY_BYTES = 2_000_000;
const SYNC_LIMIT = { windowMs: 60 * 60 * 1000, max: 240 };
const GLOBAL_RESTORE_LIMIT = { windowMs: 60 * 60 * 1000, max: 500 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-headers': 'content-type, apikey, authorization',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const enc = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

function newSyncToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes.buffer);
}

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

/** Counts an attempt in a bucket. Returns false when the bucket is over its limit. Refused attempts still count. */
async function allow(bucket: string, opts: { windowMs: number; max: number }): Promise<boolean> {
  const rows = (await (await rest(`auth_attempts?bucket=eq.${encodeURIComponent(bucket)}&select=*`)).json()) as { window_start: string; hits: number }[];
  const row = rows[0];
  const result = admit(row ? { windowStart: Date.parse(row.window_start), hits: row.hits } : null, Date.now(), opts);
  await rest('auth_attempts', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ bucket, window_start: new Date(result.next.windowStart).toISOString(), hits: result.next.hits }),
  });
  return result.allowed;
}

async function playerById(id: string): Promise<{ id: string; nickname: string; key_hash: string | null; token_hash: string | null; save: unknown } | null> {
  const rows = (await (await rest(`players?id=eq.${id}&select=id,nickname,key_hash,token_hash,save`)).json()) as never[];
  return rows[0] ?? null;
}

async function verifyToken(playerId: string, token: string) {
  const player = await playerById(playerId);
  if (!player || !player.token_hash) return null;
  return (await sha256(token)) === player.token_hash ? player : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, reason: 'POST only' }, 405);
  if (!SUPABASE_URL || !SECRET_KEY || !PEPPER) return json({ ok: false, reason: 'server is not configured' }, 503);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, reason: 'save is too large' }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, reason: 'not JSON' }, 400);
  }

  switch (body.action) {
    case 'register': {
      const playerId = String(body.playerId ?? '');
      const nickname = String(body.nickname ?? '');
      if (!UUID.test(playerId)) return json({ ok: false, reason: 'bad player id' }, 400);
      const problem = nicknameProblem(nickname);
      if (problem) return json({ ok: false, reason: problem }, 422);

      const existing = await playerById(playerId);
      if (existing?.key_hash) return json({ ok: false, reason: 'this handle already has a recovery key' }, 409);

      // Keys are random, so a clash is vanishingly rare. Retry a few times anyway, to be safe.
      let recoveryKey = '';
      let keyHash = '';
      for (let i = 0; i < 5; i++) {
        recoveryKey = generateRecoveryKey(() => {
          const b = new Uint32Array(1);
          crypto.getRandomValues(b);
          return b[0] / 4294967296;
        });
        keyHash = await hmac(normalizeRecoveryKey(recoveryKey));
        const taken = (await (await rest(`players?key_hash=eq.${keyHash}&select=id`)).json()) as unknown[];
        if (taken.length === 0) break;
      }

      const syncToken = newSyncToken();
      const row = {
        id: playerId,
        nickname,
        key_hash: keyHash,
        token_hash: await sha256(syncToken),
        save: body.save ?? null,
        save_updated_at: new Date().toISOString(),
      };
      const write = existing
        ? await rest(`players?id=eq.${playerId}`, { method: 'PATCH', body: JSON.stringify({ ...row, id: undefined }) })
        : await rest('players', { method: 'POST', body: JSON.stringify(row) });
      if (write.status === 409) return json({ ok: false, reason: 'that handle is taken' }, 409);
      if (!write.ok) return json({ ok: false, reason: 'could not register' }, 502);

      return json({ ok: true, recoveryKey, syncToken });
    }

    case 'restore': {
      // Two buckets: per caller address, and one for the whole service, so spreading attempts across addresses also runs out.
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
      const perCaller = await allow(`restore:${await sha256(ip)}`, RESTORE_LIMIT);
      const overall = await allow('restore:global', GLOBAL_RESTORE_LIMIT);
      if (!perCaller || !overall) return json({ ok: false, reason: 'too many attempts. Try again later.' }, 429);

      const typed = String(body.recoveryKey ?? '');
      if (!isWellFormedKey(typed)) return json({ ok: false, reason: 'that does not look like a recovery key' }, 422);
      const keyHash = await hmac(normalizeRecoveryKey(typed));
      const rows = (await (await rest(`players?key_hash=eq.${keyHash}&select=id,nickname,save`)).json()) as { id: string; nickname: string; save: unknown }[];
      if (rows.length === 0) return json({ ok: false, reason: 'no save matches that key' }, 404);

      // A new sync token for this device. The old device's token stops working, which keeps only one live session.
      const syncToken = newSyncToken();
      await rest(`players?id=eq.${rows[0].id}`, { method: 'PATCH', body: JSON.stringify({ token_hash: await sha256(syncToken) }) });
      return json({ ok: true, playerId: rows[0].id, nickname: rows[0].nickname, syncToken, save: rows[0].save ?? null });
    }

    case 'sync': {
      const playerId = String(body.playerId ?? '');
      const token = String(body.syncToken ?? '');
      if (!UUID.test(playerId) || !token) return json({ ok: false, reason: 'missing player or token' }, 400);
      if (!(await allow(`sync:${playerId}`, SYNC_LIMIT))) return json({ ok: false, reason: 'syncing too often. Try again later.' }, 429);
      const player = await verifyToken(playerId, token);
      if (!player) return json({ ok: false, reason: 'this device is not signed in to that save' }, 401);

      const local = body.save as Parameters<typeof mergeSaves>[0] | undefined;
      const remote = (player.save as Parameters<typeof mergeSaves>[1] | null) ?? null;
      // Pull only: the server copy goes back as it is. Push: merge both sides, then store the result.
      const merged = local && remote ? mergeSaves(local, remote) : local ?? remote;
      if (!merged) return json({ ok: false, reason: 'nothing to sync' }, 400);
      if (local) {
        const write = await rest(`players?id=eq.${playerId}`, {
          method: 'PATCH',
          body: JSON.stringify({ save: merged, save_updated_at: new Date().toISOString() }),
        });
        if (!write.ok) return json({ ok: false, reason: 'could not store the save' }, 502);
      }
      return json({ ok: true, save: merged });
    }

    case 'rename': {
      const playerId = String(body.playerId ?? '');
      const token = String(body.syncToken ?? '');
      const nickname = String(body.nickname ?? '');
      if (!UUID.test(playerId) || !token) return json({ ok: false, reason: 'missing player or token' }, 400);
      const problem = nicknameProblem(nickname);
      if (problem) return json({ ok: false, reason: problem }, 422);
      if (!(await verifyToken(playerId, token))) return json({ ok: false, reason: 'this device is not signed in to that save' }, 401);
      const write = await rest(`players?id=eq.${playerId}`, { method: 'PATCH', body: JSON.stringify({ nickname }) });
      if (write.status === 409) return json({ ok: false, reason: 'that handle is taken' }, 409);
      if (!write.ok) return json({ ok: false, reason: 'could not rename' }, 502);
      return json({ ok: true, nickname });
    }

    default:
      return json({ ok: false, reason: 'unknown action' }, 400);
  }
});
