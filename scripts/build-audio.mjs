// Builds public/audio/ from the raw recordings in sound-source/ (never committed; see .gitignore).
// Run manually with `npm run audio:build` after dropping new files into sound-source/. Requires ffmpeg on PATH.
//
// Each entry below is one clip: a source file, where to cut it, and how loud to make it. Effects are trimmed,
// peak-normalised and given short fades so nothing clicks. Music and the ambient bed are loudness-normalised
// (loudnorm) instead, since they are long enough for that to be meaningful.
//
// Sources, all CC0 or Pixabay Content License (see assets/audio/LICENSES.md for credits):
//   Kenney Interface Sounds (CC0)              -- most UI and feedback sounds
//   Freesound recordings (CC0, see LICENSES.md) -- keyboards, klaxon, boom, modem, hum, heartbeat
//   Pixabay "Cyberpunk Drone" by Leberche        -- the main soundtrack

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SRC = path.resolve('sound-source');
const OUT = path.resolve('public', 'audio');
const KENNEY = path.join(SRC, 'kenney_interface-sounds', 'Audio');

function src(file) {
  return path.join(SRC, file);
}

async function ffmpeg(args) {
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

/** A short effect: trim to [start, start+duration], fade in/out, peak-normalise, mono, mp3. */
async function clip(inputFile, outFile, { start = 0, duration, fadeIn = 0.003, fadeOut = 0.02, gainDb = 0, mono = true } = {}) {
  const out = path.join(OUT, outFile);
  await mkdir(path.dirname(out), { recursive: true });
  const fadeOutStart = duration !== undefined ? Math.max(0, duration - fadeOut) : undefined;
  const filters = [gainDb ? `volume=${gainDb}dB` : null, `afade=t=in:d=${fadeIn}`, fadeOutStart !== undefined ? `afade=t=out:st=${fadeOutStart}:d=${fadeOut}` : null].filter(Boolean).join(',');
  const args = ['-ss', String(start)];
  if (duration !== undefined) args.push('-t', String(duration));
  args.push('-i', inputFile, '-af', filters, '-ar', '44100');
  if (mono) args.push('-ac', '1');
  args.push('-b:a', '96k', out);
  await ffmpeg(args);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

/** Music or an ambient loop: loudness-normalised, short fades at both ends, stereo kept for music. */
async function longClip(inputFile, outFile, { start = 0, duration, targetLufs = -16, mono = false, fade = 1.0 } = {}) {
  const out = path.join(OUT, outFile);
  await mkdir(path.dirname(out), { recursive: true });
  const fadeOutStart = duration !== undefined ? Math.max(0, duration - fade) : undefined;
  const filters = [`loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`, `afade=t=in:d=${fade}`, fadeOutStart !== undefined ? `afade=t=out:st=${fadeOutStart}:d=${fade}` : null].filter(Boolean).join(',');
  const args = ['-ss', String(start)];
  if (duration !== undefined) args.push('-t', String(duration));
  args.push('-i', inputFile, '-af', filters, '-ar', '44100');
  if (mono) args.push('-ac', '1');
  args.push('-b:a', '128k', out);
  await ffmpeg(args);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

const KEYBOARD_TREBLE = src('450282__stu556__mechanical-keyboard-typing-treble-version.wav');
const KEYBOARD_BLUE = src('631609__rhinenux__blue-switch-mechanical-keyboard-typing.wav');
const KLAXON = src('555465__alphatone__papatone-pictures-klaxon-rapid.wav');
const BOOM = src('539968__za-games__deep-boom.wav');
const MODEM = src('546450__wtermini__the-sound-of-dial-up-internet.mp3');
const HUM = src('776267__soundandmelodies__sfx-roomtone-server-room-hum.wav');
const HEARTBEAT = src('784658__music_is_wiggly_air__heartbeat-sub-kick-softer.wav');
const CYBERPUNK_DRONE = src('leberch-cyberpunk-drone-375259.mp3');

function kenney(name) {
  return path.join(KENNEY, name);
}

async function main() {
  // Keystrokes: isolated single hits picked by hand from silence-gap timing in each recording (see the
  // comment in src/lib/audio.ts for how they are played back). Six or more, plus space, enter and backspace.
  const keys = [
    [KEYBOARD_TREBLE, 'key-1.mp3', 1.577, 0.18],
    [KEYBOARD_TREBLE, 'key-2.mp3', 2.92, 0.2],
    [KEYBOARD_TREBLE, 'key-3.mp3', 5.684, 0.18],
    [KEYBOARD_TREBLE, 'key-4.mp3', 14.015, 0.18],
    [KEYBOARD_TREBLE, 'key-5.mp3', 51.923, 0.18],
    [KEYBOARD_TREBLE, 'key-6.mp3', 57.8, 0.18],
    [KEYBOARD_BLUE, 'key-7.mp3', 2.411, 0.16],
    [KEYBOARD_BLUE, 'key-8.mp3', 3.253, 0.16],
  ];
  for (const [file, out, start, duration] of keys) await clip(file, `keys/${out}`, { start, duration, gainDb: 2 });

  await clip(KEYBOARD_TREBLE, 'keys/space-1.mp3', { start: 2.025, duration: 0.3, gainDb: 1 });
  await clip(KEYBOARD_TREBLE, 'keys/enter-1.mp3', { start: 82.739, duration: 0.35, gainDb: 3 });
  await clip(KEYBOARD_TREBLE, 'keys/backspace-1.mp3', { start: 5.595, duration: 0.09, gainDb: 0 });

  // UI and feedback effects, mostly Kenney with a few Freesound moments where the real recording does it better.
  await clip(kenney('select_003.ogg'), 'sfx/command.mp3', { gainDb: 2 });
  await clip(kenney('error_002.ogg'), 'sfx/error.mp3', { gainDb: 2 });
  await clip(kenney('open_002.ogg'), 'sfx/enter.mp3', { gainDb: 2 });
  await clip(kenney('confirmation_002.ogg'), 'sfx/granted.mp3', { gainDb: 2 });
  await clip(kenney('error_006.ogg'), 'sfx/denied.mp3', { gainDb: 3 });
  await clip(kenney('tick_001.ogg'), 'sfx/trace.mp3', { gainDb: 2 });
  await clip(kenney('glitch_002.ogg'), 'sfx/glitch.mp3', { gainDb: 2 });
  await clip(kenney('tick_004.ogg'), 'sfx/tick.mp3', { gainDb: 3 });
  await clip(kenney('bong_001.ogg'), 'sfx/rank.mp3', { gainDb: 2 });
  await clip(kenney('confirmation_004.ogg'), 'sfx/sting.mp3', { gainDb: 2 });
  await clip(kenney('error_008.ogg'), 'sfx/fail.mp3', { gainDb: 2 });
  await clip(kenney('click_002.ogg'), 'sfx/ping.mp3', { gainDb: 0 });
  await clip(kenney('question_002.ogg'), 'sfx/hint.mp3', { gainDb: 2 });
  await clip(kenney('scroll_001.ogg'), 'sfx/hover.mp3', { gainDb: -6 });
  await clip(kenney('click_004.ogg'), 'sfx/click.mp3', { gainDb: 1 });
  await clip(kenney('maximize_003.ogg'), 'sfx/transition.mp3', { gainDb: 1 });
  await clip(kenney('switch_002.ogg'), 'sfx/crt-on.mp3', { gainDb: 1 });
  await clip(kenney('switch_006.ogg'), 'sfx/crt-off.mp3', { gainDb: 1 });
  await clip(kenney('pluck_002.ogg'), 'sfx/achievement.mp3', { gainDb: 3 });

  // Real recordings where they beat a UI pack: the klaxon for trace warnings, the boom for a traced-out ending,
  // and two different slices of the same dial-up recording for the cracker's chatter and the transfer confirm.
  await clip(KLAXON, 'sfx/alert.mp3', { start: 0.09, duration: 0.45, gainDb: -2 });
  await clip(KLAXON, 'sfx/alarm.mp3', { start: 1.38, duration: 2.2, gainDb: -2 });
  await clip(BOOM, 'sfx/boom.mp3', { duration: 1.6, gainDb: 0, fadeOut: 0.3 });
  await clip(MODEM, 'sfx/chatter.mp3', { start: 2.2, duration: 1.1, gainDb: -1 });
  await clip(MODEM, 'sfx/win.mp3', { start: 27.3, duration: 1.2, gainDb: 2, fadeOut: 0.25 });
  await clip(MODEM, 'sfx/transfer.mp3', { start: 27.3, duration: 1.2, gainDb: 2, fadeOut: 0.25 });

  // Music and the ambient bed. The heartbeat keeps the drum-hit length (loudnorm would mangle something this short).
  await longClip(CYBERPUNK_DRONE, 'music/cyberpunk-drone.mp3', { fade: 1.5 });
  await longClip(HUM, 'ambient/server-hum.mp3', { mono: true, fade: 1.2 });
  await clip(HEARTBEAT, 'music/heartbeat.mp3', { duration: 0.25, fadeIn: 0.001, fadeOut: 0.04, gainDb: 1, mono: true });

  console.log('audio build done.');
}

main().catch((err) => {
  console.error(err.stderr ?? err.message ?? err);
  process.exitCode = 1;
});
