// CORS origin matching: exact hosts, one safe wildcard label, and the tricks that must stay rejected.

import { describe, expect, it } from 'vitest';
import { corsHeaders, originAllowed, parseAllowedOrigins } from '../src/lib/origins';

const ALLOWED = ['https://breachgame.xyz', 'https://*.itch.zone', 'https://*.crazygames.com', 'https://crazygames.com', 'http://localhost:3000'];

describe('parseAllowedOrigins', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseAllowedOrigins(' https://a.test , https://b.test ,, ')).toEqual(['https://a.test', 'https://b.test']);
  });

  it('an empty string parses to no origins', () => {
    expect(parseAllowedOrigins('')).toEqual([]);
  });
});

describe('originAllowed: the hosts this game actually needs', () => {
  it('matches the exact site', () => {
    expect(originAllowed('https://breachgame.xyz', ALLOWED)).toBe(true);
  });

  it('matches itch.io\'s game-serving subdomain, and other itch.zone subdomains', () => {
    expect(originAllowed('https://html-classic.itch.zone', ALLOWED)).toBe(true);
    expect(originAllowed('https://v-123.itch.zone', ALLOWED)).toBe(true);
  });

  it('matches a CrazyGames subdomain and the bare domain', () => {
    expect(originAllowed('https://games.crazygames.com', ALLOWED)).toBe(true);
    expect(originAllowed('https://crazygames.com', ALLOWED)).toBe(true);
  });

  it('matches localhost for local development', () => {
    expect(originAllowed('http://localhost:3000', ALLOWED)).toBe(true);
  });
});

describe('originAllowed: everything else stays rejected', () => {
  it('rejects an unrelated origin', () => {
    expect(originAllowed('https://evil.example', ALLOWED)).toBe(false);
  });

  it('rejects a bare wildcard domain that was not itself listed', () => {
    expect(originAllowed('https://itch.zone', ALLOWED)).toBe(false);
  });

  it('rejects a suffix trick: the real domain tacked onto an attacker domain', () => {
    expect(originAllowed('https://itch.zone.evil.example', ALLOWED)).toBe(false);
  });

  it('rejects a prefix trick: the real domain used as a path or query on an attacker origin', () => {
    expect(originAllowed('https://evil.example/itch.zone', ALLOWED)).toBe(false);
    expect(originAllowed('https://evil.example?x=https://real.itch.zone', ALLOWED)).toBe(false);
  });

  it('rejects more than one subdomain label where the pattern allows only one', () => {
    expect(originAllowed('https://a.b.itch.zone', ALLOWED)).toBe(false);
  });

  it('rejects the wrong scheme, since Origin always includes it', () => {
    expect(originAllowed('http://html-classic.itch.zone', ALLOWED)).toBe(false);
  });

  it('rejects a missing origin', () => {
    expect(originAllowed(null, ALLOWED)).toBe(false);
  });

  it('rejects everything when the allow list is empty', () => {
    expect(originAllowed('https://breachgame.xyz', [])).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('echoes the exact matched origin, never a wildcard, and varies on Origin', () => {
    const h = corsHeaders('https://html-classic.itch.zone', ALLOWED);
    expect(h['access-control-allow-origin']).toBe('https://html-classic.itch.zone');
    expect(h['vary']).toBe('Origin');
  });

  it('omits allow-origin for a host that is not on the list', () => {
    const h = corsHeaders('https://evil.example', ALLOWED);
    expect(h['access-control-allow-origin']).toBeUndefined();
  });

  it('omits allow-origin when there is no Origin header at all', () => {
    const h = corsHeaders(null, ALLOWED);
    expect(h['access-control-allow-origin']).toBeUndefined();
  });
});
