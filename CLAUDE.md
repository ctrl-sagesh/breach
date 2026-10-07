# BREACH: working notes for Claude

A browser hacking terminal game. Next.js (App Router) + TypeScript + Tailwind, static export (`output: 'export'`).
No backend, no network calls, no external assets. Progress lives in localStorage.

## Commands

- `npm run dev`: dev server
- `npm test`: Vitest. Runs every mission's intended solution plus engine tests.
- `npm run build`: type-checks and writes the static site to `out/`

Run `npm test` and `npm run build` before calling a change done.

## Architecture

Strict layers. Dependencies only point downward.

```
src/app/            Next shell (layout, page, globals.css with palettes and CRT effects, robots.ts/sitemap.ts,
                    error.tsx + global-error.tsx as last-resort crash screens)
src/components/     React UI. Reads session state, never mutates game rules.
src/lib/            save (localStorage), audio (Web Audio), themes, progress (summary, unlocks, share card),
                    site (the one SITE_URL), analytics (Vercel event wrapper), origins (CORS allow-list matching,
                    shared with the Edge Functions), feedback (mailto builder), version
src/engine/         Pure game logic. No React, no DOM, no storage. Runs under Node in tests.
  types.ts          MachineDef, MissionDef, Line, SoundEvent, ... (the data contract)
  session.ts        GameSession: one attempt at one mission. Trace, prompts, pivoting, flag, endings, completion.
  commands/         One file per domain (files, network, crypto, system). index.ts is the registry.
  fs.ts             Flat-map virtual filesystem, path normalisation, permissions
  sql.ts            Tiny SQL evaluator for the staff login puzzle
  encoding.ts       base64, rot13, hex (used by decode and by mission data)
  scoring.ts        Mission score and ranks
src/missions/       Mission DATA ONLY. One file per mission, plus index.ts and shared.ts.
tests/              missions.test.ts (plays every mission), engine.test.ts
```

Key ideas:

- **Machines form a graph.** Each machine lists `neighbors` (IPs). `scan` and `connect` only reach neighbours.
  Pivoting means connecting from a compromised host to one of its neighbours. `exit` pops back up the stack.
- **Input goes through `GameSession.input(raw)`.** It returns an `Out` (lines + sounds + clear/quit flags).
  The UI prints those lines with a typing effect and plays the sounds. Tests call the same method.
- **Pending prompts** (`pending`) capture the next line: password, recovery questions (triggered by `?` at a
  password prompt), web form username/password, and the ending choice. `inputMode()` tells the UI how to render the prompt.
- **Trace** is a 0-100 meter. Noisy actions call `session.noise(n, out)`. A running security process
  (`security: true` in `processes`) multiplies gain by 1.5. Killing it lowers trace by 20. At 100 the attempt fails.
- **The flag check** is exact string match in `submitFlag`. Missions with `endings` open a choice after the flag.
- **Scoring** is computed from elapsed seconds, trace and hints used (`engine/scoring.ts`).

## Adding a mission

1. Create `src/missions/mNN-name.ts` that default-exports a `MissionDef`. Copy an existing one as a template.
   - `machines`: include the rig (`id: 'rig'`, use `makeRig` from `shared.ts`) plus every target.
   - `start`: the rig machine id and the starting directory.
   - `flag`, `hints` (exactly three, vague to specific), `briefing`, `debrief`.
   - `solution`: the exact inputs a player types, in order, to win. Include password answers and `submit`. Tests replay this.
   - Optional: `hashes` (for `crack`), `inbox` (for `mail`), `endings` (for a choice after the flag).
2. Append it to `MISSIONS` in `src/missions/index.ts`. Keep the array in campaign order.
3. Run `npm test`. The new mission is covered automatically: it must be beatable, must reject a wrong flag,
   and must have three hints, a rig, and valid neighbour IPs.

Build data with helpers from `engine/encoding.ts` (`toBase64`, `rot13`, `toHex`) so the strings in
the files and the solution cannot drift apart.

## Adding a command

Write a `CommandSpec` (name, usage, summary, example, run) in a file under `src/engine/commands/`, add it to the list in
`commands/index.ts`. `example` is a runnable line shown by `help <name>`, and `qol.test.ts` requires it to be non-empty.
Use `s.noise(n, out)` for anything that should raise trace. `help`, `help <name>`, "Did you mean" and tab completion pick it up.
Use `s.discover(category, text)` where a command reveals something the clue log should keep (see `engine/clues.ts`).

## Conventions

- Shell-like prompts show the user, host and directory. Root uses `#`.
- Password input is never echoed. Only `*` characters are shown.
- Output kinds (`Line.kind`) map to colours in `Terminal.tsx`. Keep new kinds in sync there.
- Save access is wrapped in try/catch everywhere. The game must run with storage blocked.
- Keep the engine free of React and DOM references so the tests stay fast and Node-only.
- Mobile: inputs are 16px to stop iOS zoom. Quick keys sit above the keyboard. Nothing may force horizontal page scroll
  except tables and code (the logo and quick-key bar scroll inside their own containers).

## Gotchas

- `tokenize` in `engine/sql.ts` is the SQL lexer. The shell uses `splitCommand` in `session.ts`. Do not mix them.
- The web form evaluates WHERE with AND binding tighter than OR. That is intentional: it is what makes the
  injection lesson real.
- `tests/missions.test.ts` checks that a mission is beatable, not that it is fun. Playtest changes to briefings and hints in the browser.
