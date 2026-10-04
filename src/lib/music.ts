// Procedural dark synthwave: a bassline, an arpeggio, a pad, soft drums and a chord loop, all synthesised in Web Audio.
// Two layers share one score. The calm layer (pad and bass) always plays. The tense layer (arpeggio and drums) fades in
// as the trace rises, and the filter opens with it. Menus sit at intensity 0. Missions follow the trace.
//
// The score is pure data (barScore), so tests can check the key, the chord loop and the layer mix without any audio.

export type Rand = () => number;

export interface NoteEvent {
  /** 16th-note step within the bar, 0 to 15. */
  step: number;
  kind: 'pad' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat';
  /** MIDI note for pitched parts. Undefined for drums. */
  note?: number;
  /** Steps the note lasts. Pads ring for a whole bar. */
  length: number;
  /** 0 to 1, with a little human variation. */
  velocity: number;
}

interface Chord {
  name: string;
  root: number;
  tones: number[];
}

/** A minor, MIDI 57 is A3. The chord loop is 8 bars long: Am F C G Am F Dm E. The E gives the tense layer its lift. */
const LOOP: Chord[] = [
  { name: 'Am', root: 57, tones: [57, 60, 64] },
  { name: 'F', root: 53, tones: [53, 57, 60] },
  { name: 'C', root: 48, tones: [48, 52, 55] },
  { name: 'G', root: 55, tones: [55, 59, 62] },
  { name: 'Am', root: 57, tones: [57, 60, 64] },
  { name: 'F', root: 53, tones: [53, 57, 60] },
  { name: 'Dm', root: 50, tones: [50, 53, 57] },
  { name: 'E', root: 52, tones: [52, 56, 59] },
];

export const LOOP_BARS = LOOP.length;

/** Bass patterns, as 16th-note steps. The bassline picks one per bar. */
const BASS_PATTERNS = [
  [0, 6, 8, 14],
  [0, 4, 8, 12],
  [0, 3, 8, 11],
];

/** Arpeggio shapes over the chord tones. */
const ARP_SHAPES: number[][] = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3],
];

export function bpmFor(intensity: number): number {
  return Math.round(96 + Math.max(0, Math.min(1, intensity)) * 32);
}

/** Notes for one bar of the loop. `bar` counts from zero and wraps every LOOP_BARS bars. */
export function barScore(bar: number, rand: Rand): NoteEvent[] {
  const chord = LOOP[bar % LOOP_BARS];
  const events: NoteEvent[] = [];
  const humanise = () => 0.85 + rand() * 0.25;

  // Pad: the whole chord, one bar long, an octave up.
  for (const tone of chord.tones) events.push({ step: 0, kind: 'pad', note: tone + 12, length: 16, velocity: 0.55 * humanise() });

  // Bass: one note per hit, the root an octave down.
  const pattern = BASS_PATTERNS[Math.floor(rand() * BASS_PATTERNS.length)];
  for (const step of pattern) events.push({ step, kind: 'bass', note: chord.root - 12, length: 2, velocity: (step % 8 === 0 ? 0.9 : 0.6) * humanise() });

  // Arpeggio: 16ths over the chord tones, with a shape chosen per bar.
  const shape = ARP_SHAPES[Math.floor(rand() * ARP_SHAPES.length)];
  const octave = bar % 4 === 3 ? 12 : 0;
  for (let step = 0; step < 16; step += 2) {
    const idx = shape[(step / 2) % shape.length];
    const tone = chord.tones[idx % chord.tones.length] + (idx >= chord.tones.length ? 12 : 0) + octave;
    events.push({ step, kind: 'arp', note: tone + 12, length: 2, velocity: 0.5 * humanise() });
  }

  // Drums: a soft kick and snare, with the hats filling in and an occasional extra kick.
  for (const step of [0, 8]) events.push({ step, kind: 'kick', length: 1, velocity: 0.7 * humanise() });
  if (bar % 4 === 3 && rand() < 0.5) events.push({ step: 10, kind: 'kick', length: 1, velocity: 0.5 * humanise() });
  for (const step of [4, 12]) events.push({ step, kind: 'snare', length: 1, velocity: 0.55 * humanise() });
  for (let step = 2; step < 16; step += 4) {
    if (rand() < 0.9) events.push({ step, kind: 'hat', length: 1, velocity: 0.35 * humanise() });
  }
  if (rand() < 0.25) events.push({ step: 14, kind: 'hat', length: 1, velocity: 0.25 * humanise() });

  return events;
}

/** How loud each layer is, and where the filter sits, for an intensity from 0 (menus) to 1 (full trace). */
export function layerMix(intensity: number): { calm: number; tense: number; cutoff: number } {
  const t = Math.max(0, Math.min(1, intensity));
  return {
    calm: 0.8 - t * 0.2,
    tense: t * t * 0.85,
    cutoff: 600 + t * 3200,
  };
}

/** The chord names of the loop, in order. Used by tests and the debug overlay. */
export function loopChords(): string[] {
  return LOOP.map((c) => c.name);
}

/** Random number generator with a seed, so tests can replay a bar exactly. */
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

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Reverb tail: stereo noise with an exponential decay. Good enough for a room, cheap to build. */
export function impulseResponse(ctx: BaseAudioContext, seconds = 2.2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
  }
  return buffer;
}

/**
 * The Web Audio player. Schedules barScore events a little ahead of time, so the timing is steady even when the
 * page is busy. Browser only: it is created by audio.ts after the first click.
 */
export class MusicPlayer {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly calmBus: GainNode;
  private readonly tenseBus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly reverb: ConvolverNode;
  private readonly wet: GainNode;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private events: NoteEvent[] = [];
  private intensity = 0;
  private readonly rand: Rand = Math.random;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = layerMix(0).cutoff;
    this.filter.Q.value = 0.8;
    this.filter.connect(this.out);

    this.calmBus = ctx.createGain();
    this.tenseBus = ctx.createGain();
    this.calmBus.gain.value = layerMix(0).calm;
    this.tenseBus.gain.value = layerMix(0).tense;
    this.calmBus.connect(this.filter);
    this.tenseBus.connect(this.filter);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulseResponse(ctx);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;
    this.reverb.connect(this.wet).connect(this.out);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Crossfades toward the target intensity over about two seconds. 0 is menus, 1 is a trace near the limit. */
  setIntensity(target: number): void {
    this.intensity = Math.max(0, Math.min(1, target));
    const now = this.ctx.currentTime;
    const mix = layerMix(this.intensity);
    this.calmBus.gain.setTargetAtTime(mix.calm, now, 0.7);
    this.tenseBus.gain.setTargetAtTime(mix.tense, now, 0.7);
    this.filter.frequency.setTargetAtTime(mix.cutoff, now, 0.7);
  }

  private schedule(): void {
    const stepLength = 60 / bpmFor(this.intensity) / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      if (this.step === 0) this.events = barScore(this.bar, this.rand);
      for (const event of this.events) {
        if (event.step === this.step) this.play(event, this.nextTime, stepLength);
      }
      this.step++;
      this.nextTime += stepLength;
      if (this.step === 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private play(e: NoteEvent, when: number, stepLength: number): void {
    const ctx = this.ctx;
    const dur = Math.max(0.05, e.length * stepLength);
    if (e.kind === 'kick') return this.kick(when, e.velocity);
    if (e.kind === 'snare') return this.snare(when, e.velocity);
    if (e.kind === 'hat') return this.hat(when, e.velocity);

    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const freq = midiToHz(e.note ?? 60);
    if (e.kind === 'pad') {
      osc.type = 'sawtooth';
      osc.detune.value = (Math.random() - 0.5) * 12;
      const attack = 0.9;
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(e.velocity * 0.06, when + attack);
      amp.gain.setValueAtTime(e.velocity * 0.06, when + dur - 0.4);
      amp.gain.linearRampToValueAtTime(0, when + dur);
      osc.frequency.setValueAtTime(freq, when);
      osc.connect(amp);
      amp.connect(this.calmBus);
      amp.connect(this.reverb);
    } else if (e.kind === 'bass') {
      osc.type = 'sawtooth';
      amp.gain.setValueAtTime(e.velocity * 0.22, when);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.frequency.setValueAtTime(freq, when);
      osc.connect(amp).connect(this.calmBus);
    } else {
      // arp
      osc.type = 'square';
      amp.gain.setValueAtTime(e.velocity * 0.045, when);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.frequency.setValueAtTime(freq, when);
      osc.connect(amp).connect(this.tenseBus);
    }
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  private kick(when: number, velocity: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(120, when);
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    amp.gain.setValueAtTime(velocity * 0.5, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    osc.connect(amp).connect(this.tenseBus);
    osc.start(when);
    osc.stop(when + 0.32);
  }

  private snare(when: number, velocity: number): void {
    const ctx = this.ctx;
    const src = this.noise(0.2);
    const band = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    amp.gain.setValueAtTime(velocity * 0.22, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    src.connect(band).connect(amp).connect(this.tenseBus);
    src.start(when);
  }

  private hat(when: number, velocity: number): void {
    const ctx = this.ctx;
    const src = this.noise(0.05);
    const high = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    high.type = 'highpass';
    high.frequency.value = 7000;
    amp.gain.setValueAtTime(velocity * 0.12, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    src.connect(high).connect(amp).connect(this.tenseBus);
    src.start(when);
  }

  private noise(seconds: number): AudioBufferSourceNode {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}
