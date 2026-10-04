// The board shows a place only when the player has posted. The cloud client degrades to offline, and reports server
// refusals (such as rate limits) as they are. Network calls are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function loadWithEnv(configured: boolean, path = '../src/lib/leaderboard') {
  vi.resetModules();
  if (configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
  return import(path);
}

beforeEach(() => {
  // The clients use window timers. A minimal stand-in is enough under Node.
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, localStorage: undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('board place', () => {
  it('shows no place when the player has never posted, and makes no ranking call', async () => {
    const mod = await loadWithEnv(true);
    const calls: string[] = [];
    vi.stubGlobal('fetch', (async (url: string) => {
      calls.push(url);
      return reply(200, []);
    }) as Fetch);
    expect(await mod.fetchMyRank('0f1e2d3c-0000-4000-8000-000000000001', 'medium')).toBeNull();
    expect(calls.some((u) => u.includes('player_rank'))).toBe(false);
  });

  it('shows the place once the player has a campaign score on that tier', async () => {
    const mod = await loadWithEnv(true);
    vi.stubGlobal('fetch', (async (url: string) => {
      if (url.includes('campaign_totals')) return reply(200, [{ points: 4200 }]);
      return reply(200, 3);
    }) as Fetch);
    expect(await mod.fetchMyRank('0f1e2d3c-0000-4000-8000-000000000001', 'medium')).toBe(3);
  });
});

describe('cloud client', () => {
  it('reports offline, not an error, when cloud save is not configured', async () => {
    const mod = await loadWithEnv(false, '../src/lib/cloud');
    const r = await mod.restoreAccount('GHOST-AMBER-FALCON-CEDAR-7419');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.offline).toBe(true);
  });

  it('reports offline when the network fails', async () => {
    const mod = await loadWithEnv(true, '../src/lib/cloud');
    vi.stubGlobal('fetch', (async () => {
      throw new TypeError('network down');
    }) as Fetch);
    const r = await mod.restoreAccount('GHOST-AMBER-FALCON-CEDAR-7419');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.offline).toBe(true);
  });

  it('passes the server refusal on as the reason, such as a rate limit', async () => {
    const mod = await loadWithEnv(true, '../src/lib/cloud');
    vi.stubGlobal('fetch', (async () => reply(429, { ok: false, reason: 'too many attempts. Try again later.' })) as Fetch);
    const r = await mod.restoreAccount('GHOST-AMBER-FALCON-CEDAR-7419');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.offline).toBe(false);
      expect(r.reason).toMatch(/too many attempts/);
    }
  });

  it('a successful restore returns the server copy', async () => {
    const mod = await loadWithEnv(true, '../src/lib/cloud');
    vi.stubGlobal('fetch', (async () => reply(200, { ok: true, playerId: 'p', nickname: 'ghost', syncToken: 't', save: null })) as Fetch);
    const r = await mod.restoreAccount('GHOST-AMBER-FALCON-CEDAR-7419');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.nickname).toBe('ghost');
  });
});
