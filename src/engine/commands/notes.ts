// Notes: the clue log (filled automatically on Easy and Medium) and the player's own notes.

import { CLUE_LABELS } from '../clues';
import type { CommandSpec } from './types';

const NOTE_LIMIT = 200;

export const notesCommands: CommandSpec[] = [
  {
    name: 'notes',
    usage: 'notes [add <text>]',
    summary: 'show the clue log and your notes. notes add <text> writes one',
    example: 'notes add mirror has her pet and her hometown',
    run(s, args, out) {
      if (args[0] === 'add') {
        const text = args.slice(1).join(' ').trim();
        if (!text) {
          out.print('usage: notes add <text>', 'err');
          return;
        }
        if (text.length > NOTE_LIMIT) {
          out.print(`notes: keep a note under ${NOTE_LIMIT} characters.`, 'err');
          return;
        }
        s.clues.addNote(text);
        out.print('Note saved.', 'ok');
        return;
      }
      if (args.length > 0) {
        out.print('usage: notes [add <text>]', 'err');
        return;
      }

      if (s.config.autoClues) {
        out.print('CLUE LOG (automatic)', 'title');
        if (s.clues.clues.length === 0) out.print('  Nothing yet. Scan, read files and decode what you find.', 'dim');
        for (const clue of s.clues.clues) out.print(`  ${CLUE_LABELS[clue.category].padEnd(8)} ${clue.text}`);
      } else {
        out.print('No automatic clue log on this tier. Keep your own with notes add <text>.', 'dim');
      }

      out.print('');
      out.print('NOTES', 'title');
      if (s.clues.notes.length === 0) out.print('  None yet.', 'dim');
      s.clues.notes.forEach((note, i) => out.print(`  ${i + 1}. ${note}`));
    },
  },
];
