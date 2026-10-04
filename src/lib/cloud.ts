// Cloud save client. Talks to the account Edge Function (register, restore, sync, rename). The local save stays the
// source of truth: every call here either succeeds and returns what the server holds, or says it is offline, and the
// game carries on with the local copy.

import type { SaveData } from './save';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const TIMEOUT_MS = 10000;

export function cloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && PUBLISHABLE_KEY);
}

export type CloudResult<T> = { ok: true; value: T } | { ok: false; offline: boolean; reason: string };

async function call<T>(body: Record<string, unknown>): Promise<CloudResult<T>> {
  if (!cloudConfigured()) return { ok: false, offline: true, reason: 'Cloud save is not set up on this build.' };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/account`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as { ok: boolean; reason?: string } & Record<string, unknown>;
    if (!data.ok) return { ok: false, offline: false, reason: data.reason ?? 'The server said no.' };
    return { ok: true, value: data as unknown as T };
  } catch {
    return { ok: false, offline: true, reason: 'Cloud save is offline. Your progress is safe on this device and will sync later.' };
  } finally {
    window.clearTimeout(timer);
  }
}

export interface RegisterResult {
  recoveryKey: string;
  syncToken: string;
}

/** Creates the cloud account for this player and returns the recovery key, shown once. */
export function registerAccount(playerId: string, nickname: string, save: SaveData): Promise<CloudResult<RegisterResult>> {
  return call<RegisterResult>({ action: 'register', playerId, nickname, save });
}

export interface RestoreResult {
  playerId: string;
  nickname: string;
  syncToken: string;
  save: SaveData | null;
}

/** Restores the account behind a recovery key onto this device. */
export function restoreAccount(recoveryKey: string): Promise<CloudResult<RestoreResult>> {
  return call<RestoreResult>({ action: 'restore', recoveryKey });
}

/** Pushes this device's save and gets back the merged copy. */
export function syncSave(playerId: string, syncToken: string, save: SaveData): Promise<CloudResult<{ save: SaveData }>> {
  return call<{ save: SaveData }>({ action: 'sync', playerId, syncToken, save });
}

export function renameAccount(playerId: string, syncToken: string, nickname: string): Promise<CloudResult<{ nickname: string }>> {
  return call<{ nickname: string }>({ action: 'rename', playerId, syncToken, nickname });
}

/** Debounce for sync: several changes in a short time send one request. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}
