// Quality-of-life features: "did you mean" suggestions, help <command>, the clue log and notes,
// and the recovery nudges that change per tier.

import { describe, expect, it } from 'vitest';
import { COMMAND_LIST, COMMANDS } from '../src/engine/commands';
import { buildSecrets, containsWord } from '../src/engine/clues';
import { applyTier } from '../src/engine/difficulty';
import { GameSession } from '../src/engine/session';
import { closest, levenshtein } from '../src/engine/suggest';
import { MISSIONS } from '../src/missions';
import type { Tier } from '../src/engine/types';

const FIRST = MISSIONS[0];
const PASSWORD_MISSION = MISSIONS[4];
const PORTAL_IP = '10.13.37.90';
const MIRROR_IP = '10.13.37.91';
const NEIGHBOUR_IP = '10.13.37.20';

function textsOf(s: GameSession, line: string): string[] {
  return s.input(line).lines.map((l) => l.text);
}

describe('suggest helpers', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('keeps only close candidates, nearest first, ignoring case', () => {
    expect(closest('LSS', COMMAND_LIST)).toEqual(['ls']);
    expect(closest('zzzzzzzz', COMMAND_LIST)).toEqual([]);
  });
});

describe('did you mean', () => {
  it('suggests the nearest command for a typo', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'lss')).toContain('Did you mean: ls?');
    expect(textsOf(s, 'scna')).toContain('Did you mean: scan?');
  });

  it('suggests no command for junk input', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'qqqqqqqq').some((t) => t.startsWith('Did you mean'))).toBe(false);
  });

  it('corrects a mistyped file name in a directory the player can read', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(textsOf(s, 'cat /srv/portal/REDME')).toContain('Did you mean: /srv/portal/README?');
  });

  it('corrects a mistyped directory segment one level at a time', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(s.suggestPath('/srv/portla/logs/access.log')).toBe('/srv/portal/logs/access.log');
  });

  it('never suggests a name the current user cannot read', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(s.suggestPath('/home/rfoster/flg.txt')).toBeNull();
    expect(textsOf(s, 'cat /home/rfoster/flg.txt').some((t) => t.startsWith('Did you mean'))).toBe(false);
  });

  it('stays quiet for a path that exists', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(s.suggestPath('/srv/portal/README')).toBeNull();
  });
});

describe('help <command>', () => {
  it('every command has a usage, a summary and an example', () => {
    for (const name of COMMAND_LIST) {
      const spec = COMMANDS.get(name)!;
      expect(spec.usage.trim(), `${name} usage`).not.toBe('');
      expect(spec.summary.trim(), `${name} summary`).not.toBe('');
      expect(spec.example.trim(), `${name} example`).not.toBe('');
    }
  });

  it('shows usage and a real example for one command', () => {
    const s = new GameSession(FIRST);
    const lines = textsOf(s, 'help ls');
    expect(lines).toContain('ls [-la] [path...]');
    expect(lines).toContain('  e.g. ls -la /home');
  });

  it('suggests a near command name when the one asked for does not exist', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'help hlp')).toContain('Did you mean: help?');
    expect(textsOf(s, 'help zzzzzzzz')).toContain("help: no command 'zzzzzzzz'");
  });

  it('the recovery lines in the help footer show on Easy and Medium only', () => {
    const footer = (tier: Tier) => textsOf(new GameSession(FIRST, { tier }), 'help').join('\n');
    expect(footer('easy')).toContain('type ? to start account recovery');
    expect(footer('medium')).toContain('type ? to start account recovery');
    expect(footer('hard')).not.toContain('account recovery');
    expect(footer('hard')).toContain('Password prompts do not echo.');
  });
});

describe('clue log and notes', () => {
  it('records neighbour IPs automatically on Easy and Medium', () => {
    for (const tier of ['easy', 'medium'] as const) {
      const s = new GameSession(FIRST, { tier });
      s.input('scan');
      expect(s.clues.clues).toContainEqual({ category: 'ip', text: NEIGHBOUR_IP });
    }
  });

  it('logs each discovery once, however often it shows up', () => {
    const s = new GameSession(FIRST, { tier: 'medium' });
    s.input('scan');
    s.input('scan');
    expect(s.clues.clues.filter((c) => c.text === NEIGHBOUR_IP)).toHaveLength(1);
  });

  it('records decoded strings automatically on Easy and Medium', () => {
    const s = new GameSession(FIRST, { tier: 'easy' });
    s.input('decode base64 aGVsbG8=');
    expect(s.clues.clues).toContainEqual({ category: 'decoded', text: 'hello' });
  });

  it('does not scan hint output, so hints do not fill the log', () => {
    const s = new GameSession(PASSWORD_MISSION, { tier: 'medium' });
    s.input('hint');
    s.input('hint');
    expect(s.clues.clues.some((c) => c.text === MIRROR_IP)).toBe(false);
  });

  it('keeps the log empty on Hard, and lets the player add their own notes', () => {
    const s = new GameSession(FIRST, { tier: 'hard' });
    s.input('scan');
    s.input('decode base64 aGVsbG8=');
    expect(s.clues.clues).toEqual([]);
    expect(textsOf(s, 'notes').some((t) => t.includes('No automatic clue log'))).toBe(true);
    expect(textsOf(s, 'notes add the neighbour sits on the same subnet')).toContain('Note saved.');
    expect(textsOf(s, 'notes')).toContain('  1. the neighbour sits on the same subnet');
  });

  it('shows the automatic log and the player notes together on Easy and Medium', () => {
    const s = new GameSession(FIRST, { tier: 'medium' });
    s.input('scan');
    s.input('notes add check the neighbour first');
    const lines = textsOf(s, 'notes');
    expect(lines.some((t) => t.startsWith('  IP ') && t.endsWith(NEIGHBOUR_IP))).toBe(true);
    expect(lines).toContain('  1. check the neighbour first');
  });

  it('rejects an empty note and an overlong one', () => {
    const s = new GameSession(FIRST, { tier: 'hard' });
    expect(textsOf(s, 'notes add')).toContain('usage: notes add <text>');
    expect(textsOf(s, `notes add ${'x'.repeat(201)}`).some((t) => /under 200 characters/.test(t))).toBe(true);
  });

  it('finds a secret only as a whole word', () => {
    expect(containsWord(`ip ${PORTAL_IP}.`, PORTAL_IP)).toBe(true);
    expect(containsWord('ip 10.13.37.900', PORTAL_IP)).toBe(false);
    expect(containsWord('xadmin', 'admin')).toBe(false);
  });

  it('builds secrets from the remote hosts only, never the rig', () => {
    const secrets = buildSecrets(PASSWORD_MISSION);
    expect(secrets).toContainEqual({ category: 'ip', text: PORTAL_IP });
    expect(secrets).toContainEqual({ category: 'username', text: 'rfoster' });
    expect(secrets).toContainEqual({ category: 'password', text: 'Xk!29pQ-bunny' });
    expect(secrets.some((x) => x.text === 'local-only')).toBe(false);
    expect(secrets.some((x) => x.text === '10.66.0.1')).toBe(false);
  });
});

describe('recovery nudges per tier', () => {
  const DIRECT_SUBJECT = 'Locked out, on purpose';
  const SUBTLE_SUBJECT = 'Re: the portal';

  it('the direct recovery mail is on Easy only, with a subtler one on Medium', () => {
    const subjects = (tier: Tier) => applyTier(PASSWORD_MISSION, tier).inbox.map((m) => m.subject);
    expect(subjects('easy')).toContain(DIRECT_SUBJECT);
    expect(subjects('medium')).not.toContain(DIRECT_SUBJECT);
    expect(subjects('medium')).toContain(SUBTLE_SUBJECT);
    expect(subjects('hard')).not.toContain(DIRECT_SUBJECT);
    expect(subjects('hard')).not.toContain(SUBTLE_SUBJECT);
  });

  it('the subtler Medium mail does not name the forgot-password route', () => {
    const subtle = applyTier(PASSWORD_MISSION, 'medium').inbox.find((m) => m.subject === SUBTLE_SUBJECT)!;
    expect(subtle.body.toLowerCase()).not.toContain('forgot');
    expect(subtle.body.toLowerCase()).not.toContain('recovery');
  });

  it('the "Forgot it?" line after login shows on Easy only', () => {
    const line = (tier: Tier) => {
      const s = new GameSession(PASSWORD_MISSION, { tier });
      s.input(`connect ${PORTAL_IP}`);
      return textsOf(s, 'login rfoster').some((t) => t.includes('Forgot it?'));
    };
    expect(line('easy')).toBe(true);
    expect(line('medium')).toBe(false);
    expect(line('hard')).toBe(false);
  });

  it('the solution never reads mail, so hiding the direct mail cannot block it', () => {
    // missions.test.ts plays the solution on every tier, which is the real check.
    expect(PASSWORD_MISSION.solution.some((step) => step === 'mail' || step.startsWith('mail '))).toBe(false);
  });
});
