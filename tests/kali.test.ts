// Real Kali-style commands: pipes, ls -l, cd -, find, the network tools, sudo, ssh with a user, and the aliases.

import { describe, expect, it } from 'vitest';
import { GameSession, splitPipeline } from '../src/engine/session';
import { rankForScore } from '../src/engine/scoring';
import { MISSIONS } from '../src/missions';

const FIRST = MISSIONS[0];
const PASSWORD_MISSION = MISSIONS[4];
const PORTAL_IP = '10.13.37.90';
const MIRROR_IP = '10.13.37.91';

function textsOf(s: GameSession, line: string): string[] {
  return s.input(line).lines.map((l) => l.text);
}

describe('pipelines', () => {
  it('splits on pipes outside quotes only', () => {
    expect(splitPipeline('cat a | grep "x|y" | wc -l')).toEqual(['cat a', 'grep "x|y"', 'wc -l']);
  });

  it('cat feeds grep', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(textsOf(s, 'cat /srv/portal/logs/access.log | grep rfoster')).toContain('GET /login 200 rfoster');
  });

  it('echo feeds base64 -d and tr', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'echo aGVsbG8= | base64 -d')).toContain('hello');
    expect(textsOf(s, "echo Uryyb | tr 'A-Za-z' 'N-ZA-Mn-za-m'")).toContain('Hello');
  });

  it('head, tail and wc count lines of a pipe', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(textsOf(s, 'cat /srv/portal/logs/access.log | wc -l')).toContain('3');
    expect(textsOf(s, 'cat /srv/portal/logs/access.log | head -n 1')).toContain('GET /statement 200 rfoster');
    expect(textsOf(s, 'cat /srv/portal/logs/access.log | tail -n 1')).toContain('GET /login 200 rfoster');
  });

  it('a failing first command stops the pipeline and shows its error', () => {
    const s = new GameSession(FIRST);
    const lines = textsOf(s, 'cat nope.txt | wc -l');
    expect(lines.some((l) => l.includes('No such file'))).toBe(true);
    expect(lines.some((l) => /^\d+$/.test(l))).toBe(false);
  });

  it('a pipe with an empty side is a syntax error', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'ls |')).toContain("bash: syntax error near unexpected token `|'");
  });
});

describe('ls, cd and find', () => {
  it('ls -l shows permissions, owners and sizes', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    const lines = textsOf(s, 'ls -la /home');
    expect(lines.some((l) => l.startsWith('drwxr-xr-x') && l.endsWith('guest/'))).toBe(true);
    expect(lines.some((l) => l.startsWith('drwx------') && l.endsWith('rfoster/'))).toBe(true);
  });

  it('colours directories blue and executables green in ls', () => {
    const s = new GameSession(PASSWORD_MISSION, { tier: 'medium' });
    s.input(`connect ${PORTAL_IP}`);
    const out = s.input('ls /srv/portal');
    const line = out.lines.find((l) => l.segments?.some((p) => p.kind === 'dir'));
    expect(line?.segments?.find((p) => p.kind === 'dir')?.text).toBe('logs/');
  });

  it('marks the executable backup script green in ls -l', () => {
    // The scripts folder belongs to deploy, so log in as deploy first (the first five steps of the walkthrough).
    const s = new GameSession(MISSIONS[5]);
    for (const step of MISSIONS[5].solution.slice(0, 5)) s.input(step);
    expect(s.frame.user).toBe('deploy');
    const out = s.input('ls -l /opt/deploy/scripts');
    expect(out.lines.some((l) => l.segments?.some((p) => p.kind === 'exec' && p.text === 'backup.sh'))).toBe(true);
  });

  it('cd - goes back to the last directory', () => {
    const s = new GameSession(FIRST);
    s.input('cd /home');
    s.input('cd /');
    expect(textsOf(s, 'cd -')).toContain('/home');
    expect(s.frame.cwd).toBe('/home');
  });

  it('cd .. and cd ~ work', () => {
    const s = new GameSession(FIRST);
    s.input('cd ..');
    expect(s.frame.cwd).toBe('/home');
    s.input('cd ~');
    expect(s.frame.cwd).toBe('/home/ghost');
  });

  it('find lists files, filters by name and type', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(textsOf(s, 'find /srv -name "*.log"')).toContain('/srv/portal/logs/access.log');
    expect(textsOf(s, 'find /srv -type d')).toContain('/srv/portal/logs');
    expect(textsOf(s, 'find /srv -type d').some((l) => l.endsWith('.log'))).toBe(false);
  });

  it('find does not show what the user cannot read', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`connect ${PORTAL_IP}`);
    expect(textsOf(s, 'find /home -name flag.txt').some((l) => l.includes('rfoster'))).toBe(false);
  });
});

describe('network tools', () => {
  it('nmap -sV prints service versions and pings once per open port', () => {
    const s = new GameSession(PASSWORD_MISSION);
    const out = s.input(`nmap -sV ${PORTAL_IP}`);
    expect(out.lines.some((l) => l.text.startsWith('PORT') && l.text.includes('VERSION'))).toBe(true);
    expect(out.sounds.filter((x) => x === 'ping').length).toBe(2);
  });

  it('plain nmap with an ip has no VERSION column', () => {
    const s = new GameSession(PASSWORD_MISSION);
    const lines = textsOf(s, `nmap ${PORTAL_IP}`);
    expect(lines.some((l) => l.startsWith('PORT') && !l.includes('VERSION'))).toBe(true);
  });

  it('scan is an alias of nmap, and connect of ssh', () => {
    const s = new GameSession(FIRST);
    expect(s.input('scan').lines.some((l) => l.text.includes('Nmap scan report'))).toBe(true);
    s.input('connect 10.13.37.20');
    expect(s.stack.length).toBe(2);
  });

  it('ssh user@ip connects, then asks for that user password', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`ssh rfoster@${PORTAL_IP}`);
    expect(s.stack.length).toBe(2);
    expect(s.inputMode()).toBe('password');
    s.input('Xk!29pQ-bunny');
    expect(s.frame.user).toBe('rfoster');
  });

  it('ssh without a user lands as the default user with no prompt', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`ssh ${PORTAL_IP}`);
    expect(s.inputMode()).toBe('shell');
    expect(s.frame.user).toBe('guest');
  });

  it('ifconfig and ip a show the machine address', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'ifconfig').some((l) => l.includes('inet 10.66.0.1'))).toBe(true);
    expect(textsOf(s, 'ip a').some((l) => l.includes('10.66.0.1/24'))).toBe(true);
  });

  it('ping reaches a neighbour, and says so for a host that is not one', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'ping -c 2 10.13.37.20').some((l) => l.includes('2 packets transmitted, 2 received'))).toBe(true);
    expect(textsOf(s, 'ping 10.99.99.99').some((l) => l.includes('Destination Host Unreachable'))).toBe(true);
  });
});

describe('sudo and man', () => {
  it('sudo is refused with the joke message for an account not in sudoers', () => {
    const s = new GameSession(FIRST);
    const lines = textsOf(s, 'sudo cat /etc/shadow');
    expect(lines.some((l) => l.includes('is not in the sudoers file. This incident will be reported.'))).toBe(true);
  });

  it('sudo runs the command as root for a sudoer', () => {
    const base = FIRST.machines.find((m) => m.id === 'rig')!;
    const rigWithSudo = { ...base, users: base.users.map((u) => ({ ...u, sudo: true })), files: { ...base.files, '/root/secret.txt': { content: 'root only' } } };
    const mission = { ...FIRST, machines: FIRST.machines.map((m) => (m.id === 'rig' ? rigWithSudo : m)) };
    const s = new GameSession(mission);
    expect(textsOf(s, 'sudo cat /root/secret.txt')).toContain('root only');
    expect(s.frame.user).toBe('ghost');
  });

  it('man prints a manual page with name, synopsis and example', () => {
    const s = new GameSession(FIRST);
    const lines = textsOf(s, 'man nmap');
    expect(lines).toContain('NAME');
    expect(lines).toContain('SYNOPSIS');
    expect(lines.some((l) => l.includes('alias of nmap') || l.includes('nmap - '))).toBe(true);
  });

  it('man on an alias says what it is an alias of', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'help scan').some((l) => l.includes('alias of nmap'))).toBe(true);
  });
});

describe('aliases and names', () => {
  it('john, hashcat and crack all run the same attack', () => {
    const hash = MISSIONS[1].kaliSolution.find((step) => step.startsWith('john '))!.slice('john '.length);
    for (const name of ['john', 'hashcat', 'crack']) {
      const s = new GameSession(MISSIONS[1]);
      expect(textsOf(s, `${name} ${hash}`).some((l) => l.startsWith('MATCH'))).toBe(true);
    }
  });

  it('su and login are the same command', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`ssh ${PORTAL_IP}`);
    s.input('su rfoster');
    expect(s.inputMode()).toBe('password');
  });

  it('tab completes real names and aliases', () => {
    const s = new GameSession(FIRST);
    expect(s.complete('nm').value).toBe('nmap ');
    expect(s.complete('ss').value).toBe('ssh ');
  });

  it('tab completes a neighbour after user@ in ssh', () => {
    const s = new GameSession(FIRST);
    expect(s.complete('ssh bob@10.13.37.').value).toBe('ssh bob@10.13.37.20 ');
  });

  it('tab completes the command after a pipe', () => {
    const s = new GameSession(FIRST);
    expect(s.complete('cat notes.txt | gr').value).toBe('cat notes.txt | grep ');
  });

  it('a typo of a real name still gets a suggestion', () => {
    const s = new GameSession(FIRST);
    expect(textsOf(s, 'nmpa').some((l) => l.includes('Did you mean') && l.includes('nmap'))).toBe(true);
  });
});

describe('ranks are per mission', () => {
  it('a clean run without hints is not Script Kiddie', () => {
    expect(rankForScore(950).name).not.toBe('Script Kiddie');
    expect(rankForScore(950).name).toBe('Ghost');
  });

  it('a weak run ranks low on its own', () => {
    expect(rankForScore(100).name).toBe('Script Kiddie');
  });
});

describe('prompt', () => {
  it('splits the prompt into parts for colouring, root shows #', () => {
    const s = new GameSession(FIRST);
    const parts = s.promptParts();
    expect(parts).toMatchObject({ user: 'ghost', host: 'ghost-rig', path: '~', symbol: '$', root: false });
    s.input('cd /');
    expect(s.promptParts().path).toBe('/');
  });

  it('the host in the prompt changes with the machine', () => {
    const s = new GameSession(PASSWORD_MISSION);
    s.input(`ssh ${MIRROR_IP}`);
    expect(s.promptParts().host).toBe('social-mirror');
  });
});
