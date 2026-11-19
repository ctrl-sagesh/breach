// The cracker's guesser animation runs on a real timer. A player who starts typing while it is still running
// must not lose that keystroke: skip() finishes the animation immediately instead of waiting out the delay.

import { describe, expect, it, vi } from 'vitest';
import { skippable } from '../src/lib/deferred';

describe('skippable', () => {
  it('runs the work once the delay elapses, if nothing skips it', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    skippable(fn, 1000);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('skip() runs the work immediately, so a keystroke never waits on the animation', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const timer = skippable(fn, 1000);
    vi.advanceTimersByTime(10);
    timer.skip();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('never runs the work twice: a natural fire after a skip, or two skips, both no-op', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const timer = skippable(fn, 1000);
    timer.skip();
    timer.skip();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('skip() after the timer already fired on its own does nothing', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const timer = skippable(fn, 1000);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    timer.skip();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
