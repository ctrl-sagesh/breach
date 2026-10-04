// Virtual filesystem helpers. A machine's files are a flat map of absolute paths; directories are implied
// by file paths and can also be declared explicitly (to set owner or privacy).

import type { MachineDef } from './types';

export interface DirEntry {
  name: string;
  type: 'file' | 'dir';
  owner?: string;
  size: number;
  private?: boolean;
  executable?: boolean;
}

/** Resolves `input` against `cwd`, expanding ~ to `home`, "." and "..". Always returns an absolute path. */
export function normalizePath(input: string, cwd: string, home: string): string {
  let target = input;
  if (target === '~' || target.startsWith('~/')) target = home + target.slice(1);
  const full = target.startsWith('/') ? target : `${cwd}/${target}`;
  const parts: string[] = [];
  for (const seg of full.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join('/')}`;
}

export function isFile(m: MachineDef, abs: string): boolean {
  return Object.prototype.hasOwnProperty.call(m.files, abs);
}

export function isDir(m: MachineDef, abs: string): boolean {
  if (abs === '/' || m.dirs?.[abs]) return true;
  const prefix = `${abs}/`;
  return Object.keys(m.files).some((p) => p.startsWith(prefix));
}

/** A path is readable unless it, or an ancestor, is private to someone other than `user`. Root reads everything. */
export function canRead(m: MachineDef, abs: string, user: string): boolean {
  if (user === 'root') return true;
  let cur = '';
  for (const seg of abs.split('/').filter(Boolean)) {
    cur += `/${seg}`;
    const node = isFile(m, cur) ? m.files[cur] : m.dirs?.[cur];
    if (node?.private && node.owner !== user) return false;
  }
  return true;
}

export function listDir(m: MachineDef, abs: string): DirEntry[] {
  const prefix = abs === '/' ? '/' : `${abs}/`;
  const entries = new Map<string, DirEntry>();

  for (const [path, file] of Object.entries(m.files)) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      entries.set(rest, { name: rest, type: 'file', owner: file.owner, size: file.content.length, private: file.private, executable: file.executable });
    } else {
      const name = rest.slice(0, slash);
      if (!entries.has(name)) {
        const dir = m.dirs?.[`${prefix}${name}`];
        entries.set(name, { name, type: 'dir', owner: dir?.owner, size: 0, private: dir?.private });
      }
    }
  }

  for (const [path, dir] of Object.entries(m.dirs ?? {})) {
    if (path === abs || !path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).split('/')[0];
    if (!entries.has(name)) entries.set(name, { name, type: 'dir', owner: dir.owner, size: 0, private: dir.private });
  }

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** All file paths at or below `abs`, sorted. */
export function filesUnder(m: MachineDef, abs: string): string[] {
  const prefix = abs === '/' ? '/' : `${abs}/`;
  return Object.keys(m.files)
    .filter((p) => p.startsWith(prefix))
    .sort();
}
