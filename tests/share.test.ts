// Share text: the Wordle-style emoji row for a daily, and the copyable caption built around it.

import { describe, expect, it } from 'vitest';
import { dailyShareText, shareEmoji, shareText } from '../src/lib/share';

describe('shareEmoji', () => {
  it('is all green when no hints were used and trace stayed low', () => {
    expect(shareEmoji(0, 10)).toBe('🟩🟩🟩🟩');
  });

  it('marks the hint you last used yellow, and earlier ones black', () => {
    expect(shareEmoji(1, 10)).toBe('🟨🟩🟩🟩');
    expect(shareEmoji(2, 10)).toBe('⬛🟨🟩🟩');
    expect(shareEmoji(3, 10)).toBe('⬛⬛🟨🟩');
  });

  it('the final square reads the trace band, without naming the trace number', () => {
    expect(shareEmoji(0, 20)).toMatch(/🟩$/);
    expect(shareEmoji(0, 50)).toMatch(/🟨$/);
    expect(shareEmoji(0, 90)).toMatch(/⬛$/);
  });
});

describe('dailyShareText', () => {
  it('is copyable, four lines, and never spells out the flag or the solution', () => {
    const text = dailyShareText({ dailyNum: 322, tier: 'Medium', seconds: 192, trace: 34, hintsUsed: 0 });
    const lines = text.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('BREACH Daily #322 Medium');
    expect(lines[1]).toBe(shareEmoji(0, 34));
    expect(lines[2]).toBe('trace 34% · 3:12 · 0 hints');
    expect(lines[3]).not.toMatch(/^https?:\/\//);
  });

  it('singular vs plural hints', () => {
    expect(dailyShareText({ dailyNum: 1, tier: 'Easy', seconds: 0, trace: 0, hintsUsed: 1 })).toContain('1 hint');
    expect(dailyShareText({ dailyNum: 1, tier: 'Easy', seconds: 0, trace: 0, hintsUsed: 2 })).toContain('2 hints');
  });
});

describe('shareText (campaign and non-emoji share)', () => {
  it('still reads score, rank and tier the old way', () => {
    const text = shareText({ label: 'JOB 03', tier: 'hard', rank: 'ghost', score: 900 });
    expect(text).toContain('JOB 03');
    expect(text).toContain('HARD');
    expect(text).toContain('GHOST');
    expect(text).toContain('900 points');
  });
});
