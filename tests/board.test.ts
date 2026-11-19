// The global board panel's one rule: the celebratory "you're on the board" line is only shown once
// the run is actually verified by the server, never just because a handle was entered or a key was issued.

import { describe, expect, it } from 'vitest';
import { boardHeadline, isOnBoard } from '../src/lib/board';
import type { SubmitResult } from '../src/lib/leaderboard';

const SAVED: SubmitResult = { status: 'saved', score: 10, points: 10, improved: true };
const REJECTED: SubmitResult = { status: 'rejected', reason: 'nope' };
const OFFLINE: SubmitResult = { status: 'offline', reason: 'offline' };

describe('isOnBoard', () => {
  it('is true only once the server verified the run', () => {
    expect(isOnBoard(SAVED)).toBe(true);
    expect(isOnBoard(REJECTED)).toBe(false);
    expect(isOnBoard(OFFLINE)).toBe(false);
    expect(isOnBoard(null)).toBe(false);
  });
});

describe('boardHeadline', () => {
  it('only says "you\'re on the board" after a successful post', () => {
    expect(boardHeadline(SAVED)).toBe("YOU'RE ON THE BOARD");
    expect(boardHeadline(REJECTED)).toBe('GLOBAL BOARD');
    expect(boardHeadline(OFFLINE)).toBe('GLOBAL BOARD');
    expect(boardHeadline(null)).toBe('GLOBAL BOARD');
  });
});
