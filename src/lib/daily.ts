// The daily challenge. One procedurally generated job per UTC day, the same for everyone in the world.
// The date is the seed. The generator is deterministic, so the server can regenerate any day and check a replay.
// Each job is built from one of three campaign ideas, with randomised machines, names, flags, decoys and hints.
// The generator also writes the walkthrough next to the job, and the tests prove every generated job is beatable.

import { toBase64 } from '../engine/encoding';
import type { EmailDef, FileDef, HashDef, MachineDef, MissionDef } from '../engine/types';
import { WORDLIST } from '../engine/commands/crypto';
import { makeRig } from '../missions/shared';

/** UTC calendar date, as YYYY-MM-DD. */
export function utcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The date before, or after, a YYYY-MM-DD date. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Daily number: day 1 is 2026-01-01. Shown as "DAILY 42" on screen. */
export function dailyNumber(date: string): number {
  const start = Date.UTC(2026, 0, 1);
  const day = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((day - start) / 86_400_000) + 1;
}

/** Milliseconds until the next UTC midnight: the countdown on the landing page and menu. */
export function msUntilReset(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

/** Consecutive days with a completed daily, counting back from today (or yesterday, so a streak survives until the day is over). */
export function streakFor(completedDates: readonly string[], today: string): number {
  const done = new Set(completedDates);
  let cursor = done.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (done.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

/** 32-bit FNV-1a hash of a string. Turns a date into a seed. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator. The same seed always gives the same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOSTS = ['ledger-02', 'relay-7', 'ops-box', 'hangar-db', 'sat-uplink', 'cafe-wifi-3', 'meridian-web', 'quarry-nas'];
const PEOPLE = ['maya', 'sol', 'tobi', 'vera', 'kenji', 'ines', 'omar', 'lena', 'bram', 'noor'];
const WORDS = ['copper', 'lantern', 'harbor', 'velvet', 'orbit', 'cedar', 'falcon', 'quartz', 'juniper', 'meadow'];
const FLAG_WORDS = ['tin', 'salt', 'ember', 'glass', 'static', 'lamp', 'river', 'signal', 'drift', 'anchor'];
const DECOYS: Record<string, string> = {
  '/srv/share/old-menu.txt': 'Canteen menu, week 41: soup, bread, the usual. No substitutions on Fridays.',
  '/var/log/cron.log': 'CRON[2231]: nightly backup finished in 4m12s\nCRON[2240]: rotated 3 logs',
  '/srv/share/welcome.txt': 'Welcome to the shared drive. Keep it tidy. Delete your old drafts.',
};

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function hex(rand: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += Math.floor(rand() * 16).toString(16);
  return out;
}

/** Target IP in a private range that cannot clash with the rig (10.66.0.1). */
function targetIp(rand: () => number): string {
  let second = 0;
  do {
    second = 1 + Math.floor(rand() * 200);
  } while (second === 66);
  return `10.${second}.${Math.floor(rand() * 250) + 1}.${Math.floor(rand() * 200) + 20}`;
}

/** Which real-world card each daily template teaches. Keys match lib/realworld.ts. */
export const REAL_WORLD_KEYS = ['shared-note', 'encoded-secret', 'weak-hash'] as const;

/** The job for one UTC date. Pure: the same date always returns the same mission. */
export function dailyMission(date: string): MissionDef {
  const rand = seededRandom(hashSeed(`breach-daily:${date}`));
  const ip = targetIp(rand);
  const host = pick(rand, HOSTS);
  const user = pick(rand, PEOPLE);
  const pw = `${pick(rand, WORDS)}${10 + Math.floor(rand() * 89)}`;
  const flag = `BREACH{${pick(rand, FLAG_WORDS)}_${pick(rand, FLAG_WORDS)}_${Math.floor(rand() * 900 + 100)}}`;
  const template = Math.floor(rand() * 3) as 0 | 1 | 2;
  const home = `/home/${user}`;
  const flagPath = `${home}/flag.txt`;

  const files: Record<string, FileDef> = {};
  const decoyPaths = Object.keys(DECOYS).filter(() => rand() < 0.6);
  for (const p of decoyPaths) files[p] = { content: DECOYS[p] };

  let solution: string[];
  let kaliSolution: string[];
  let hashes: HashDef[] = [];
  let concept: string;
  let mail: EmailDef[] = [];

  if (template === 0) {
    // A password written in a shared note.
    concept = 'credentials left in a shared note';
    files['/srv/share/handover.txt'] = { content: `Handover: ${user} is on call. Login is ${user}, password ${pw}. Rotate it when the audit ends.` };
    kaliSolution = ['nmap', `ssh ${ip}`, 'ls /srv/share', 'cat /srv/share/handover.txt', `su ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
    solution = ['scan', `connect ${ip}`, 'ls /srv/share', 'cat /srv/share/handover.txt', `login ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
  } else if (template === 1) {
    // Base64 is encoding, not a lock.
    concept = 'a password hidden behind base64';
    const b64 = toBase64(pw);
    files['/etc/app/settings.env'] = { content: `APP_ENV=prod\nDB_USER=${user}\nDB_PASS_B64=${b64}\nLOG_LEVEL=warn` };
    kaliSolution = ['nmap', `ssh ${ip}`, 'cat /etc/app/settings.env', `echo ${b64} | base64 -d`, `su ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
    solution = ['scan', `connect ${ip}`, 'cat /etc/app/settings.env', `decode base64 ${b64}`, `login ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
  } else {
    // A weak, unsalted hash of a common password.
    concept = 'a weak hash of a common password';
    const plain = pick(rand, WORDLIST);
    const hash = hex(rand, 32);
    hashes = [{ hash, plaintext: plain, algo: 'md5' }];
    files['/opt/auth/users.db'] = { content: `${user}:${hash}:admin\nguest:${hex(rand, 32)}:user` };
    // The account's password is the common word, so this template uses it as the password.
    kaliSolution = ['nmap', `ssh ${ip}`, 'cat /opt/auth/users.db', `john ${hash}`, `su ${user}`, plain, `cat ${flagPath}`, `submit ${flag}`];
    solution = ['scan', `connect ${ip}`, 'cat /opt/auth/users.db', `crack ${hash}`, `login ${user}`, plain, `cat ${flagPath}`, `submit ${flag}`];
    mail = [];
  }

  // The password in the hash template is the wordlist word, so the account uses that word.
  const accountPassword = template === 2 ? hashes[0].plaintext : pw;

  const target: MachineDef = {
    id: 'target',
    hostname: host,
    ip,
    neighbors: [],
    defaultUser: 'guest',
    users: [
      { name: 'guest', password: '', home: '/home/guest' },
      { name: user, password: accountPassword, home: home },
    ],
    ports: [
      { port: 22, service: 'ssh', banner: 'OpenSSH 8.9p1' },
      { port: 443, service: 'https', banner: 'nginx 1.18.0' },
    ],
    files: {
      ...files,
      [flagPath]: { owner: user, private: true, content: flag },
      '/home/guest/readme.txt': { content: 'Guest access. Look around, touch nothing.' },
    },
    dirs: { [home]: { owner: user, private: true } },
  };

  const rig = makeRig([ip]);
  const dayNo = dailyNumber(date);

  return {
    id: `daily-${date}`,
    number: dayNo,
    codename: `DAILY ${dayNo}`,
    title: `${host}: ${concept}`,
    client: 'OPEN BOARD',
    briefing: [
      `Today's job is open to everyone, on the same network, the same day. Target: ${host} (${ip}).`,
      `Find the account, get in, read the flag at ${flagPath}.`,
    ],
    debrief: [
      `The weak point was ${concept}. It is one of the oldest mistakes in the book, and it still shows up in the field.`,
    ],
    start: { machine: 'rig', cwd: '/home/ghost' },
    machines: [rig, target],
    hashes,
    inbox: mail,
    flag,
    hints: [
      `Start with what the box shares. Look for notes, config files and anything a team left lying about.`,
      `The account is ${user}. Find out how its password is stored.`,
      `${concept[0].toUpperCase()}${concept.slice(1)} is the weak point. Use the matching decode or cracking tool, then su ${user}.`,
    ],
    solution,
    kaliSolution,
    realWorldKey: REAL_WORLD_KEYS[template],
  };
}

/** The longest run of consecutive completed days, ever. */
export function bestStreak(completedDates: readonly string[]): number {
  const sorted = [...new Set(completedDates)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && shiftDate(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
