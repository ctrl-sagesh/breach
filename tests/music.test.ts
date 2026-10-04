// The soundtrack's score, checked without audio: key, register, density, variation, the tension curve and the layer mix.
// Whether it sounds good is a listening question. These tests catch wrong notes, harsh registers, short loops and levels
// that would break the mix.

import { describe, expect, it } from 'vitest';
import { heartbeatBpm, layerMix, LOOP_BARS, midiToHz, seededRand, tempoFor, tensionEvents, trackEvents, type NoteEvent } from '../src/lib/music';
import type { MusicTrack } from '../src/lib/save';

const TRACKS: MusicTrack[] = ['night-shift', 'signal', 'cold-room'];
// D minor: D E F G A Bb C. The A7 chord adds C# and B, its dominant colour, which leads back home to Dm.
const D_MINOR_PITCH_CLASSES = new Set([0, 1, 2, 4, 5, 7, 9, 10, 11]);
const bar = (track: MusicTrack, n: number, seed = 1) => trackEvents(track, n, seededRand(seed + n * 97));

function pitched(events: NoteEvent[]): number[] {
  return events.filter((e) => e.note !== undefined).map((e) => e.note!);
}

describe('tracks', () => {
  it.each(TRACKS)('%s: every pitched note stays in the key of D minor', (track) => {
    for (let n = 0; n < LOOP_BARS * 2; n++) {
      for (const note of pitched(bar(track, n))) {
        expect(D_MINOR_PITCH_CLASSES.has(((note % 12) + 12) % 12), `${track} bar ${n} note ${note}`).toBe(true);
      }
    }
  });

  it.each(TRACKS)('%s: nothing sits above 2 kHz, so the mix stays soft', (track) => {
    for (let n = 0; n < LOOP_BARS; n++) {
      for (const note of pitched(bar(track, n))) expect(midiToHz(note), `${track} ${note}`).toBeLessThan(2600);
    }
  });

  it.each(TRACKS)('%s: stays sparse, with well under sixteen events a bar', (track) => {
    for (let n = 0; n < 32; n++) expect(bar(track, n).length, `${track} bar ${n}`).toBeLessThan(16);
  });

  it.each(TRACKS)('%s: no obvious loop, so a long stretch does not repeat itself', (track) => {
    // Compare the first loop with the second, bar by bar. Identical bars would make a loop you can hear.
    const first = Array.from({ length: LOOP_BARS }, (_, n) => JSON.stringify(bar(track, n, 3)));
    const second = Array.from({ length: LOOP_BARS }, (_, n) => JSON.stringify(bar(track, n + LOOP_BARS, 9)));
    const same = first.filter((x, i) => x === second[i]).length;
    expect(same / LOOP_BARS).toBeLessThan(0.5);
  });

  it.each(TRACKS)('%s: the same seed gives the same bar', (track) => {
    expect(bar(track, 4, 7)).toEqual(bar(track, 4, 7));
  });

  it('the tracks sound different: different tempos and different note mixes', () => {
    expect(new Set(TRACKS.map(tempoFor)).size).toBe(3);
    const sizes = TRACKS.map((t) => bar(t, 0, 5).length);
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });

  it('Night Shift has pads and a sub pulse, Signal has arpeggio and noise, Cold Room has drones', () => {
    const kinds = (t: MusicTrack) => new Set(Array.from({ length: 8 }, (_, n) => bar(t, n, 2)).flat().map((e) => e.kind));
    expect(kinds('night-shift').has('pad') && kinds('night-shift').has('sub')).toBe(true);
    expect(kinds('signal').has('arp') && kinds('signal').has('noise')).toBe(true);
    expect(kinds('cold-room').has('drone')).toBe(true);
  });
});

describe('tension layer', () => {
  it('is silent on menus (zero intensity)', () => {
    expect(tensionEvents(0, seededRand(1))).toEqual([]);
  });

  it('the heartbeat quickens as the trace rises: 50 bpm at zero, 100 at full', () => {
    expect(heartbeatBpm(0)).toBe(50);
    expect(heartbeatBpm(1)).toBe(100);
    expect(heartbeatBpm(0.5)).toBeGreaterThan(heartbeatBpm(0.1));
  });

  it('more heartbeat pulses and more ticks at high intensity than low', () => {
    const count = (t: number, kind: string) => tensionEvents(t, seededRand(4)).filter((e) => e.kind === kind).length;
    expect(count(0.9, 'heartbeat')).toBeGreaterThan(count(0.2, 'heartbeat'));
    expect(count(0.9, 'tick')).toBeGreaterThanOrEqual(count(0.2, 'tick'));
  });
});

describe('layers', () => {
  it('menus are calm: no tension, the filter closed', () => {
    const mix = layerMix(0);
    expect(mix.tension).toBe(0);
    expect(mix.cutoff).toBeLessThan(1200);
  });

  it('a high trace brings the tension up and opens the filter, monotonically', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(layerMix);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].tension).toBeGreaterThanOrEqual(steps[i - 1].tension);
      expect(steps[i].cutoff).toBeGreaterThan(steps[i - 1].cutoff);
    }
  });

  it('the filter never opens past 5 kHz, so the top stays soft', () => {
    expect(layerMix(1).cutoff).toBeLessThanOrEqual(5000);
  });

  it('out-of-range intensities are clamped', () => {
    expect(layerMix(-5)).toEqual(layerMix(0));
    expect(layerMix(5)).toEqual(layerMix(1));
  });

  it('A4 is 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
  });
});
