import type { GameSession, Out } from '../session';

/** Lines piped in from the previous command in a pipeline, or null when the command starts the pipeline. */
export type Stdin = string[] | null;

export interface CommandSpec {
  name: string;
  /** Other names the command answers to. The old game names live here after the Kali renames. */
  aliases?: string[];
  usage: string;
  summary: string;
  /** A runnable example shown by `help <name>` and `man <name>`. */
  example: string;
  run: (session: GameSession, args: string[], out: Out, stdin: Stdin) => void;
}
