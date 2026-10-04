# BREACH

A browser hacking terminal game. You are a freelance hacker taking jobs from anonymous clients.
Each mission is a fake network of machines, users, files and logs. Type real-ish commands,
find the flag, and do not let your trace hit 100%.

Eight missions teach real concepts in simplified form: navigation and public shares, weak passwords and hashing,
base64 and rot13, log forensics, social engineering and security questions, pivoting through a gateway,
SQL injection, and a finale with a choice that changes the ending.

Everything runs in the browser. No backend, no external requests, no external assets.

## Requirements

- Node.js 18.18 or newer (developed on Node 24)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Test

```bash
npm test
```

This plays every mission's intended solution and confirms it ends in a win, checks that a wrong flag is rejected,
and runs the engine tests (SQL evaluator, encodings, paths, permissions, trace, scoring, save fallback).

## Build

```bash
npm run build
```

Writes a static site to `out/`. Check it locally with any static file server (for example
`npx serve out`). Opening `out/index.html` straight from disk may not load the scripts, because
Next.js expects to be served over HTTP.

## Deploy

The build is plain static files. Upload the `out/` folder to any static host.

- **Vercel:** import the repo, framework preset "Next.js", or drag `out/` into a static project. No server runtime is needed.
- **itch.io:** zip the contents of `out/` (with `index.html` at the zip root) and upload as an HTML game. Enable
  "This file will be played in the browser" and fullscreen.
- **CrazyGames:** submit the zipped `out/` build following their HTML5 guidelines. The game makes no network calls,
  so no SDK wiring is required for a first submission.

## Controls

- Type commands at the prompt. `help` lists them all.
- `Tab` completes commands, paths and neighbour IPs. `↑` and `↓` recall history.
- `Esc` (or tapping the screen) finishes the current line's typing effect instantly.
- On phones, use the quick-key bar above the keyboard.
- Typing `?` at a password prompt starts account recovery (some portals offer it).

## Saves

Progress, settings and unlocked colour themes are stored in your browser's localStorage. Reset from Settings.
If storage is blocked, the game still runs and progress lasts for the session only.

## Project layout

```
src/engine/     game logic (no React)
src/missions/   mission data, one file each
src/components/ UI
src/lib/        save, audio, themes, progress
tests/          mission playthroughs and engine tests
```

See `CLAUDE.md` for architecture notes and how to add a mission.
