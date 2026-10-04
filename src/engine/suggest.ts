// "Did you mean" helpers. Pure string functions: no session, machine or DOM access.

/** Edit distance between two strings (insertions, deletions, substitutions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Candidates close enough to `word` to be a plausible typo, nearest first. Case is ignored. */
export function closest(word: string, candidates: readonly string[], limit = 3): string[] {
  const target = word.toLowerCase();
  if (!target) return [];
  const maxDistance = target.length < 4 ? 1 : 2;
  return candidates
    .map((c) => ({ c, d: levenshtein(target, c.toLowerCase()) }))
    .filter((x) => x.d > 0 && x.d <= maxDistance)
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c))
    .slice(0, limit)
    .map((x) => x.c);
}
