// The soundtrack's score, checked without audio: the key, the chord loop, the layer mix and the tempo.
// Whether it sounds good is a listening question. These tests catch wrong notes, bad loops and levels that break.

import { describe, expect, it } from 'vitest';
import { barScore, bpmFor, layerMix, LOOP_BARS, loopChords, midiToHz, seededRand, type NoteEvent } from '../src/lib/music';

const A_MINOR_PITCH_CLASSES = new Set([9, 11, 0, 2, 4, 5, 7]); // A B C D E F G (natural minor)

describe('score', () => {
  it('the loop is eight bars: Am F C G Am F Dm E', () => {
    expect(LOOP_BARS).toBe(8);
    expect(loopChords()).toEqual(['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E']);
  });

  it('every pitched note sits in A minor, except the E chord, which adds G# for the lift', () => {
    for (let bar = 0; bar < LOOP_BARS * 2; bar++) {
      // Bar 7 of each loop is the E chord. Its major third (G#) is the one deliberate step outside the key.
      const allowed = bar % LOOP_BARS === 7 ? new Set([...A_MINOR_PITCH_CLASSES, 8]) : A_MINOR_PITCH_CLASSES;
      for (const e of barScore(bar, seededRand(bar + 1))) {
        if (e.note === undefined) continue;
        expect(allowed.has(((e.note % 12) + 12) % 12), `bar ${bar} ${e.kind} ${e.note}`).toBe(true);
      }
    }
  });

  it('each bar starts with the bass on the root of its chord', () => {
    const rootByBar = ['A', 'F', 'C', 'G', 'A', 'F', 'D', 'E'];
    const pitchClass: Record<string, number> = { A: 9, C: 0, D: 2, E: 4, F: 5, G: 7 };
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const bass = barScore(bar, seededRand(3)).find((e) => e.kind === 'bass' && e.step === 0)!;
      expect(((bass.note! % 12) + 12) % 12).toBe(pitchClass[rootByBar[bar]]);
    }
  });

  it('a seeded bar is the same every time, so tests and replays agree', () => {
    const a = barScore(5, seededRand(42));
    const b = barScore(5, seededRand(42));
    expect(a).toEqual(b);
  });

  it('all steps stay inside one bar of sixteenths, and velocities stay in range', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      for (const e of barScore(bar, seededRand(bar))) {
        expect(e.step).toBeGreaterThanOrEqual(0);
        expect(e.step).toBeLessThan(16);
        expect(e.velocity).toBeGreaterThan(0);
        expect(e.velocity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('drums keep a kick on the one, a snare on the backbeat, and hats in between', () => {
    const events: NoteEvent[] = barScore(0, seededRand(7));
    expect(events.some((e) => e.kind === 'kick' && e.step === 0)).toBe(true);
    expect(events.some((e) => e.kind === 'snare' && e.step === 4)).toBe(true);
    expect(events.some((e) => e.kind === 'snare' && e.step === 12)).toBe(true);
    expect(events.some((e) => e.kind === 'hat')).toBe(true);
  });

  it('pads ring for a whole bar, so the chord is always under the melody', () => {
    const pads = barScore(2, seededRand(9)).filter((e) => e.kind === 'pad');
    expect(pads.length).toBe(3);
    expect(pads.every((p) => p.step === 0 && p.length === 16)).toBe(true);
  });
});

describe('layers and tempo', () => {
  it('menus are calm: no tense layer, filter closed', () => {
    const mix = layerMix(0);
    expect(mix.tense).toBe(0);
    expect(mix.cutoff).toBeLessThan(1000);
    expect(mix.calm).toBeGreaterThan(0.5);
  });

  it('a high trace brings the tense layer up and opens the filter', () => {
    const low = layerMix(0.2);
    const high = layerMix(0.9);
    expect(high.tense).toBeGreaterThan(low.tense);
    expect(high.cutoff).toBeGreaterThan(low.cutoff);
  });

  it('the calm layer never drops out, even at the top', () => {
    expect(layerMix(1).calm).toBeGreaterThan(0.5);
  });

  it('out-of-range intensities are clamped', () => {
    expect(layerMix(-5)).toEqual(layerMix(0));
    expect(layerMix(5)).toEqual(layerMix(1));
  });

  it('tempo rises from 96 to 128 BPM with intensity', () => {
    expect(bpmFor(0)).toBe(96);
    expect(bpmFor(1)).toBe(128);
    expect(bpmFor(0.5)).toBeGreaterThan(96);
    expect(bpmFor(0.5)).toBeLessThan(128);
  });

  it('A4 is 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
  });
});
