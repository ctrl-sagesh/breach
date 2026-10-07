// Sound synthesised with the Web Audio API. No audio files.
// Two buses: effects and music, each with its own toggle, both under a master volume.
// Everything fails silently when audio is unsupported or not yet allowed to start (autoplay policy).
// Levels are kept low on purpose: nothing should be harsh.

import type { SoundEvent } from '../engine/types';
import { MusicPlayer } from './music';
import type { MusicTrack } from './save';

export interface AudioSettings {
  volume: number; // 0 to 1
  sfx: boolean;
  music: boolean;
  /** Music level, as a fraction of the effects level. 0.4 means 40 percent. */
  musicVolume: number;
  track: MusicTrack;
  /** Mechanical keyboard sound, independent of sfx. */
  keySounds: boolean;
  keySoundsVolume: number;
}

interface Graph {
  ctx: AudioContext;
  sfxBus: GainNode;
  musicBus: GainNode;
  keyBus: GainNode;
  music: MusicPlayer | null;
}

const MASTER = 0.5; // global headroom
const SFX_LEVEL = 0.7;
/** Minimum gap between key sounds, so holding a key (OS auto-repeat) never becomes a continuous hiss. */
const KEY_THROTTLE_MS = 30;

let settings: AudioSettings = { volume: 0.8, sfx: true, music: true, musicVolume: 0.4, track: 'night-shift', keySounds: true, keySoundsVolume: 0.5 };
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
    const keyBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    keyBus.connect(master);
    graph = { ctx, sfxBus, musicBus, keyBus, music: null };
    applySettings();
    return graph;
  } catch {
    return null;
  }
}

function applySettings(): void {
  if (!graph) return;
  const { ctx, sfxBus, musicBus, keyBus } = graph;
  const now = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(settings.sfx ? SFX_LEVEL * settings.volume : 0, now, 0.02);
  musicBus.gain.setTargetAtTime(settings.music ? SFX_LEVEL * settings.volume * settings.musicVolume : 0, now, 0.05);
  keyBus.gain.setTargetAtTime(settings.keySounds ? SFX_LEVEL * settings.volume * settings.keySoundsVolume : 0, now, 0.02);
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
  /** Which bus to render into. Defaults to sfxBus; the keyboard sound uses keyBus instead. */
  bus?: GainNode;
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
  osc.connect(gain).connect(o.bus ?? g.sfxBus);
  osc.start(start);
  osc.stop(start + o.duration + 0.02);
}

function noise(g: Graph, duration: number, volume: number, bus?: GainNode, delay = 0): void {
  const { ctx } = g;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(gain).connect(bus ?? g.sfxBus);
  src.start(ctx.currentTime + delay);
}

/**
 * Starts the soundtrack. Call it from a user gesture (the browser blocks sound until one happens).
 * Menus and the landing page sit at intensity 0. Missions follow the trace through setTension.
 */
export function startMusic(): void {
  const g = context();
  if (!g) return;
  if (!g.music) g.music = new MusicPlayer(g.ctx, g.musicBus);
  if (!g.music.running) g.music.start(settings.track);
  setTension(tension);
}

/** Kept for existing callers. */
export const startAmbience = startMusic;

/** Switches the soundtrack with a crossfade. Before the first click it only remembers the choice. */
export function setMusicTrack(track: MusicTrack): void {
  settings = { ...settings, track };
  graph?.music?.setTrack(track);
}

/** Called whenever the trace changes, and with 0 on menus. The soundtrack crossfades to match. */
export function setTension(trace: number): void {
  tension = Math.max(0, Math.min(100, trace));
  graph?.music?.setIntensity(tension / 100);
}

export type KeySoundVariant = Extract<SoundEvent, 'key' | 'key-space' | 'key-enter' | 'key-backspace'>;

/**
 * Which keyboard sound (if any) a keystroke gets. Pure, so it is tested without a browser. Modifier keys, arrows,
 * Tab and the like get null: they are not a "typing" sound.
 */
export function keyVariantFor(key: string): KeySoundVariant | null {
  if (key === ' ') return 'key-space';
  if (key === 'Enter') return 'key-enter';
  if (key === 'Backspace') return 'key-backspace';
  if (key.length === 1) return 'key';
  return null;
}

/** Multiplies `center` by a random factor within `±spread` (0.1 means ±10%), so no two keystrokes sound identical. */
function jitter(center: number, spread: number): number {
  return center * (1 + (Math.random() * 2 - 1) * spread);
}

interface KeyProfile {
  freq: number;
  bodyDuration: number;
  bodyVolume: number;
  clickDuration: number;
  clickVolume: number;
}

/** Regular keys, space (deeper, bigger switch), Enter (heavier) and Backspace (lighter) each get their own feel. */
const KEY_PROFILES: Record<KeySoundVariant, KeyProfile> = {
  key: { freq: 150, bodyDuration: 0.045, bodyVolume: 0.05, clickDuration: 0.006, clickVolume: 0.032 },
  'key-space': { freq: 92, bodyDuration: 0.062, bodyVolume: 0.062, clickDuration: 0.009, clickVolume: 0.03 },
  'key-enter': { freq: 78, bodyDuration: 0.08, bodyVolume: 0.08, clickDuration: 0.008, clickVolume: 0.038 },
  'key-backspace': { freq: 195, bodyDuration: 0.028, bodyVolume: 0.032, clickDuration: 0.005, clickVolume: 0.024 },
};

/**
 * A mechanical switch: a short noise transient (the click) under a low pitched body (the thock), both randomised in
 * pitch, level and timing so typing never sounds like a loop. Enter adds a tiny metallic spring release after the hit.
 */
function mechanicalKey(g: Graph, variant: KeySoundVariant): void {
  const bus = g.keyBus;
  const profile = KEY_PROFILES[variant];
  const startDelay = Math.random() * 0.006; // up to 6ms, so repeated keys never land exactly on the beat
  const freq = jitter(profile.freq, 0.08);
  const bodyVolume = jitter(profile.bodyVolume, 0.18);
  const clickVolume = jitter(profile.clickVolume, 0.2);

  noise(g, profile.clickDuration, clickVolume, bus, startDelay);
  tone(g, { type: 'sine', freq, endFreq: freq * 0.72, duration: profile.bodyDuration, volume: bodyVolume, delay: startDelay, bus });

  if (variant === 'key-enter') {
    tone(g, { type: 'triangle', freq: jitter(2200, 0.1), duration: 0.03, volume: jitter(0.014, 0.3), delay: startDelay + 0.016, bus });
  }
}

export function play(event: SoundEvent): void {
  const g = context();
  if (!g) return;

  if (event === 'key' || event === 'key-space' || event === 'key-enter' || event === 'key-backspace') {
    // Keyboard sound has its own toggle and level, so it is not gated by the general sfx switch.
    if (!settings.keySounds) return;
    const now = Date.now();
    if (now - lastKey < KEY_THROTTLE_MS) return;
    lastKey = now;
    mechanicalKey(g, event);
    return;
  }

  if (!settings.sfx) return;
  switch (event) {
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
