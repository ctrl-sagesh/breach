// Command registry. Add a command by writing a CommandSpec and listing it here. Aliases are registered from the spec.

import { closest } from '../suggest';
import { cryptoCommands } from './crypto';
import { fileCommands } from './files';
import { networkCommands } from './network';
import { notesCommands } from './notes';
import { systemCommands } from './system';
import { textCommands } from './text';
import type { CommandSpec } from './types';
import type { Out } from "../session";

const helpCommand: CommandSpec = {
  name: 'help',
  usage: 'help [command]',
  summary: 'list commands, or show one command with an example',
  example: 'help grep',
  run(s, args, out) {
    if (args.length > 0) {
      showCommand(args[0], out, 'help');
      return;
    }
    out.print('BREACH shell. Tab completes (twice lists), up/down recalls history, Ctrl+L clears.', 'sys');
    out.print('');
    for (const c of ALL) out.print(`  ${c.usage.padEnd(30)} ${c.summary}`);
    out.print('');
    out.print('Password prompts do not echo.', 'dim');
    if (s.config.recoveryHints !== 'none') {
      out.print('At a Password prompt, type ? to start account recovery (security questions), if the host offers it.', 'dim');
      out.print('Recovery answers are checked exactly as you type them, ignoring case.', 'dim');
    }
  },
};

const manCommand: CommandSpec = {
  name: 'man',
  usage: 'man <command>',
  summary: 'show the manual page for a command',
  example: 'man nmap',
  run(_s, args, out) {
    if (args.length === 0) {
      out.print('What manual page do you want? usage: man <command>', 'err');
      return;
    }
    showCommand(args[0], out, 'man');
  },
};

/**
 * help <command> prints usage, summary and a runnable example. man <command> prints the same as a manual page.
 * Unknown names get a "Did you mean" line.
 */
function showCommand(name: string, out: Out, style: 'help' | 'man'): void {
  const spec = COMMANDS.get(name);
  if (!spec) {
    out.print(style === 'man' ? `No manual entry for ${name}` : `help: no command '${name}'`, 'err');
    const near = closest(name, COMMAND_LIST);
    if (near.length) out.print(`Did you mean: ${near.join(', ')}?`, 'dim');
    return;
  }
  const alias = spec.name !== name ? ` (alias of ${spec.name})` : '';
  if (style === 'man') {
    out.print('NAME', 'title');
    out.print(`  ${spec.name} - ${spec.summary}${alias}`);
    out.print('SYNOPSIS', 'title');
    out.print(`  ${spec.usage}`);
    out.print('EXAMPLE', 'title');
    out.print(`  ${spec.example}`);
    return;
  }
  out.print(`${spec.usage}${alias}`, 'title');
  out.print(`  ${spec.summary}`);
  out.print(`  e.g. ${spec.example}`, 'dim');
}

const ALL: CommandSpec[] = [
  helpCommand,
  manCommand,
  ...fileCommands,
  ...textCommands,
  ...networkCommands,
  ...cryptoCommands,
  ...systemCommands,
  ...notesCommands,
];

/** Every name a command answers to: its own name and its aliases. */
export const COMMANDS = new Map<string, CommandSpec>(ALL.flatMap((c) => [c.name, ...(c.aliases ?? [])].map((n) => [n, c] as const)));
export const COMMAND_LIST: string[] = [...COMMANDS.keys()];
