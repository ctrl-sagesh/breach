// Pure rules for the global board panel shown on the debrief: what headline to show, and whether
// the post actually landed. Kept separate from the component so the rule "only say you're on the
// board after a successful post" is checked without rendering anything.

import type { SubmitResult } from './leaderboard';

/** True only once the run is actually verified on the server. Posting failed, offline, or not yet attempted all say no. */
export function isOnBoard(result: SubmitResult | null): boolean {
  return result?.status === 'saved';
}

/** The panel's headline: the celebratory line is earned, never assumed from just having a handle. */
export function boardHeadline(result: SubmitResult | null): string {
  return isOnBoard(result) ? "YOU'RE ON THE BOARD" : 'GLOBAL BOARD';
}
