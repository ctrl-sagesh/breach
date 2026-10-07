// The feedback mailto: well-formed, prefilled with version and tier, mission included when given and left out otherwise.

import { describe, expect, it } from 'vitest';
import { buildFeedbackMailto } from '../src/lib/feedback';
import { BUG_REPORT_CONTACT } from '../src/missions/shared';

function decode(mailto: string): { address: string; subject: string; body: string } {
  const [address, query] = mailto.replace('mailto:', '').split('?');
  const params = new URLSearchParams(query);
  return { address, subject: params.get('subject') ?? '', body: params.get('body') ?? '' };
}

describe('buildFeedbackMailto', () => {
  it('addresses the bug report contact', () => {
    const { address } = decode(buildFeedbackMailto({ version: '1.0.0', tier: 'medium' }));
    expect(address).toBe(BUG_REPORT_CONTACT);
  });

  it('is well-formed: a mailto URL with percent-encoded subject and body', () => {
    const mailto = buildFeedbackMailto({ version: '1.0.0', tier: 'hard', mission: 'Ghost Protocol' });
    expect(mailto.startsWith('mailto:')).toBe(true);
    expect(mailto).toContain('subject=');
    expect(mailto).toContain('body=');
    expect(mailto).not.toMatch(/[\s]/); // a raw space would break some mail clients; everything must be encoded
  });

  it('prefills the version and tier', () => {
    const { body } = decode(buildFeedbackMailto({ version: '2.3.4', tier: 'easy' }));
    expect(body).toContain('Version: 2.3.4');
    expect(body).toContain('Tier: easy');
  });

  it('includes the mission when given', () => {
    const { body } = decode(buildFeedbackMailto({ version: '1.0.0', tier: 'medium', mission: 'Lighthouse' }));
    expect(body).toContain('Mission: Lighthouse');
  });

  it('omits the mission line entirely when none is given, such as from Settings', () => {
    const { body } = decode(buildFeedbackMailto({ version: '1.0.0', tier: 'medium' }));
    expect(body).not.toContain('Mission:');
  });

  it('leaves room for the player to describe the issue', () => {
    const { body } = decode(buildFeedbackMailto({ version: '1.0.0', tier: 'medium' }));
    expect(body.toLowerCase()).toContain('describe');
  });
});
