// A tiny per-keystroke buzz on devices that support navigator.vibrate. Off by default: a buzz on every key is more
// annoying than helpful for most people, so the player opts in from Settings. Throttled the same way the keyboard
// sound is, so holding a key down does not turn into a continuous buzz.

const THROTTLE_MS = 30;
const DURATION_MS = 8;

let enabled = false;
let lastVibrate = 0;

export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Call on a relevant keystroke. Does nothing when the toggle is off, the device cannot vibrate, or it is too soon. */
export function vibrateKey(): void {
  if (!enabled || !hapticsSupported()) return;
  const now = Date.now();
  if (now - lastVibrate < THROTTLE_MS) return;
  lastVibrate = now;
  try {
    navigator.vibrate(DURATION_MS);
  } catch {
    // Blocked or unsupported in this context. Nothing to do.
  }
}
