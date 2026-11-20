// startRun's cold-start retry, and the player-id bug where a recovery-key restore left getPlayerId() still
// returning the fresh id this device made up for itself before the restore — which belongs to no account,
// so submitting under it collides with the real account's nickname. Network calls are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A minimal in-memory Storage, enough for getPlayerId/setPlayerId under Node. */
function fakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

async function loadWithEnv(configured: boolean, localStorage: Storage | undefined = undefined) {
  vi.resetModules();
  if (configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, localStorage });
  return import('../src/lib/leaderboard');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('startRun: cold-start retry', () => {
  it('retries once after a failed first attempt and returns the token from the second', async () => {
    const mod = await loadWithEnv(true);
    let calls = 0;
    vi.stubGlobal('fetch', (async () => {
      calls++;
      if (calls === 1) throw new TypeError('network timeout');
      return reply(200, { ok: true, token: 'tok-1', seed: 42 });
    }) as Fetch);
    const started = await mod.startRun({ playerId: 'p1', missionId: 'm01-dead-drop', tier: 'medium', scope: 'campaign' });
    expect(calls).toBe(2);
    expect(started).toEqual({ token: 'tok-1', seed: 42 });
  });

  it('returns null only once both attempts fail', async () => {
    const mod = await loadWithEnv(true);
    let calls = 0;
    vi.stubGlobal('fetch', (async () => {
      calls++;
      throw new TypeError('network down');
    }) as Fetch);
    const started = await mod.startRun({ playerId: 'p1', missionId: 'm01-dead-drop', tier: 'medium', scope: 'campaign' });
    expect(calls).toBe(2);
    expect(started).toBeNull();
  });

  it('fails closed immediately, with no network call, when the board is not configured', async () => {
    const mod = await loadWithEnv(false);
    let calls = 0;
    vi.stubGlobal('fetch', (async () => {
      calls++;
      return reply(200, {});
    }) as Fetch);
    const started = await mod.startRun({ playerId: 'p1', missionId: 'm01-dead-drop', tier: 'medium', scope: 'campaign' });
    expect(started).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('player id: a restore adopts the account id', () => {
  it('setPlayerId overwrites what getPlayerId returns afterwards', async () => {
    const storage = fakeLocalStorage();
    const mod = await loadWithEnv(true, storage);
    const freshId = mod.getPlayerId(); // as if this were a brand-new browser, before any restore
    expect(storage.getItem('breach.player')).toBe(freshId);

    const serverId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    mod.setPlayerId(serverId);
    expect(mod.getPlayerId()).toBe(serverId);
    expect(mod.getPlayerId()).not.toBe(freshId);
  });

  it('restore on a fresh device, then submit, must succeed: the submission uses the restored id, not the device\'s own', async () => {
    const storage = fakeLocalStorage();
    const mod = await loadWithEnv(true, storage);

    // A fresh browser makes up its own id the first time anything asks for one.
    const freshId = mod.getPlayerId();
    // adoptRestored's fix: adopt the account's real id once a recovery key resolves.
    const serverId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    mod.setPlayerId(serverId);

    let seenPlayerId: string | null = null;
    vi.stubGlobal('fetch', (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { playerId?: string };
      seenPlayerId = body.playerId ?? null;
      // What the server would actually do: the stale fresh id has never submitted, so it tries to create a
      // new player row with the restored nickname — which the real account already holds.
      if (body.playerId === freshId) return reply(409, { ok: false, reason: 'that nickname is taken' });
      return reply(200, { ok: true, improved: true, score: 900, points: 900 });
    }) as Fetch);

    const sub = mod.buildSubmission({
      playerId: mod.getPlayerId(),
      nickname: 'restored-handle',
      scope: 'campaign',
      missionId: 'm01-dead-drop',
      tier: 'medium',
      commands: [{ t: 0, cmd: 'scan' }],
      token: 'tok-1',
    });
    const result = await mod.submitRun(sub);

    expect(seenPlayerId).toBe(serverId);
    expect(seenPlayerId).not.toBe(freshId);
    expect(result.status).toBe('saved');
  });
});
