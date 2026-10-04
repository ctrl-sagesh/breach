// Recovery keys and rate limiting, shared by the browser and the Edge Function (both run this exact code).
//
// A recovery key looks like GHOST-AMBER-FALCON-CEDAR-7419: four words from a list of 64, then four digits. That is
// about 37 bits. The server stores only a keyed hash of it, so a leaked table cannot be checked offline without the
// server's secret, and restore attempts are rate limited on top of that.

/** 64 short words. Chosen to be easy to read aloud and hard to mistype. */
export const KEY_WORDS: readonly string[] = [
  'AMBER', 'ANCHOR', 'ARROW', 'ASH', 'BASALT', 'BEACON', 'BISHOP', 'BLAZE', 'BRASS', 'CANYON',
  'CEDAR', 'CIPHER', 'CLOUD', 'COBALT', 'COMET', 'COPPER', 'CORVID', 'CRATER', 'DELTA', 'DRIFT',
  'EMBER', 'ENIGMA', 'FALCON', 'FERN', 'FJORD', 'FLINT', 'FORGE', 'FROST', 'GHOST', 'GLACIER',
  'GLASS', 'GRANITE', 'HARBOR', 'HAZEL', 'HELIX', 'HOLLOW', 'INDIGO', 'IRON', 'JADE', 'JUNIPER',
  'KESTREL', 'LANTERN', 'LATCH', 'LOTUS', 'MERIDIAN', 'MERCURY', 'MIRROR', 'MOSS', 'NEEDLE', 'NEON',
  'ONYX', 'ORBIT', 'OSPREY', 'PARADOX', 'PINE', 'PRISM', 'QUARTZ', 'RAVEN', 'RIVER', 'SABLE',
  'SIGNAL', 'SILVER', 'SLATE', 'STATIC', 'SUMMIT', 'TIDE', 'TUNDRA', 'VAULT', 'VELVET', 'WILLOW',
];

export const KEY_PATTERN = /^[A-Z]+-[A-Z]+-[A-Z]+-[A-Z]+-\d{4}$/;

/** A key from a random source. Pass a seeded source in tests; the browser passes crypto. */
export function generateRecoveryKey(random: () => number): string {
  const pick = () => KEY_WORDS[Math.floor(random() * KEY_WORDS.length)];
  const digits = String(Math.floor(random() * 10000)).padStart(4, '0');
  return [pick(), pick(), pick(), pick(), digits].join('-');
}

/**
 * Turns what a person typed into the canonical form: upper case, single hyphens, no stray spaces.
 * Spaces and hyphens both work as separators, so "ghost amber 7419 falcon" matches.
 */
export function normalizeRecoveryKey(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isWellFormedKey(input: string): boolean {
  return KEY_PATTERN.test(normalizeRecoveryKey(input));
}

export interface Bucket {
  windowStart: number;
  hits: number;
}

/**
 * Fixed-window rate limit. Returns whether this attempt may proceed, and the bucket to store afterwards.
 * A new window starts after windowMs. Attempts are counted even when they are refused, so hammering does not reset it.
 */
export function admit(bucket: Bucket | null, now: number, opts: { windowMs: number; max: number }): { allowed: boolean; next: Bucket } {
  const fresh = !bucket || now - bucket.windowStart >= opts.windowMs;
  const base: Bucket = fresh ? { windowStart: now, hits: 0 } : bucket;
  const next: Bucket = { windowStart: base.windowStart, hits: base.hits + 1 };
  return { allowed: next.hits <= opts.max, next };
}

/** Restore attempts: ten per bucket per hour. */
export const RESTORE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 };
