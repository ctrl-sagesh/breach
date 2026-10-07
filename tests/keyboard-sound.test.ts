// The keyboard sound and haptics: which keys get a sound, that haptics respects its toggle and throttle without a
// real device, and the new settings default to the values the feature asks for (sound on at a moderate level,
// haptics off). Synthesis itself needs a browser and is not tested here, same as the rest of audio.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyVariantFor, play } from '../src/lib/audio';
import { DEFAULT_SAVE } from '../src/lib/save';

describe('keyVariantFor', () => {
  it('regular printable keys get the plain click', () => {
    for (const key of ['a', 'Z', '5', '-', '.', '?']) expect(keyVariantFor(key)).toBe('key');
  });

  it('space, Enter and Backspace each get their own variant', () => {
    expect(keyVariantFor(' ')).toBe('key-space');
    expect(keyVariantFor('Enter')).toBe('key-enter');
    expect(keyVariantFor('Backspace')).toBe('key-backspace');
  });

  it('modifiers, navigation and function keys get no sound', () => {
    for (const key of ['Tab', 'ArrowUp', 'ArrowDown', 'Control', 'Shift', 'Alt', 'Meta', 'Escape', 'F1', 'CapsLock', 'Home']) {
      expect(keyVariantFor(key), key).toBeNull();
    }
  });
});

describe('play() with the new key variants never throws, even without a browser', () => {
  it('each key variant is a safe no-op under Node (no AudioContext)', () => {
    for (const variant of ['key', 'key-space', 'key-enter', 'key-backspace'] as const) {
      expect(() => play(variant)).not.toThrow();
    }
  });
});

describe('default save: keyboard sound on at a moderate level, haptics off', () => {
  it('keyboard sounds default on', () => {
    expect(DEFAULT_SAVE.keySounds).toBe(true);
  });

  it('the default level is moderate: not silent, not maxed', () => {
    expect(DEFAULT_SAVE.keySoundsVolume).toBeGreaterThan(0.2);
    expect(DEFAULT_SAVE.keySoundsVolume).toBeLessThan(0.8);
  });

  it('haptics default off', () => {
    expect(DEFAULT_SAVE.keyHaptics).toBe(false);
  });
});

describe('haptics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('is reported unsupported when navigator.vibrate does not exist', async () => {
    vi.stubGlobal('navigator', {});
    const { hapticsSupported } = await import('../src/lib/haptics');
    expect(hapticsSupported()).toBe(false);
  });

  it('is reported supported when navigator.vibrate exists', async () => {
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
    const { hapticsSupported } = await import('../src/lib/haptics');
    expect(hapticsSupported()).toBe(true);
  });

  it('does nothing while disabled, even on a device that supports it', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const { vibrateKey } = await import('../src/lib/haptics');
    vibrateKey();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrates once enabled, and is throttled so holding a key does not buzz continuously', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const { setHapticsEnabled, vibrateKey } = await import('../src/lib/haptics');
    setHapticsEnabled(true);
    vibrateKey();
    vibrateKey(); // immediately again: throttled
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(40);
    vibrateKey();
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('turning the toggle off stops further vibration', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const { setHapticsEnabled, vibrateKey } = await import('../src/lib/haptics');
    setHapticsEnabled(true);
    vibrateKey();
    setHapticsEnabled(false);
    vi.advanceTimersByTime(40);
    vibrateKey();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('a vibrate call that throws is swallowed, not propagated', async () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    const { setHapticsEnabled, vibrateKey } = await import('../src/lib/haptics');
    setHapticsEnabled(true);
    expect(() => vibrateKey()).not.toThrow();
  });
});
