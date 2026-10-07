// Custom analytics events, on top of Vercel Web Analytics' automatic page views. One named function per event the
// product asked for, each taking only non-identifying properties — never a nickname or player id. If the analytics
// script is missing, blocked or errors, these fail silently: a dropped event never breaks the game.

import { track } from '@vercel/analytics';
import type { Tier } from '../engine/types';

function safeTrack(name: string, props?: Record<string, string | number | boolean>): void {
  try {
    track(name, props);
  } catch {
    // Blocked by an ad blocker, offline, or analytics not configured for this build. Nothing to do.
  }
}

export function trackLandingView(): void {
  safeTrack('landing_view');
}

export function trackStart(): void {
  safeTrack('start');
}

export function trackHandleRegistered(online: boolean): void {
  safeTrack('handle_registered', { online });
}

export type MissionScope = 'campaign' | 'daily';

export function trackMissionStarted(tier: Tier, scope: MissionScope): void {
  safeTrack('mission_started', { tier, scope });
}

export function trackMissionCleared(tier: Tier, scope: MissionScope): void {
  safeTrack('mission_cleared', { tier, scope });
}

export function trackMissionTraced(tier: Tier, scope: MissionScope): void {
  safeTrack('mission_traced', { tier, scope });
}

export function trackDailyPlayed(tier: Tier): void {
  safeTrack('daily_played', { tier });
}

export type ShareMethod = 'download' | 'share' | 'copy';

export function trackShareClicked(method: ShareMethod): void {
  safeTrack('share_clicked', { method });
}

export function trackRestoreUsed(): void {
  safeTrack('restore_used');
}
