// Procedural dark ambient for long sessions. Three tracks, each generated from a seeded random source so nothing repeats
// on a short loop:
//   Night Shift  slow evolving pads, a soft sub-bass pulse, and a sparse distant melody
//   Signal       a minimal pulsing arpeggio, gentle filtered noise and glitchy textures
//   Cold Room    very sparse deep drones, with occasional data chirps
// Every track has a tension layer that fades in with the trace: a heartbeat-like bass pulse, faster ticks, and a filter
// that opens. Menus play the track at zero tension. Missions follow the trace.
//
// The score is pure data (trackEvents), so tests can check key, density, register and variation without audio.
// The player is browser only, created after the first click. Sine and triangle only, a low-pass on the whole bus, and a
// compressor, so nothing gets harsh.

import type { MusicTrack } from './save';

export type Rand = () => number;

export interface NoteEvent {
  /** Beat within the bar, 0 up to 4. Each bar is four beats. */
  beat: number;
  kind: 'pad' | 'sub' | 'melody' | 'arp' | 'drone' | 'chirp' | 'noise' | 'glitch' | 'heartbeat' | 'tick';
  /** MIDI note for pitched parts. Undefined for noise, ticks and heartbeats. */
  note?: number;
  /** Length in beats. */
  length: number;
  /** 0 to 1. */
  level: number;
}

export const TRACKS: MusicTrack[] = ['night-shift', 'signal', 'cold-room'];

export const TRACK_LABELS: Record<MusicTrack, string> = {
  'night-shift': 'Night Shift',
  signal: 'Signal',
  'cold-room': 'Cold Room',
};

/** Tempo of each track's beat, in beats per minute. Slow on purpose: these are for thinking, not dancing. */
export function tempoFor(track: MusicTrack): number {
  return track === 'signal' ? 84 : track === 'cold-room' ? 54 : 66;
}

/** D minor. Melody and arpeggio are drawn from this scale. */
const D_MINOR_PENTATONIC = [62, 65, 67, 69, 72, 74];

/** Chord loops, as roots and tones relative to D (MIDI 50). Each track rotates through its loop. */
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 50, tones: [53, 57, 60, 64] }, // Dm7
  { root: 58, tones: [62, 65, 69, 72] }, // Bbmaj7
  { root: 55, tones: [58, 62, 65, 69] }, // Gm7
  { root: 57, tones: [61, 64, 67, 71] }, // A7sus-ish
];

export const LOOP_BARS = CHORDS.length * 4;

function chordFor(bar: number): { root: number; tones: number[] } {
  return CHORDS[Math.floor((bar % LOOP_BARS) / 4)];
}

/**
 * Notes for one bar of a track. `bar` counts from zero. The random source decides the details: which melody note, how
 * dense the arpeggio is, when a chirp happens. The same seed gives the same bar.
 */
export function trackEvents(track: MusicTrack, bar: number, rand: Rand): NoteEvent[] {
  const chord = chordFor(bar);
  const events: NoteEvent[] = [];

  if (track === 'night-shift') {
    // Pads change slowly: one chord tone is held per beat with long releases, and the voicing shifts every two bars.
    const shift = bar % 2 === 0 ? 0 : 12;
    for (const tone of chord.tones.slice(0, 3)) events.push({ beat: 0, kind: 'pad', note: tone + shift, length: 4, level: 0.5 + rand() * 0.15 });
    // Sub bass: one soft pulse on the root, sometimes doubled.
    events.push({ beat: 0, kind: 'sub', note: chord.root - 12, length: 2, level: 0.55 });
    if (rand() < 0.4) events.push({ beat: 2.5, kind: 'sub', note: chord.root - 12, length: 1, level: 0.3 });
    // Melody: sparse, far apart, from the pentatonic. Most bars have none.
    if (rand() < 0.45) {
      const note = D_MINOR_PENTATONIC[Math.floor(rand() * D_MINOR_PENTATONIC.length)];
      events.push({ beat: 1 + rand() * 2, kind: 'melody', note, length: 2 + rand() * 2, level: 0.28 + rand() * 0.1 });
    }
  }

  if (track === 'signal') {
    // A minimal pulse: an arpeggio note on about half of the eighth notes, with the chord's tones and occasional gaps.
    for (let i = 0; i < 8; i++) {
      if (rand() < 0.45) continue;
      const tone = chord.tones[Math.floor(rand() * chord.tones.length)] + (rand() < 0.2 ? 12 : 0);
      events.push({ beat: i * 0.5, kind: 'arp', note: tone, length: 0.4, level: 0.2 + rand() * 0.08 });
    }
    // Gentle filtered noise under the whole bar, breathing with the bar's phase.
    events.push({ beat: 0, kind: 'noise', length: 4, level: 0.12 });
    // Glitch textures on some bars: a short burst that stutters.
    if (rand() < 0.3) {
      const at = 1 + Math.floor(rand() * 3) * 0.5;
      events.push({ beat: at, kind: 'glitch', length: 0.25, level: 0.18 });
      if (rand() < 0.5) events.push({ beat: at + 0.25, kind: 'glitch', length: 0.1, level: 0.12 });
    }
  }

  if (track === 'cold-room') {
    // Deep drones that breathe. The upper voice moves between a fourth below and an octave below, so the loop never repeats exactly.
    const upper = rand() < 0.5;
    events.push({ beat: 0, kind: 'drone', note: chord.root - 24, length: 4, level: 0.5 });
    events.push({ beat: 0, kind: 'drone', note: chord.root - (upper ? 17 : 12), length: 4, level: 0.25 });
    // Data chirps: short rising sweeps from the pentatonic, on roughly a third of bars.
    if (rand() < 0.35) {
      const chirp = D_MINOR_PENTATONIC[Math.floor(rand() * D_MINOR_PENTATONIC.length)] + 12;
      events.push({ beat: 1 + rand() * 2.5, kind: 'chirp', note: chirp, length: 0.5, level: 0.15 });
    }
  }

  return events;
}

/**
 * The tension layer for one bar: a heartbeat-like pulse whose rate climbs with intensity, and ticks that thicken.
 * At zero there is no tension layer at all.
 */
export function tensionEvents(intensity: number, rand: Rand): NoteEvent[] {
  const t = Math.max(0, Math.min(1, intensity));
  if (t <= 0.02) return [];
  const events: NoteEvent[] = [];
  // Heartbeat: two pulses per bar at low intensity, four at full, so the pulse quickens as the trace climbs.
  const pulses = t < 0.5 ? 2 : 4;
  const level = 0.1 + t * 0.35;
  for (let i = 0; i < pulses; i++) events.push({ beat: (i * 4) / pulses, kind: 'heartbeat', length: 0.4, level });
  // Ticks: sparse at first, then steady as the trace rises.
  const ticks = Math.round(t * 8);
  for (let i = 0; i < ticks; i++) {
    if (rand() < 0.3) continue;
    events.push({ beat: (i * 4) / Math.max(1, ticks) + rand() * 0.2, kind: 'tick', length: 0.05, level: 0.04 + t * 0.07 });
  }
  return events;
}

/** How loud each layer is and where the filter sits, for an intensity from 0 (menus) to 1 (full trace). */
export function layerMix(intensity: number): { base: number; tension: number; cutoff: number } {
  const t = Math.max(0, Math.min(1, intensity));
  return {
    base: 0.85 - t * 0.15,
    tension: t * t * 0.9,
    // The filter opens with the trace, but never past a level that gets harsh.
    cutoff: 900 + t * 4100,
  };
}

/** Tempo of the tension layer's heartbeat, in beats per minute. */
export function heartbeatBpm(intensity: number): number {
  return Math.round(50 + Math.max(0, Math.min(1, intensity)) * 50);
}

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Seeded random source. Tests use it to replay a bar exactly. */
export function seededRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reverb tail: stereo noise with a slow exponential decay. Long and soft, for a room, not a hall. */
export function impulseResponse(ctx: BaseAudioContext, seconds = 4.2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
  }
  return buffer;
}

/** A player for one track. Built from the score; schedules a bar ahead so timing holds even when the page is busy. */
export class TrackPlayer {
  private readonly ctx: AudioContext;
  readonly out: GainNode;
  private readonly base: GainNode;
  private readonly tension: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly reverb: ConvolverNode;
  private readonly wet: GainNode;
  private readonly track: MusicTrack;
  private readonly rand: Rand;
  private timer: number | null = null;
  private nextBar = 0;
  private barStart = 0;
  private intensity = 0;

  constructor(ctx: AudioContext, destination: AudioNode, track: MusicTrack, reverbIr: AudioBuffer) {
    this.ctx = ctx;
    this.track = track;
    this.rand = Math.random;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = layerMix(0).cutoff;
    this.filter.Q.value = 0.5;
    this.filter.connect(this.out);

    this.base = ctx.createGain();
    this.tension = ctx.createGain();
    this.base.gain.value = layerMix(0).base;
    this.tension.gain.value = layerMix(0).tension;
    this.base.connect(this.filter);
    this.tension.connect(this.filter);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = reverbIr;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.38;
    this.reverb.connect(this.wet).connect(this.out);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.barStart = this.ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => this.schedule(), 120);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Fades this track in or out over a few seconds. */
  fadeTo(level: number, seconds: number): void {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(level, now + seconds);
  }

  /** Crossfades the tension layer and the filter. 0 is a menu, 1 is a trace near the limit. */
  setIntensity(target: number): void {
    this.intensity = Math.max(0, Math.min(1, target));
    const now = this.ctx.currentTime;
    const mix = layerMix(this.intensity);
    this.base.gain.setTargetAtTime(mix.base, now, 1.2);
    this.tension.gain.setTargetAtTime(mix.tension, now, 0.9);
    this.filter.frequency.setTargetAtTime(mix.cutoff, now, 1.2);
  }

  private beatSeconds(): number {
    return 60 / tempoFor(this.track);
  }

  private schedule(): void {
    const barSeconds = this.beatSeconds() * 4;
    while (this.barStart < this.ctx.currentTime + 0.5) {
      const events = [...trackEvents(this.track, this.nextBar, this.rand), ...tensionEvents(this.intensity, this.rand)];
      for (const e of events) this.play(e, this.barStart + e.beat * this.beatSeconds(), this.beatSeconds());
      this.barStart += barSeconds;
      this.nextBar++;
    }
  }

  private play(e: NoteEvent, when: number, beat: number): void {
    const ctx = this.ctx;
    const dur = Math.max(0.05, e.length * beat);
    switch (e.kind) {
      case 'pad':
      case 'drone':
      case 'melody':
      case 'sub':
      case 'arp':
      case 'chirp': {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = e.kind === 'sub' || e.kind === 'drone' ? 'sine' : 'triangle';
        const hz = midiToHz(e.note ?? 60);
        if (e.kind === 'chirp') {
          osc.frequency.setValueAtTime(hz * 0.6, when);
          osc.frequency.exponentialRampToValueAtTime(hz * 1.4, when + dur);
        } else {
          osc.frequency.setValueAtTime(hz, when);
        }
        const attack = e.kind === 'pad' || e.kind === 'drone' ? Math.min(2.5, dur * 0.5) : e.kind === 'melody' ? 0.25 : 0.02;
        const peak = e.level * (e.kind === 'arp' ? 0.12 : e.kind === 'sub' ? 0.5 : 0.09);
        amp.gain.setValueAtTime(0.0001, when);
        amp.gain.linearRampToValueAtTime(peak, when + attack);
        amp.gain.setValueAtTime(peak, when + Math.max(attack, dur - 0.3));
        amp.gain.linearRampToValueAtTime(0.0001, when + dur + (e.kind === 'pad' || e.kind === 'drone' ? 1.5 : 0.4));
        osc.connect(amp);
        amp.connect(this.base);
        if (e.kind === 'melody' || e.kind === 'pad' || e.kind === 'chirp') amp.connect(this.reverb);
        osc.start(when);
        osc.stop(when + dur + 2);
        return;
      }
      case 'noise':
        return this.noise(when, dur, 0.04 * e.level, 900, this.base);
      case 'glitch':
        return this.noise(when, dur, 0.22 * e.level, 3200, this.reverb);
      case 'heartbeat': {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(68, when);
        osc.frequency.exponentialRampToValueAtTime(42, when + 0.18);
        amp.gain.setValueAtTime(e.level * 0.7, when);
        amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
        osc.connect(amp).connect(this.tension);
        osc.start(when);
        osc.stop(when + 0.35);
        return;
      }
      case 'tick': {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 2400;
        amp.gain.setValueAtTime(e.level * 0.25, when);
        amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
        osc.connect(amp).connect(this.tension);
        osc.start(when);
        osc.stop(when + 0.06);
        return;
      }
    }
  }

  private noise(when: number, dur: number, level: number, centre: number, into: AudioNode): void {
    const ctx = this.ctx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = centre;
    band.Q.value = 0.8;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(level, when);
    amp.gain.linearRampToValueAtTime(0.0001, when + dur);
    src.connect(band).connect(amp).connect(into);
    src.start(when);
    src.stop(when + dur + 0.05);
  }
}

/**
 * The soundtrack: one track at a time, with a reverb, a compressor on the whole mix, and crossfades when the track
 * changes or the intensity moves. Built after the first click.
 */
export class MusicPlayer {
  private readonly ctx: AudioContext;
  private readonly bus: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private current: TrackPlayer | null = null;
  private retiring: TrackPlayer | null = null;
  private retireTimer: number | null = null;
  private track: MusicTrack = 'night-shift';
  private intensity = 0;
  private readonly reverbIr: AudioBuffer;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.reverbIr = impulseResponse(ctx);
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.3;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.compressor).connect(destination);
  }

  get running(): boolean {
    return this.current !== null;
  }

  /** Starts the chosen track. Calling it again while one plays changes the track with a crossfade. */
  start(track: MusicTrack = this.track): void {
    if (this.current) {
      this.setTrack(track);
      return;
    }
    this.track = track;
    this.current = this.build(track);
    this.current.start();
    this.current.fadeTo(1, 3);
    this.current.setIntensity(this.intensity);
  }

  setTrack(track: MusicTrack): void {
    if (track === this.track && this.current) return;
    this.track = track;
    if (!this.current) return;
    const old = this.current;
    old.fadeTo(0, 2.5);
    if (this.retiring) this.retiring.stop();
    this.retiring = old;
    this.retireTimer = window.setTimeout(() => {
      old.stop();
      if (this.retiring === old) this.retiring = null;
    }, 2800);
    this.current = this.build(track);
    this.current.start();
    this.current.fadeTo(1, 3);
    this.current.setIntensity(this.intensity);
  }

  /** Music level. Multiplies the whole soundtrack, which the caller sets from the music slider. */
  setLevel(level: number): void {
    this.bus.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), this.ctx.currentTime, 0.2);
  }

  /** 0 on menus, rising with the trace in a mission. */
  setIntensity(target: number): void {
    this.intensity = Math.max(0, Math.min(1, target));
    this.current?.setIntensity(this.intensity);
    this.retiring?.setIntensity(this.intensity);
  }

  stop(): void {
    this.current?.stop();
    this.retiring?.stop();
    this.current = null;
    this.retiring = null;
    if (this.retireTimer !== null) window.clearTimeout(this.retireTimer);
  }

  private build(track: MusicTrack): TrackPlayer {
    const player = new TrackPlayer(this.ctx, this.bus, track, this.reverbIr);
    player.out.gain.value = 0;
    return player;
  }
}
