// A timeout that can be skipped: resolved early and synchronously instead of waiting out its delay.
// Used so a player's keystroke during a brief scripted animation (the password-cracker's guesser)
// finishes that animation immediately rather than being dropped by a disabled input.

export interface Skippable {
  /** Runs the scheduled work now, instead of at the scheduled time. Safe to call more than once, or after it already ran. */
  skip: () => void;
}

/** Runs `fn` once, after `ms`, or immediately via `skip()` — whichever happens first. */
export function skippable(fn: () => void, ms: number): Skippable {
  let done = false;
  const id = setTimeout(() => {
    if (done) return;
    done = true;
    fn();
  }, ms);
  return {
    skip: () => {
      if (done) return;
      done = true;
      clearTimeout(id);
      fn();
    },
  };
}
