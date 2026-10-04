// Nickname rules for the leaderboard: 3 to 16 characters from a safe set, and a basic profanity filter.
// Shared by the browser and the Edge Function, so both apply exactly the same rules. The filter is a modest list
// with common letter substitutions undone. It is a first pass, not a guarantee, and reports still go through the
// contact on the rig.

const NICK_PATTERN = /^[A-Za-z0-9_-]{3,16}$/;

/** Common words the filter blocks, as plain lowercase letters. */
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'kike', 'rapist', 'nazi', 'porn'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

/** Lowercase, undo the usual letter swaps, and drop anything that is not a letter. */
export function foldForFilter(text: string): string {
  return [...text.toLowerCase()]
    .map((ch) => LEET[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
}

export function containsProfanity(text: string): boolean {
  const folded = foldForFilter(text);
  return BLOCKED.some((word) => folded.includes(word));
}

/** Null when the nickname is fine, otherwise the reason it is not. */
export function nicknameProblem(nick: string): string | null {
  if (!NICK_PATTERN.test(nick)) return 'Use 3 to 16 letters, numbers, _ or -.';
  if (containsProfanity(nick)) return 'That nickname is not allowed.';
  return null;
}
