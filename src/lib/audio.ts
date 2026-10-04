// Sound synthesised with the Web Audio API. No audio files.
// Two buses: effects and music, each with its own toggle, both under a master volume.
// Everything fails silently when audio is unsupported or not yet allowed to start (autoplay policy).
// Levels are kept low on purpose: nothing should be harsh.

import type { SoundEvent } from '../engine/types';

export interface AudioSettings {
  volume: number; // 0 to 1
  sfx: boolean;
  music: boolean;
}

interface Graph {
  ctx: AudioContext;
  sfxBus: GainNode;
  musicBus: GainNode;
  drone: { filter: BiquadFilterNode; gain: GainNode } | null;
}

const MASTER = 0.5; // global headroom
const SFX_LEVEL = 0.7;
const MUSIC_LEVEL = 0.22;

let settings: AudioSettings = { volume: 0.8, sfx: true, music: true };
let graph: Graph | null = null;
let lastKey = 0;
let tension = 0;

function build(): Graph | null {
  try {
    if (graph) return graph;
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    graph = { ctx, sfxBus, musicBus, drone: null };
    applySettings();
    return graph;
  } catch {
    return null;
  }
}

function applySettings(): void {
  if (!graph) return;
  const { ctx, sfxBus, musicBus } = graph;
  const now = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(settings.sfx ? SFX_LEVEL * settings.volume : 0, now, 0.02);
  musicBus.gain.setTargetAtTime(settings.music ? MUSIC_LEVEL * settings.volume : 0, now, 0.05);
}

function context(): Graph | null {
  const g = build();
  if (g && g.ctx.state === 'suspended') void g.ctx.resume();
  return g;
}

export function setAudioSettings(next: AudioSettings): void {
  settings = { ...next, volume: Math.min(1, Math.max(0, next.volume)) };
  applySettings();
}

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  endFreq?: number;
  duration: number;
  volume?: number;
  delay?: number;
}

function tone(g: Graph, o: ToneOptions): void {
  const { ctx } = g;
  const start = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, start + o.duration);
  gain.gain.setValueAtTime(o.volume ?? 0.06, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + o.duration);
  osc.connect(gain).connect(g.sfxBus);
  osc.start(start);
  osc.stop(start + o.duration + 0.02);
}

function noise(g: Graph, duration: number, volume: number): void {
  const { ctx } = g;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(gain).connect(g.sfxBus);
  src.start();
}

/** Low drone under the whole game. Tension (0-100, the trace) opens the filter and raises the level. */
export function startAmbience(): void {
  const g = context();
  if (!g || g.drone) return;
  const { ctx, musicBus } = g;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220;
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  filter.connect(gain).connect(musicBus);
  for (const [freq, type, level] of [
    [55, 'sine', 0.9],
    [82.4, 'triangle', 0.35],
    [55.6, 'sawtooth', 0.12],
  ] as const) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = level;
    osc.connect(amp).connect(filter);
    osc.start();
  }
  g.drone = { filter, gain };
  setTension(tension);
}

/** Called whenever the trace changes. Smoothly tightens the drone as the trace climbs. */
export function setTension(trace: number): void {
  tension = Math.max(0, Math.min(100, trace));
  const g = graph;
  if (!g?.drone) return;
  const t = g.ctx.currentTime;
  g.drone.filter.frequency.setTargetAtTime(220 + tension * 5, t, 0.4);
  g.drone.gain.gain.setTargetAtTime(0.5 + tension * 0.01, t, 0.4);
}

export function play(event: SoundEvent): void {
  const g = context();
  if (!g || !settings.sfx) return;

  switch (event) {
    case 'key': {
      const now = Date.now();
      if (now - lastKey < 40) return; // quiet, and throttled so fast typing does not hiss
      lastKey = now;
      noise(g, 0.01, 0.012);
      tone(g, { type: 'square', freq: 2000, duration: 0.008, volume: 0.012 });
      break;
    }
    case 'command':
      tone(g, { type: 'sine', freq: 660, duration: 0.05, volume: 0.035 });
      break;
    case 'error':
      tone(g, { type: 'square', freq: 180, endFreq: 130, duration: 0.12, volume: 0.04 });
      break;
    case 'enter':
      tone(g, { type: 'square', freq: 220, endFreq: 110, duration: 0.09, volume: 0.05 });
      break;
    case 'tick':
      tone(g, { type: 'triangle', freq: 1500, duration: 0.03, volume: 0.03 });
      break;
    case 'alert':
      tone(g, { type: 'sawtooth', freq: 880, duration: 0.12, volume: 0.035 });
      tone(g, { type: 'sawtooth', freq: 660, duration: 0.12, volume: 0.035, delay: 0.14 });
      break;
    case 'alarm':
      [0, 0.28, 0.56].forEach((d) => tone(g, { type: 'square', freq: 740, endFreq: 520, duration: 0.22, volume: 0.035, delay: d }));
      break;
    case 'granted':
      // Digital chime: three bright bells, the last one ringing longest.
      [1318, 1760, 2093].forEach((f, i) => {
        tone(g, { type: 'sine', freq: f, duration: i === 2 ? 0.5 : 0.22, volume: 0.04, delay: i * 0.07 });
        tone(g, { type: 'triangle', freq: f * 2, duration: 0.12, volume: 0.008, delay: i * 0.07 });
      });
      break;
    case 'denied':
      // Harsh buzz: two detuned saws with a falling pitch.
      tone(g, { type: 'sawtooth', freq: 116, endFreq: 96, duration: 0.45, volume: 0.045 });
      tone(g, { type: 'square', freq: 122, endFreq: 100, duration: 0.45, volume: 0.02 });
      break;
    case 'chatter':
      // Fast data chatter while the cracker runs: many short blips at random pitches.
      for (let i = 0; i < 12; i++) tone(g, { type: 'square', freq: 1800 + Math.random() * 800, duration: 0.012, volume: 0.011, delay: i * 0.024 });
      break;
    case 'ping':
      // Radar ping for each open port found.
      tone(g, { type: 'sine', freq: 1200, endFreq: 2000, duration: 0.12, volume: 0.04 });
      break;
    case 'boom':
      // Explosion: a low sine drop under a burst of noise.
      tone(g, { type: 'sine', freq: 95, endFreq: 28, duration: 0.9, volume: 0.13 });
      noise(g, 0.7, 0.16);
      break;
    case 'trace':
      [0, 0.18].forEach((d) => tone(g, { type: 'triangle', freq: 1000, duration: 0.08, volume: 0.04, delay: d }));
      break;
    case 'glitch':
      noise(g, 0.25, 0.08);
      tone(g, { type: 'sawtooth', freq: 1400, endFreq: 90, duration: 0.25, volume: 0.03 });
      break;
    case 'rank':
      tone(g, { type: 'square', freq: 90, endFreq: 45, duration: 0.25, volume: 0.06 });
      [392, 494, 587].forEach((f, i) => tone(g, { type: 'triangle', freq: f, duration: 0.3, volume: 0.04, delay: 0.12 + i * 0.07 }));
      break;
    case 'sting':
      // Triumphant sting: a rising arpeggio over a short synth pad.
      [392, 523, 659, 784].forEach((f, i) => tone(g, { type: 'triangle', freq: f, duration: 0.22, volume: 0.045, delay: i * 0.1 }));
      tone(g, { type: 'sawtooth', freq: 196, duration: 0.9, volume: 0.02, delay: 0.1 });
      break;
    case 'win':
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(g, { type: 'triangle', freq: f, duration: 0.2, volume: 0.05, delay: i * 0.1 }));
      break;
    case 'fail':
      tone(g, { type: 'sawtooth', freq: 400, endFreq: 50, duration: 0.8, volume: 0.05 });
      break;
  }
}
