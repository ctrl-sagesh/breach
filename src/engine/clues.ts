// The clue log: important discoveries from this attempt, plus the player's own notes.
// On tiers with autoClues, the session scans command output for the secrets built here and records what turns up.
// Secrets come from the mission data, so the log only ever holds things the player could actually see.

import type { MissionDef } from './types';

export type ClueCategory = 'ip' | 'username' | 'password' | 'hash' | 'decoded';

export interface Clue {
  category: ClueCategory;
  text: string;
}

export type Secret = Clue;

export const CLUE_LABELS: Record<ClueCategory, string> = {
  ip: 'IP',
  username: 'USER',
  password: 'PASS',
  hash: 'HASH',
  decoded: 'DECODED',
};

/** Account the engine never logs as a username: it appears in almost every `ps` listing. */
const SKIPPED_USERNAMES = new Set(['root']);

/**
 * Every secret the player can discover on this mission's remote hosts. The rig is excluded: it is the player's own machine.
 */
export function buildSecrets(mission: MissionDef): Secret[] {
  const secrets: Secret[] = [];
  for (const machine of mission.machines) {
    if (machine.id === 'rig') continue;
    secrets.push({ category: 'ip', text: machine.ip });
    for (const user of machine.users) {
      if (!SKIPPED_USERNAMES.has(user.name)) secrets.push({ category: 'username', text: user.name });
      if (user.password) secrets.push({ category: 'password', text: user.password });
    }
  }
  for (const entry of mission.hashes) {
    secrets.push({ category: 'hash', text: entry.hash });
    secrets.push({ category: 'password', text: entry.plaintext });
  }
  return secrets;
}

const WORD_CHAR = /[A-Za-z0-9_]/;

/** True when `token` appears in `line` with no letter, digit or underscore touching either end. */
export function containsWord(line: string, token: string): boolean {
  let at = line.indexOf(token);
  while (at >= 0) {
    const before = line[at - 1] ?? '';
    const after = line[at + token.length] ?? '';
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    at = line.indexOf(token, at + 1);
  }
  return false;
}

export class ClueLog {
  private readonly discovered: Clue[] = [];
  private readonly seen = new Set<string>();
  private readonly playerNotes: string[] = [];

  /** Records a discovery once per category and text. Returns true when it is new. */
  record(category: ClueCategory, text: string): boolean {
    const key = `${category}\u0000${text}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.discovered.push({ category, text });
    return true;
  }

  addNote(text: string): void {
    this.playerNotes.push(text);
  }

  get clues(): readonly Clue[] {
    return this.discovered;
  }

  get notes(): readonly string[] {
    return this.playerNotes;
  }
}
