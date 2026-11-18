// Real recordings, played through the Web Audio API (see assets/audio/LICENSES.md for what and where from).
// Three buses: effects, music and keyboard, each with its own toggle, all under a master volume, plus a quiet
// ambient bed that runs under everything and comes up a little in missions.
// Everything fails silently: audio unsupported, not yet allowed to start (autoplay policy), or a clip that
// 404s or fails to decode. The game keeps working either way.
//
// The generative soundtrack (lib/music.ts) is a separate system, kept because it is built to never audibly loop
// over a long session the way a fixed recording would; this file only starts it and feeds it the trace.

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
  ambientGain: GainNode;
  ambientSource: AudioBufferSourceNode | null;
  music: MusicPlayer | null;
}

const MASTER = 0.5; // global headroom
const SFX_LEVEL = 0.7;
/** Minimum gap between key sounds, so holding a key (OS auto-repeat) never becomes a continuous hiss. */
const KEY_THROTTLE_MS = 30;
/** The hum's own level within the sfx bus: quiet at rest, a little more present once a mission is live. */
const AMBIENT_MENU = 0.35;
const AMBIENT_MISSION = 0.85;

let settings: AudioSettings = { volume: 0.8, sfx: true, music: true, musicVolume: 0.4, track: 'cyberpunk-drone', keySounds: true, keySoundsVolume: 0.5 };
let graph: Graph | null = null;
let lastKey = 0;
let tension = 0;
let ambienceActive = false;

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
    const ambientGain = ctx.createGain();
    ambientGain.gain.value = ambienceActive ? AMBIENT_MISSION : AMBIENT_MENU;
    sfxBus.connect(master);
    musicBus.connect(master);
    keyBus.connect(master);
    ambientGain.connect(sfxBus);
    graph = { ctx, sfxBus, musicBus, keyBus, ambientGain, ambientSource: null, music: null };
    applySettings();
    startAmbientLoop(graph);
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

// ---- sample loading ---------------------------------------------------------------------------

/** Fetches and decodes a clip once; later calls (and failures) reuse the same promise. Relative URL, so a nested deploy still finds it. */
const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  let p = bufferCache.get(url);
  if (p) return p;
  p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .catch(() => null);
  bufferCache.set(url, p);
  return p;
}

function playBuffer(g: Graph, buffer: AudioBuffer, bus: GainNode, volume = 1, rate = 1): void {
  const src = g.ctx.createBufferSource();
  src.buffer = buffer;
  if (rate !== 1) src.playbackRate.value = rate;
  if (volume === 1) {
    src.connect(bus);
  } else {
    const gain = g.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(bus);
  }
  src.start();
}

/** One clip per discrete sound event. Events missing here (the key variants) have their own playback path below. */
const SFX_URLS: Partial<Record<SoundEvent, string>> = {
  command: 'audio/sfx/command.mp3',
  error: 'audio/sfx/error.mp3',
  enter: 'audio/sfx/enter.mp3',
  alert: 'audio/sfx/alert.mp3',
  alarm: 'audio/sfx/alarm.mp3',
  granted: 'audio/sfx/granted.mp3',
  denied: 'audio/sfx/denied.mp3',
  trace: 'audio/sfx/trace.mp3',
  glitch: 'audio/sfx/glitch.mp3',
  tick: 'audio/sfx/tick.mp3',
  rank: 'audio/sfx/rank.mp3',
  sting: 'audio/sfx/sting.mp3',
  win: 'audio/sfx/win.mp3',
  fail: 'audio/sfx/fail.mp3',
  chatter: 'audio/sfx/chatter.mp3',
  ping: 'audio/sfx/ping.mp3',
  boom: 'audio/sfx/boom.mp3',
  hint: 'audio/sfx/hint.mp3',
  hover: 'audio/sfx/hover.mp3',
  click: 'audio/sfx/click.mp3',
  transition: 'audio/sfx/transition.mp3',
  'crt-on': 'audio/sfx/crt-on.mp3',
  'crt-off': 'audio/sfx/crt-off.mp3',
  achievement: 'audio/sfx/achievement.mp3',
  transfer: 'audio/sfx/transfer.mp3',
};

const AMBIENT_URL = 'audio/ambient/server-hum.mp3';

function startAmbientLoop(g: Graph): void {
  void loadBuffer(g.ctx, AMBIENT_URL).then((buf) => {
    if (!buf || g.ambientSource) return;
    const src = g.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g.ambientGain);
    src.start();
    g.ambientSource = src;
  });
}

/** 0 outside a mission, 1 inside one. The hum stays on throughout; only its level changes. */
export function setAmbienceActive(active: boolean): void {
  ambienceActive = active;
  if (!graph) return;
  graph.ambientGain.gain.setTargetAtTime(active ? AMBIENT_MISSION : AMBIENT_MENU, graph.ctx.currentTime, 1.5);
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

/** Several real keystrokes per variant, sliced from two different mechanical keyboard recordings (see LICENSES.md). */
const KEY_URLS: Record<KeySoundVariant, string[]> = {
  key: [
    'audio/keys/key-1.mp3',
    'audio/keys/key-2.mp3',
    'audio/keys/key-3.mp3',
    'audio/keys/key-4.mp3',
    'audio/keys/key-5.mp3',
    'audio/keys/key-6.mp3',
    'audio/keys/key-7.mp3',
    'audio/keys/key-8.mp3',
  ],
  'key-space': ['audio/keys/space-1.mp3'],
  'key-enter': ['audio/keys/enter-1.mp3'],
  'key-backspace': ['audio/keys/backspace-1.mp3'],
};

/**
 * A real mechanical keystroke, picked at random from this variant's slices, with a little pitch (playback rate)
 * and volume jitter so repeated keys never sound identical.
 */
function mechanicalKey(g: Graph, variant: KeySoundVariant): void {
  const urls = KEY_URLS[variant];
  const url = urls[Math.floor(Math.random() * urls.length)];
  const rate = jitter(1, 0.08);
  const volume = jitter(1, 0.22);
  void loadBuffer(g.ctx, url).then((buf) => {
    if (buf) playBuffer(g, buf, g.keyBus, volume, rate);
  });
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
  const url = SFX_URLS[event];
  if (!url) return;
  void loadBuffer(g.ctx, url).then((buf) => {
    if (buf) playBuffer(g, buf, g.sfxBus);
  });
}
