// Filesystem commands: ls, cd, pwd, cat, grep, find.

import { canRead, filesUnder, isDir, isFile, listDir, type DirEntry } from '../fs';
import type { GameSession, Out } from '../session';
import type { LineKind } from '../types';
import type { CommandSpec } from './types';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** After a "no such file" error, offers the closest real path the user can read. */
function didYouMean(s: GameSession, target: string, out: Out): void {
  const fixed = s.suggestPath(target);
  if (fixed) out.print(`Did you mean: ${fixed}?`, 'dim');
}

/** Colour for a directory entry: directories blue, executables green, everything else plain. */
function entryKind(e: DirEntry): LineKind {
  if (e.type === 'dir') return 'dir';
  return e.executable ? 'exec' : 'out';
}

/** ls -l permission string, the way the real one shows it. */
function permissions(e: DirEntry): string {
  if (e.type === 'dir') return `d${e.private ? 'rwx------' : 'rwxr-xr-x'}`;
  if (e.private) return e.executable ? '-rwx------' : '-rw-------';
  return e.executable ? '-rwxr-xr-x' : '-rw-r--r--';
}

/** Shell wildcard to regular expression, for find -name. */
function globToRegExp(glob: string): RegExp {
  const source = glob.split('').map((c) => (c === '*' ? '.*' : c === '?' ? '.' : escapeRegExp(c))).join('');
  return new RegExp(`^${source}$`);
}

export const fileCommands: CommandSpec[] = [
  {
    name: 'ls',
    usage: 'ls [-la] [path...]',
    summary: 'list directory contents (-a shows hidden, -l long format with permissions and owners)',
    example: 'ls -la /home',
    run(s, args, out) {
      const flags = args.filter((a) => a.startsWith('-')).join('');
      const paths = args.filter((a) => !a.startsWith('-'));
      const showAll = flags.includes('a');
      const long = flags.includes('l');
      const targets = paths.length ? paths : ['.'];

      for (const target of targets) {
        const abs = s.resolve(target);
        if (isFile(s.machine, abs)) {
          if (!canRead(s.machine, abs, s.frame.user)) out.print(`ls: cannot access '${target}': Permission denied`, 'err');
          else out.print(target);
          continue;
        }
        if (!isDir(s.machine, abs)) {
          out.print(`ls: cannot access '${target}': No such file or directory`, 'err');
          didYouMean(s, target, out);
          continue;
        }
        if (!canRead(s.machine, abs, s.frame.user)) {
          out.print(`ls: cannot open directory '${target}': Permission denied`, 'err');
          continue;
        }

        if (targets.length > 1) out.print(`${target}:`, 'dim');
        const entries = listDir(s.machine, abs).filter((e) => showAll || !e.name.startsWith('.'));
        if (long) {
          for (const e of entries) {
            const owner = (e.owner ?? 'root').padEnd(8);
            const size = String(e.size).padStart(5);
            const label = e.type === 'dir' ? `${e.name}/` : e.name;
            out.printSegments([
              { text: `${permissions(e)} 1 ${owner} ${size} `, kind: 'out' },
              { text: label, kind: entryKind(e) },
            ]);
          }
        } else if (entries.length) {
          const parts: { text: string; kind: LineKind }[] = [];
          entries.forEach((e, i) => {
            if (i > 0) parts.push({ text: '  ', kind: 'out' });
            parts.push({ text: e.type === 'dir' ? `${e.name}/` : e.name, kind: entryKind(e) });
          });
          out.printSegments(parts);
        }
      }
    },
  },
  {
    name: 'cd',
    usage: 'cd [path | - | ..]',
    summary: 'change directory. no argument goes home, cd - goes back',
    example: 'cd /srv/logs',
    run(s, args, out) {
      const back = args[0] === '-';
      const target = back ? s.frame.prev ?? s.frame.cwd : args[0] ?? '~';
      const abs = s.resolve(target);
      if (isFile(s.machine, abs)) {
        out.print(`cd: not a directory: ${target}`, 'err');
        return;
      }
      if (!isDir(s.machine, abs)) {
        out.print(`cd: no such file or directory: ${target}`, 'err');
        didYouMean(s, target, out);
        return;
      }
      if (!canRead(s.machine, abs, s.frame.user)) {
        out.print(`cd: permission denied: ${target}`, 'err');
        return;
      }
      s.frame.prev = s.frame.cwd;
      s.frame.cwd = abs;
      if (back) out.print(abs);
    },
  },
  {
    name: 'pwd',
    usage: 'pwd',
    summary: 'print the current directory',
    example: 'pwd',
    run(s, _args, out) {
      out.print(s.frame.cwd);
    },
  },
  {
    name: 'cat',
    usage: 'cat <file...>',
    summary: 'print file contents. with no file, prints piped input',
    example: 'cat notes.txt',
    run(s, args, out, stdin) {
      if (args.length === 0) {
        if (stdin) {
          for (const line of stdin) out.print(line);
          return;
        }
        out.print('cat: missing operand. Give a file, or pipe something in.', 'err');
        return;
      }
      for (const target of args) {
        const abs = s.resolve(target);
        if (isDir(s.machine, abs) && !isFile(s.machine, abs)) {
          out.print(`cat: ${target}: Is a directory`, 'err');
        } else if (!isFile(s.machine, abs)) {
          out.print(`cat: ${target}: No such file or directory`, 'err');
          didYouMean(s, target, out);
        } else if (!canRead(s.machine, abs, s.frame.user)) {
          out.print(`cat: ${target}: Permission denied`, 'err');
        } else {
          for (const line of s.machine.files[abs].content.split('\n')) out.print(line);
        }
      }
    },
  },
  {
    name: 'grep',
    usage: 'grep [-rin] <pattern> [file|dir...]',
    summary: 'search files for a pattern (-r recursive, -i ignore case, -n line numbers). reads a pipe when no file is given',
    example: 'grep -rin "password" /srv',
    run(s, args, out, stdin) {
      const opts = new Set<string>();
      const rest: string[] = [];
      for (const a of args) {
        if (/^-[a-zA-Z]+$/.test(a)) for (const c of a.slice(1)) opts.add(c);
        else rest.push(a);
      }
      if (rest.length === 0) {
        out.print('Usage: grep [-rin] <pattern> [file|dir...]', 'err');
        return;
      }
      const [pattern, ...targets] = rest;
      const flags = opts.has('i') ? 'i' : '';
      let re: RegExp;
      try {
        re = new RegExp(pattern, flags);
      } catch {
        re = new RegExp(escapeRegExp(pattern), flags);
      }

      if (targets.length === 0 && stdin) {
        stdin.forEach((line, idx) => {
          if (!re.test(line)) return;
          out.print(`${opts.has('n') ? `${idx + 1}:` : ''}${line}`);
        });
        return;
      }

      const recursive = opts.has('r');
      if (targets.length === 0 && !recursive) {
        out.print('grep: no input file given', 'err');
        return;
      }

      const files: string[] = [];
      for (const target of targets.length ? targets : ['.']) {
        const abs = s.resolve(target);
        if (isFile(s.machine, abs)) {
          if (canRead(s.machine, abs, s.frame.user)) files.push(abs);
          else out.print(`grep: ${target}: Permission denied`, 'err');
        } else if (isDir(s.machine, abs)) {
          if (!recursive) {
            out.print(`grep: ${target}: Is a directory`, 'err');
            continue;
          }
          files.push(...filesUnder(s.machine, abs).filter((p) => canRead(s.machine, p, s.frame.user)));
        } else {
          out.print(`grep: ${target}: No such file or directory`, 'err');
          didYouMean(s, target, out);
        }
      }

      const showName = files.length > 1 || recursive || targets.length > 1;
      for (const file of files) {
        s.machine.files[file].content.split('\n').forEach((line, idx) => {
          if (!re.test(line)) return;
          const prefix = `${showName ? `${file}:` : ''}${opts.has('n') ? `${idx + 1}:` : ''}`;
          out.print(`${prefix}${line}`);
        });
      }
    },
  },
  {
    name: 'find',
    usage: 'find [path] [-name pattern] [-type f|d]',
    summary: 'list files and directories under a path, filtered by name or type',
    example: 'find /srv -name "*.txt" -type f',
    run(s, args, out) {
      let base = '.';
      let namePattern: RegExp | null = null;
      let type: 'f' | 'd' | null = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-name') namePattern = globToRegExp(args[++i] ?? '*');
        else if (args[i] === '-type') type = args[++i] === 'd' ? 'd' : 'f';
        else if (!args[i].startsWith('-')) base = args[i];
      }

      const root = s.resolve(base);
      if (!isDir(s.machine, root) && !isFile(s.machine, root)) {
        out.print(`find: '${base}': No such file or directory`, 'err');
        return;
      }
      if (!canRead(s.machine, root, s.frame.user)) {
        out.print(`find: '${base}': Permission denied`, 'err');
        return;
      }

      const dirname = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';
      const found = new Set<string>([root]);
      for (const file of filesUnder(s.machine, root)) {
        if (!canRead(s.machine, file, s.frame.user)) continue;
        found.add(file);
        // Every directory between the file and the root is found too, as long as the user can read it.
        for (let parent = dirname(file); parent !== root && parent.length > root.length - (root === '/' ? 1 : 0); parent = dirname(parent)) {
          if (canRead(s.machine, parent, s.frame.user)) found.add(parent);
        }
      }

      for (const path of [...found].sort()) {
        const isDirectory = isDir(s.machine, path) && !isFile(s.machine, path);
        if (type === 'f' && isDirectory) continue;
        if (type === 'd' && !isDirectory) continue;
        const name = path.slice(path.lastIndexOf('/') + 1);
        if (namePattern && !namePattern.test(name)) continue;
        // Show paths the way the player typed the start point.
        out.print(path === root ? base : base + path.slice(root.length));
      }
    },
  },
];
