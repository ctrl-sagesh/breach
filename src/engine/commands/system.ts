// System commands: whoami, hostname, ps, kill, mail, submit, hint, history, echo, clear.

import type { CommandSpec } from './types';

export const systemCommands: CommandSpec[] = [
  {
    name: 'whoami',
    usage: 'whoami',
    summary: 'print the account you are logged in as',
    example: 'whoami',
    run(s, _args, out) {
      out.print(s.frame.user);
    },
  },
  {
    name: 'hostname',
    usage: 'hostname',
    summary: 'print the name of the current host',
    example: 'hostname',
    run(s, _args, out) {
      out.print(s.machine.hostname);
    },
  },
  {
    name: 'ps',
    usage: 'ps',
    summary: 'list running processes on this host',
    example: 'ps',
    run(s, _args, out) {
      out.print('  PID USER     COMMAND', 'dim');
      for (const p of s.processes) {
        out.print(`${String(p.pid).padStart(5)} ${p.user.padEnd(8)} ${p.name}`);
      }
    },
  },
  {
    name: 'kill',
    usage: 'kill <pid>',
    summary: 'terminate a process you own (root can kill anything)',
    example: 'kill 412',
    run(s, args, out) {
      if (!args[0]) {
        out.print('usage: kill <pid>', 'err');
        return;
      }
      const pid = Number(args[0]);
      const index = s.processes.findIndex((p) => p.pid === pid);
      if (!Number.isInteger(pid) || index < 0) {
        out.print(`kill: (${args[0]}) - No such process`, 'err');
        return;
      }
      const proc = s.processes[index];
      if (proc.user !== s.frame.user && s.frame.user !== 'root') {
        out.print(`kill: (${pid}) - Operation not permitted`, 'err');
        return;
      }
      s.processes.splice(index, 1);
      out.print(`Terminated ${proc.name} (pid ${pid})`, 'ok');
      if (proc.security) {
        s.lowerTrace(20);
        out.print('[sentry] monitoring gap detected. Trace multiplier lifted on this host.', 'warn');
      }
    },
  },
  {
    name: 'mail',
    usage: 'mail [n]',
    summary: 'read the inbox (mail <n> opens one message)',
    example: 'mail 2',
    run(s, args, out) {
      const inbox = s.mission.inbox;
      if (args.length === 0) {
        if (inbox.length === 0) out.print('No mail.', 'dim');
        inbox.forEach((m, i) => out.print(`[${i + 1}] ${m.date}  ${m.from.padEnd(8)} ${m.subject}`));
        return;
      }
      const n = Number(args[0]);
      const message = Number.isInteger(n) ? inbox[n - 1] : undefined;
      if (!message) {
        out.print(`mail: no message ${args[0]}`, 'err');
        return;
      }
      out.print(`From: ${message.from}`, 'dim');
      out.print(`Date: ${message.date}`, 'dim');
      out.print(`Subj: ${message.subject}`, 'dim');
      out.print('');
      for (const line of message.body.split('\n')) out.print(line);
    },
  },
  {
    name: 'submit',
    usage: 'submit <flag>',
    summary: 'submit the flag you found to complete the job',
    example: 'submit BREACH{example_flag}',
    run(s, args, out) {
      if (args.length === 0) {
        out.print('usage: submit <flag>', 'err');
        return;
      }
      s.submitFlag(args.join(' '), out);
    },
  },
  {
    name: 'hint',
    usage: 'hint',
    summary: 'reveal the next hint (each one costs score)',
    example: 'hint',
    run(s, _args, out) {
      if (s.hintsUsed >= s.hintLimit) {
        out.print('No hints left. Trust your notes.', 'warn');
        return;
      }
      s.hintsUsed++;
      out.print(`[HINT ${s.hintsUsed}/${s.hintLimit}] ${s.mission.hints[s.hintsUsed - 1]}`, 'warn');
      out.sound('hint');
    },
  },
  {
    name: 'history',
    usage: 'history',
    summary: 'list the commands you have typed',
    example: 'history',
    run(s, _args, out) {
      s.history.forEach((cmd, i) => out.print(`${String(i + 1).padStart(4)}  ${cmd}`));
    },
  },
  {
    name: 'echo',
    usage: 'echo <text>',
    summary: 'print text',
    example: 'echo hello world',
    run(_s, args, out) {
      out.print(args.join(' '));
    },
  },
  {
    name: 'clear',
    usage: 'clear',
    summary: 'clear the screen',
    example: 'clear',
    run(_s, _args, out) {
      out.clear = true;
    },
  },
  {
    name: 'sudo',
    usage: 'sudo <command>',
    summary: 'run a command as root, if your account is in the sudoers file',
    example: 'sudo cat /etc/shadow',
    run(s, args, out) {
      s.sudoTries++;
      if (args.length === 0) {
        out.print('usage: sudo <command>', 'err');
        return;
      }
      if (!s.canSudo()) {
        out.print(`[sudo] password for ${s.frame.user}: `, 'dim');
        out.print(`${s.frame.user} is not in the sudoers file. This incident will be reported.`, 'err');
        out.sound('denied');
        s.noise(3, out);
        return;
      }
      s.runAsRoot(args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '), out);
    },
  },
];
