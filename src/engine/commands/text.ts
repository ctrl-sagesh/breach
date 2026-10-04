// Text filters that work on a file or a pipe: head, tail, wc and tr.

import { canRead, isFile } from '../fs';
import type { GameSession, Out } from '../session';
import type { CommandSpec, Stdin } from './types';

/** The lines a filter works on: the named file if there is one, otherwise the pipe. Null when neither exists. */
function inputLines(s: GameSession, file: string | undefined, stdin: Stdin, out: Out): string[] | null {
  if (file) {
    const abs = s.resolve(file);
    if (!isFile(s.machine, abs)) {
      out.print(`${file}: No such file or directory`, 'err');
      return null;
    }
    if (!canRead(s.machine, abs, s.frame.user)) {
      out.print(`${file}: Permission denied`, 'err');
      return null;
    }
    return s.machine.files[abs].content.split('\n');
  }
  if (stdin) return stdin;
  out.print('usage: needs a file or piped input', 'err');
  return null;
}

/** Reads -n N or -N from the arguments. Returns the count and the rest of the arguments. */
function countArg(args: string[], fallback: number): { n: number; rest: string[] } {
  const rest: string[] = [];
  let n = fallback;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n') n = Math.max(0, Number(args[++i]) || 0);
    else if (/^-\d+$/.test(args[i])) n = Math.max(0, Number(args[i].slice(1)));
    else rest.push(args[i]);
  }
  return { n, rest };
}

/** Expands a tr set such as A-Za-z into its characters. */
function expandSet(set: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < set.length; i++) {
    if (set[i + 1] === '-' && i + 2 < set.length) {
      const from = set.charCodeAt(i);
      const to = set.charCodeAt(i + 2);
      for (let c = from; c <= to; c++) out.push(String.fromCharCode(c));
      i += 2;
    } else {
      out.push(set[i]);
    }
  }
  return out;
}

export const textCommands: CommandSpec[] = [
  {
    name: 'head',
    usage: 'head [-n N] [file]',
    summary: 'print the first lines of a file or a pipe (default 10)',
    example: 'cat /var/log/auth.log | head -n 5',
    run(s, args, out, stdin) {
      const { n, rest } = countArg(args, 10);
      const lines = inputLines(s, rest[0], stdin, out);
      if (lines) for (const line of lines.slice(0, n)) out.print(line);
    },
  },
  {
    name: 'tail',
    usage: 'tail [-n N] [file]',
    summary: 'print the last lines of a file or a pipe (default 10)',
    example: 'cat /var/log/auth.log | tail -n 3',
    run(s, args, out, stdin) {
      const { n, rest } = countArg(args, 10);
      const lines = inputLines(s, rest[0], stdin, out);
      if (!lines) return;
      // A trailing newline in a file is not a line of its own.
      const trimmed = lines.length && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
      for (const line of trimmed.slice(Math.max(0, trimmed.length - n))) out.print(line);
    },
  },
  {
    name: 'wc',
    usage: 'wc [-l] [-w] [-c] [file]',
    summary: 'count lines, words and characters in a file or a pipe',
    example: 'cat /etc/passwd | wc -l',
    run(s, args, out, stdin) {
      const flags = args.filter((a) => a.startsWith('-')).join('');
      const file = args.find((a) => !a.startsWith('-'));
      const lines = inputLines(s, file, stdin, out);
      if (!lines) return;
      const text = lines.join('\n');
      const counts = {
        l: lines.length - (text.endsWith('\n') ? 1 : 0),
        w: text.split(/\s+/).filter(Boolean).length,
        c: text.length,
      };
      const picked = (['l', 'w', 'c'] as const).filter((k) => flags.includes(k));
      const shown = picked.length ? picked.map((k) => counts[k]) : [counts.l, counts.w, counts.c];
      out.print(`${shown.join(' ')}${file ? ` ${file}` : ''}`);
    },
  },
  {
    name: 'tr',
    usage: 'tr <from> <to>',
    summary: 'translate characters in a pipe. ranges like A-Z are allowed',
    example: "echo Uryyb | tr 'A-Za-z' 'N-ZA-Mn-za-m'",
    run(_s, args, out, stdin) {
      if (args.length < 2) {
        out.print("usage: tr <from> <to>   (e.g. tr 'A-Za-z' 'N-ZA-Mn-za-m')", 'err');
        return;
      }
      if (!stdin) {
        out.print('tr: needs piped input', 'err');
        return;
      }
      const from = expandSet(args[0]);
      const to = expandSet(args[1]);
      for (const line of stdin) {
        out.print(
          [...line]
            .map((ch) => {
              const idx = from.indexOf(ch);
              if (idx < 0) return ch;
              return to[Math.min(idx, to.length - 1)] ?? ch;
            })
            .join(''),
        );
      }
    },
  },
];
