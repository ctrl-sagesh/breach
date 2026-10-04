// Real-world debrief cards. After a job, a short classified-file card names the real attack the job copied,
// gives one real example, and says how defenders stop it. Examples are limited to incidents that are well documented;
// where a case is only a pattern, the card says so rather than inventing details.

import type { MissionDef } from '../engine/types';

export interface RealWorldCard {
  attack: string;
  example: string;
  defence: string;
}

const CAMPAIGN: Record<string, RealWorldCard> = {
  'm01-dead-drop': {
    attack: 'Shared account, shared password',
    example: 'Shared logins and passwords written on paper or in shared notes turn up in many incident reports, because one leaked note opens every door it names.',
    defence: 'One account per person. Store secrets in a password manager, never in a shared file. Rotate credentials when people leave or hand over.',
  },
  'm02-soft-target': {
    attack: 'Cracking a weak password hash',
    example: 'In 2012 LinkedIn lost about 6.5 million password hashes. They were unsalted SHA-1, and many were cracked within days.',
    defence: 'Hash passwords with a slow, salted algorithm such as bcrypt, scrypt or Argon2. Check new passwords against lists of breached passwords.',
  },
  'm03-lighthouse': {
    attack: 'Secrets hidden with encoding',
    example: 'In 2016 Uber had AWS credentials sitting in a private GitHub repository. Attackers used them to reach data on about 57 million people.',
    defence: 'Encoding is not secrecy. Keep secrets in a secrets manager, scan repositories for keys before they are pushed, and rotate anything that has been exposed.',
  },
  'm04-blue-lines': {
    attack: 'Secrets written into logs',
    example: 'In 2018 GitHub told users that some passwords had been stored in plaintext in an internal log. Anyone with log access could read them.',
    defence: 'Scrub secrets before they reach logs, limit who can read logs, and treat log access as sensitive.',
  },
  'm05-personal-files': {
    attack: 'Account recovery from public facts',
    example: 'In 2008 a political figure\'s web email was taken over by answering its password-reset questions from public information about her life.',
    defence: 'Use random answers that are not in any public profile, or skip knowledge questions. Prefer one-time codes from an app over security questions.',
  },
  'm06-pivot': {
    attack: 'Pivoting through a trusted vendor',
    example: 'The 2013 Target breach began with credentials belonging to an HVAC vendor. Attackers moved from that low-value account into the payment network.',
    defence: 'Segment networks so a vendor login cannot reach payments. Give vendors narrow access, monitor it, and remove it when work ends.',
  },
  'm07-ledger': {
    attack: 'SQL injection',
    example: 'The 2008 Heartland Payment Systems breach came through SQL injection, and about 130 million card numbers were stolen.',
    defence: 'Use parameterised queries, give the database account only the rights it needs, and never build SQL by joining user text into it.',
  },
  'm08-ghost-protocol': {
    attack: 'Access that outlived its purpose',
    example: 'In 2013 a contractor walked out of an agency with a large set of documents, because his access was far wider than his job needed.',
    defence: 'Grant the least access a job needs, review it regularly, and revoke it fully when someone leaves. Do not leave provisioning files lying around.',
  },
};

const DAILY: Record<string, RealWorldCard> = {
  'shared-note': CAMPAIGN['m01-dead-drop'],
  'encoded-secret': CAMPAIGN['m03-lighthouse'],
  'weak-hash': CAMPAIGN['m02-soft-target'],
};

/** The card for a finished job. Daily jobs use the idea they were built around. */
export function realWorldFor(mission: MissionDef): RealWorldCard | null {
  if (mission.realWorldKey) return DAILY[mission.realWorldKey] ?? null;
  return CAMPAIGN[mission.id] ?? null;
}

export const REAL_WORLD_IDS = [...Object.keys(CAMPAIGN), ...Object.keys(DAILY)];
