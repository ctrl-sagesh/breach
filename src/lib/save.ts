// Save system (version 2). One localStorage key. Every access is wrapped in try/catch, because storage can be
// missing, full or blocked. The game still works without it.
// Progress and best scores are kept separately per difficulty tier.

import type { MissionResult } from '../engine/scoring';
import { isTier } from '../engine/difficulty';
import type { Tier } from '../engine/types';
import type { ThemeId } from './themes';
import type { AttemptRecord } from './history';

export type MusicTrack = 'night-shift' | 'signal' | 'cold-room';

export type TypingSpeed = 'fast' | 'normal' | 'instant';
/** 'system' follows the OS "reduce motion" setting. */
export type MotionSetting = 'system' | 'reduce' | 'full';

export interface SaveData {
  version: 2;
  tier: Tier;
  completed: Record<Tier, Record<string, MissionResult>>;
  attempts: Record<Tier, Record<string, number>>;
  theme: ThemeId;
  crt: boolean;
  typing: TypingSpeed;
  sfx: boolean;
  music: boolean;
  /** 0 to 1. Scales everything. */
  volume: number;
  motion: MotionSetting;
  /** Unlocked achievement ids. Stored here, never sent anywhere. */
  achievements: string[];
  /** Lifetime counters the achievements read. */
  counters: { sudoTries: number };
  /** Daily challenge results by UTC date, then tier. One attempt per day per tier. */
  dailies: Record<string, Partial<Record<Tier, MissionResult>>>;
  /** Ops log: every attempt on this device, newest first. */
  history: AttemptRecord[];
  /** Soundtrack. */
  track: MusicTrack;
  /** Music level, separate from effects. 0 to 1. */
  musicVolume: number;
  /** Mechanical keyboard sound on typing. Its own toggle and level, separate from Effects. */
  keySounds: boolean;
  /** 0 to 1. */
  keySoundsVolume: number;
  /** Tiny per-key vibration on devices that support it. Off by default. */
  keyHaptics: boolean;
  /** Cloud sync: the recovery key shown at registration (kept on this device only) and the sync token. */
  recoveryKey?: string;
  syncToken?: string;
  /** Set when the player chose to skip registration on the register screen. */
  registerSkipped?: boolean;
  /** Anonymous id for the leaderboard. Created on first use, never tied to a name or account. */
  playerId?: string;
  /** Nickname for the leaderboard, 3 to 16 characters. */
  nickname?: string;
}

export const SAVE_KEY = 'breach.save.v1';

function emptyByTier<T>(): Record<Tier, T> {
  return { easy: {} as T, medium: {} as T, hard: {} as T };
}

export const DEFAULT_SAVE: SaveData = {
  version: 2,
  tier: 'medium',
  completed: { easy: {}, medium: {}, hard: {} },
  attempts: { easy: {}, medium: {}, hard: {} },
  theme: 'green',
  crt: true,
  typing: 'normal',
  sfx: true,
  music: true,
  volume: 0.8,
  motion: 'system',
  achievements: [],
  counters: { sudoTries: 0 },
  dailies: {},
  history: [],
  track: 'night-shift',
  musicVolume: 0.4,
  keySounds: true,
  keySoundsVolume: 0.5,
  keyHaptics: false,
};

function freshDefaults(): SaveData {
  return {
    ...DEFAULT_SAVE,
    completed: emptyByTier<Record<string, MissionResult>>(),
    attempts: emptyByTier<Record<string, number>>(),
  };
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Version 1 kept one flat progress map and a single mute flag. Those progress records become Medium progress. */
function migrateV1(parsed: Record<string, unknown>): SaveData {
  const base = freshDefaults();
  const legacyCompleted = (parsed.completed ?? {}) as Record<string, MissionResult>;
  const legacyAttempts = (parsed.attempts ?? {}) as Record<string, number>;
  const muted = Boolean(parsed.muted);
  return {
    ...base,
    completed: {
      ...base.completed,
      medium: Object.fromEntries(Object.entries(legacyCompleted).map(([id, r]) => [id, { ...r, tier: 'medium' as const, points: r.score }])),
    },
    attempts: { ...base.attempts, medium: legacyAttempts },
    theme: (parsed.theme as ThemeId) ?? base.theme,
    crt: typeof parsed.crt === 'boolean' ? parsed.crt : base.crt,
    typing: (parsed.typing as TypingSpeed) ?? base.typing,
    sfx: !muted,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return freshDefaults();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version === 1) return migrateV1(parsed);
    if (parsed.version !== 2) return freshDefaults();
    const base = freshDefaults();
    const data = { ...base, ...parsed } as SaveData;
    return {
      ...data,
      tier: isTier(data.tier) ? data.tier : base.tier,
      completed: { ...base.completed, ...data.completed },
      attempts: { ...base.attempts, ...data.attempts },
    };
  } catch {
    return freshDefaults();
  }
}

export function persistSave(data: SaveData): void {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage is unavailable or full. Progress lasts until the tab closes.
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Whether reduced motion applies, given the saved setting and the OS preference. */
export function effectiveReduceMotion(setting: MotionSetting, systemPrefers: boolean): boolean {
  if (setting === 'reduce') return true;
  if (setting === 'full') return false;
  return systemPrefers;
}
