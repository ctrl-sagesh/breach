// Every mission must be beatable on every difficulty tier. Each mission is played through its own `solution`,
// typed exactly as a player would type it, and must end in status "won" with trace under 100.

import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/engine/session';
import { TIERS } from '../src/engine/difficulty';
import { MISSIONS } from '../src/missions';
import type { MissionDef, Tier } from '../src/engine/types';

/** Index of the flag submission in a solution: everything before it is the setup, everything after it is the ending. */
const flagStep = (m: MissionDef): number => m.solution.findIndex((s) => s.startsWith('submit '));

describe('mission data', () => {
  it('has unique ids and consecutive numbers', () => {
    const ids = MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    MISSIONS.forEach((m, i) => expect(m.number).toBe(i + 1));
  });

  it.each(MISSIONS.map((m) => [m.codename, m] as const))('%s has briefing, debrief, three hints and a rig', (_name, m) => {
    expect(m.briefing.length).toBeGreaterThan(0);
    expect(m.debrief.length).toBeGreaterThan(0);
    expect(m.hints).toHaveLength(3);
    m.hints.forEach((h) => expect(h.trim().length).toBeGreaterThan(0));
    expect(m.machines.some((d) => d.id === 'rig')).toBe(true);
    expect(m.machines.some((d) => d.id === m.start.machine)).toBe(true);
  });

  it.each(MISSIONS.map((m) => [m.codename, m] as const))('%s: every machine ip is unique and every neighbour exists', (_name, m) => {
    const ips = m.machines.map((d) => d.ip);
    expect(new Set(ips).size).toBe(ips.length);
    for (const d of m.machines) {
      for (const n of d.neighbors) expect(ips, `${d.hostname} -> ${n}`).toContain(n);
    }
  });

  it.each(MISSIONS.map((m) => [m.codename, m] as const))('%s: tier overrides only reference machines that exist', (_name, m) => {
    const ids = m.machines.map((d) => d.id);
    for (const tier of Object.keys(m.tierOverrides ?? {})) {
      for (const id of Object.keys(m.tierOverrides?.[tier as Tier]?.machines ?? {})) {
        expect(ids, `${tier} override for ${id}`).toContain(id);
      }
    }
  });
});

describe.each(TIERS)('%s tier', (tier) => {
  describe.each(MISSIONS.map((m) => [m.number, m.codename, m] as const))('Mission %i %s', (_number, _codename, mission) => {
    it('is beatable with its intended solution', () => {
      const session = new GameSession(mission, { tier });
      for (const step of mission.solution) {
        expect(session.finished, `session ended before "${step}"`).toBe(false);
        session.input(step);
      }
      expect(session.status).toBe('won');
      expect(session.trace).toBeLessThan(100);
    });

    it('is beatable with the same walkthrough typed as real Kali commands', () => {
      const session = new GameSession(mission, { tier });
      for (const step of mission.kaliSolution) {
        expect(session.finished, `session ended before "${step}"`).toBe(false);
        session.input(step);
      }
      expect(session.status).toBe('won');
      expect(session.trace).toBeLessThan(100);
    });

    it('does not accept a wrong flag', () => {
      const session = new GameSession(mission, { tier });
      const stop = flagStep(mission);
      expect(stop).toBeGreaterThan(-1);
      for (const step of mission.solution.slice(0, stop)) session.input(step);

      const out = session.input('submit BREACH{definitely_not_it}');
      expect(out.lines.some((l) => l.text.includes('not the flag'))).toBe(true);
      expect(session.status).toBe('playing');
    });
  });
});
