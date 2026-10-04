// The landing page terminal: fun answers for curious visitors, and the start and clear actions.

import { describe, expect, it } from 'vitest';
import { landingReply, TAGLINE } from '../src/lib/landing';

const texts = (raw: string) => landingReply(raw).lines.map((l) => l.text).join('\n');

describe('landing terminal', () => {
  it('start, hack and play begin the game', () => {
    for (const word of ['start', 'hack', 'play']) {
      expect(landingReply(word).action, word).toBe('start');
    }
  });

  it('help lists what visitors can try', () => {
    expect(texts('help')).toContain('start');
    expect(texts('help')).toContain('sudo');
  });

  it('whoami and sudo answer with personality, not an error', () => {
    expect(texts('whoami')).toContain('curious visitor');
    expect(texts('sudo')).toContain('This incident will be reported.');
    expect(texts('sudo rm -rf /')).toContain('This incident will be reported.');
  });

  it('rm -rf gets a dry answer', () => {
    expect(texts('rm -rf /')).toContain('Nice try');
  });

  it('a real attack command nudges toward start', () => {
    expect(texts('nmap 10.0.0.1')).toContain('start a job first');
  });

  it('clear empties the log without a line of its own', () => {
    expect(landingReply('clear')).toEqual({ lines: [], action: 'clear' });
  });

  it('an unknown command gets a shell-style error with a way forward', () => {
    const reply = landingReply('frobnicate');
    expect(reply.lines[0].kind).toBe('err');
    expect(reply.lines[0].text).toContain('command not found');
    expect(reply.lines[0].text).toContain('start');
  });

  it('an empty line says nothing', () => {
    expect(landingReply('   ')).toEqual({ lines: [] });
  });

  it('the tagline is the one the page types out', () => {
    expect(TAGLINE.length).toBeGreaterThan(20);
  });
});
