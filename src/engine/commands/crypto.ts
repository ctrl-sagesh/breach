// Cryptography commands: john (crack and hashcat are aliases), base64 and decode.

import { fromBase64, fromHex, rot13, toBase64 } from '../encoding';
import { canRead, isFile } from '../fs';
import type { CommandSpec, Stdin } from './types';
import type { GameSession, Out } from '../session';

/** The fake wordlist. A hash only cracks if its plaintext is in here. */
export const WORDLIST: readonly string[] = [
  'password',
  '123456',
  'letmein',
  'admin',
  'welcome',
  'monkey',
  'dragon',
  'qwerty',
  'sunshine',
  'princess',
  'football',
  'iloveyou',
  'trustno1',
  'shadow',
  'master',
  'summer',
  'winter',
  'ghost',
  'canary',
  'hunter2',
];

/** The text a base64 command reads: a named file if given, otherwise the pipe. */
function sourceText(s: GameSession, file: string | undefined, stdin: Stdin, out: Out): string | null {
  if (file) {
    const abs = s.resolve(file);
    if (!isFile(s.machine, abs)) {
      out.print(`base64: ${file}: No such file or directory`, 'err');
      return null;
    }
    if (!canRead(s.machine, abs, s.frame.user)) {
      out.print(`base64: ${file}: Permission denied`, 'err');
      return null;
    }
    return s.machine.files[abs].content.trim();
  }
  if (stdin) return stdin.join('\n').trim();
  out.print('usage: base64 [-d] [file]   (or pipe input in)', 'err');
  return null;
}

export const cryptoCommands: CommandSpec[] = [
  {
    name: 'john',
    aliases: ['hashcat', 'crack'],
    usage: 'john <hash>',
    summary: 'wordlist attack on a hash (only common passwords fall). hashcat and crack also work',
    example: 'john 3f2a9c7e1b4d8f60a5c2e9d17b8a4f3e',
    run(s, args, out) {
      const hash = args.filter((a) => !a.startsWith('-')).pop();
      if (!hash) {
        out.print('usage: john <hash>', 'err');
        return;
      }
      out.print(`Loaded 1 password hash. Wordlist: ${WORDLIST.length} entries.`, 'dim');
      out.sound('chatter');
      const entry = s.mission.hashes.find((h) => h.hash === hash);
      if (entry && WORDLIST.includes(entry.plaintext)) {
        out.print(`${hash.slice(0, 16)}...  (${entry.algo})`, 'dim');
        out.print(`MATCH (${entry.algo}): ${entry.plaintext}`, 'ok');
        out.sound('granted');
      } else {
        out.print('No password hashes cracked (wordlist exhausted).', 'err');
        out.sound('denied');
      }
      s.noise(12, out);
    },
  },
  {
    name: 'base64',
    usage: 'base64 [-d] [file]',
    summary: 'encode text, or with -d decode it. reads a file or a pipe',
    example: 'echo aGVsbG8= | base64 -d',
    run(s, args, out, stdin) {
      const decode = args.includes('-d') || args.includes('--decode');
      const file = args.find((a) => !a.startsWith('-'));
      const text = sourceText(s, file, stdin, out);
      if (text === null) return;
      if (!decode) {
        out.print(toBase64(text));
        return;
      }
      try {
        const decoded = fromBase64(text);
        out.print(decoded, 'ok');
        s.discover('decoded', decoded);
      } catch {
        out.print('base64: invalid input', 'err');
      }
    },
  },
  {
    name: 'decode',
    usage: 'decode <base64|rot13|hex> <text>',
    summary: 'decode an encoded string (the short form of base64 -d)',
    example: 'decode base64 aGVsbG8=',
    run(s, args, out) {
      const [encoding, ...rest] = args;
      const text = rest.join(' ');
      if (!encoding || !text) {
        out.print('usage: decode <base64|rot13|hex> <text>', 'err');
        return;
      }
      let decoded: string;
      try {
        switch (encoding.toLowerCase()) {
          case 'base64':
            decoded = fromBase64(text);
            break;
          case 'rot13':
            decoded = rot13(text);
            break;
          case 'hex':
            decoded = fromHex(text);
            break;
          default:
            out.print(`decode: unknown encoding '${encoding}' (try base64, rot13, hex)`, 'err');
            return;
        }
      } catch {
        out.print(`decode: input is not valid ${encoding.toLowerCase()}`, 'err');
        return;
      }
      out.print(decoded, 'ok');
      s.discover('decoded', decoded);
    },
  },
];
