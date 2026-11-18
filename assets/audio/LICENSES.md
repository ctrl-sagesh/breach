# Audio licenses

Every recording BREACH ships is CC0 (public domain) or covered by the Pixabay Content License. Raw sources live in
`sound-source/` on the machine that built them (never committed — see `.gitignore`); this file documents what was
used and where it came from. `scripts/build-audio.mjs` trims, normalises and fades each one into the files actually
shipped under `public/audio/`.

## Kenney Interface Sounds (CC0)

- **Pack**: Interface Sounds (1.0)
- **Author**: Kenney (www.kenney.nl)
- **License**: CC0 1.0 Universal — <http://creativecommons.org/publicdomain/zero/1.0/>
- **Source**: <https://kenney.nl/assets/interface-sounds>
- **Files used**: `select_003`, `error_002`, `error_006`, `error_008`, `open_002`, `confirmation_002`,
  `confirmation_004`, `tick_001`, `tick_004`, `glitch_002`, `bong_001`, `click_002`, `click_004`, `question_002`,
  `scroll_001`, `maximize_003`, `switch_002`, `switch_006`, `pluck_002` (`.ogg`, converted to `.mp3`)

Credit is not mandatory under CC0, but Kenney is credited on the About page anyway.

## Freesound recordings (CC0)

All of the following are Freesound's "CC0" license (Creative Commons Zero / public domain). The URL pattern
`https://freesound.org/people/<user>/sounds/<id>/` is Freesound's standard sound-page link, built from each file's
ID and uploader.

| Original file | Author | Freesound ID | URL |
| --- | --- | --- | --- |
| `mechanical-keyboard-typing-treble-version.wav` | stu556 | 450282 | <https://freesound.org/people/stu556/sounds/450282/> |
| `deep-boom.wav` | za-games | 539968 | <https://freesound.org/people/za-games/sounds/539968/> |
| `the-sound-of-dial-up-internet.mp3` | wtermini | 546450 | <https://freesound.org/people/wtermini/sounds/546450/> |
| `papatone-pictures-klaxon-rapid.wav` | alphatone | 555465 | <https://freesound.org/people/alphatone/sounds/555465/> |
| `blue-switch-mechanical-keyboard-typing.wav` | rhinenux | 631609 | <https://freesound.org/people/rhinenux/sounds/631609/> |
| `sfx-roomtone-server-room-hum.wav` | soundandmelodies | 776267 | <https://freesound.org/people/soundandmelodies/sounds/776267/> |
| `heartbeat-sub-kick-softer.wav` | music_is_wiggly_air | 784658 | <https://freesound.org/people/music_is_wiggly_air/sounds/784658/> |

What each one became in the build:

- The two keyboard recordings → every `key-*`, `space-1`, `enter-1` and `backspace-1` clip under `public/audio/keys/`.
- The klaxon → `sfx/alert.mp3` (one blast) and `sfx/alarm.mp3` (a build-up of blasts).
- The deep boom → `sfx/boom.mp3`.
- The dial-up recording → `sfx/chatter.mp3` (the cracker's chatter, an earlier slice) and `sfx/win.mp3` /
  `sfx/transfer.mp3` (the same later, settled slice, used for both — "short slice of the modem into a satisfying
  confirm sound").
- The server room hum → `ambient/server-hum.mp3`, looped quietly under everything.
- The heartbeat → `music/heartbeat.mp3`, triggered by the music engine's procedural tension layer above 75% trace.

## Pixabay Content License

| Original file | Title | Artist | Pixabay track ID |
| --- | --- | --- | --- |
| `leberch-cyberpunk-drone-375259.mp3` | Cyberpunk Drone | Leberche | 375259 |

License: [Pixabay Content License](https://pixabay.com/service/license-summary/) — free for commercial and
non-commercial use, no attribution required. Credited on the About page anyway. (The exact pixabay.com page URL for
this track was not re-verified when writing this file; search Pixabay for the track ID above if you need the direct
link again.)

Became `public/audio/music/cyberpunk-drone.mp3`, the game's default soundtrack.

## What stayed procedural

The generative soundtrack in `src/lib/music.ts` (the Night Shift / Signal / Cold Room tracks, and the tension layer
that builds with trace) is synthesised with the Web Audio API, not a recording — kept on purpose, since those tracks
exist specifically to never loop audibly over a long session, which a fixed recording can't do. The tension layer's
timing and density are still procedural even on the Cyberpunk Drone track; only the heartbeat *sound* itself was
swapped from a synthesised sine sweep to the real recording above.
