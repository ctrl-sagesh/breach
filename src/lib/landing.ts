// The landing page terminal. Pure: it turns one typed line into the lines to print and an optional action.
// Visitors who type a real command get a short answer that nudges them to start playing.

import type { Line } from '../engine/types';

export type LandingAction = 'start' | 'clear';

export interface LandingReply {
  lines: Line[];
  action?: LandingAction;
}

const line = (text: string, kind: Line['kind'] = 'out'): Line => ({ text, kind });

const HELP: Line[] = [
  line('Commands you can try on this page:', 'sys'),
  line('  start      begin hacking. the real game is one step away'),
  line('  tiers      what easy, medium and hard change'),
  line('  whoami     who is at the keyboard'),
  line('  sudo       try your luck'),
  line('  about      what this is'),
  line('  clear      clear the screen'),
];

/** Answers one line typed on the landing page. Unknown commands get a shell-style error, with a hint toward start. */
export function landingReply(raw: string): LandingReply {
  const text = raw.trim();
  if (!text) return { lines: [] };
  const [name, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ');

  switch (name) {
    case 'start':
    case 'hack':
    case 'play':
    case 'breach':
      return { lines: [line('Initiating breach sequence...', 'ok')], action: 'start' };
    case 'help':
    case '?':
      return { lines: HELP };
    case 'whoami':
      return { lines: [line('guest. A curious visitor. The network is not expecting you.', 'ok')] };
    case 'sudo':
      return {
        lines: [
          line('[sudo] password for guest: ', 'dim'),
          line('guest is not in the sudoers file. This incident will be reported.', 'err'),
        ],
      };
    case 'rm':
      return { lines: [line(arg.includes('-rf') ? 'Nice try. Every command here is logged.' : 'rm: nothing here is yours to delete.', 'warn')] };
    case 'cat':
      return { lines: [line(`cat: ${arg || 'missing operand'}: permission denied. Nothing here is for you yet.`, 'err')] };
    case 'ls':
      return { lines: [line('jobs/   daily/   (no postings yet. type start.)', 'dir')] };
    case 'tiers':
      return {
        lines: [
          line('EASY    forgiving trace, a tip in every briefing'),
          line('MEDIUM  the standard balance'),
          line('HARD    one hint, a fast trace, a 20 minute clock'),
          line('Pick one on the job board after you start.', 'dim'),
        ],
      };
    case 'about':
      return {
        lines: [
          line('BREACH is a hacking terminal game. You take freelance jobs, breach fake networks,'),
          line('and learn the real tools and ideas security people use. Nothing here touches a real system.', 'dim'),
        ],
      };
    case 'clear':
      return { lines: [], action: 'clear' };
    case 'nmap':
    case 'ssh':
    case 'john':
    case 'su':
      return { lines: [line(`${name}: start a job first. Type start.`, 'warn')] };
    default:
      return { lines: [line(`bash: ${name}: command not found. Try help, or type start.`, 'err')] };
  }
}

/** The line typed above the landing terminal, once it has finished typing. */
export const TAGLINE = 'Take jobs from anonymous clients. Breach fake networks. Mind your trace.';
