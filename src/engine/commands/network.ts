// Network commands: nmap, ssh, su, exit, ping, ifconfig and ip. The old names scan, connect and login are aliases.

import type { CommandSpec } from './types';

function broadcast(ip: string): string {
  const parts = ip.split('.');
  return [...parts.slice(0, 3), '255'].join('.');
}

export const networkCommands: CommandSpec[] = [
  {
    name: 'nmap',
    aliases: ['scan'],
    usage: 'nmap [-sV] [-sn] [ip]',
    summary: 'no argument: discover neighbours. with an ip: port scan (-sV adds service versions)',
    example: 'nmap -sV 10.0.0.20',
    run(s, args, out) {
      const m = s.machine;
      const flags = args.filter((a) => a.startsWith('-'));
      const targets = args.filter((a) => !a.startsWith('-'));
      const versions = flags.includes('-sV');

      if (targets.length === 0 || flags.includes('-sn')) {
        out.print(`Starting Nmap (breach-sim) host discovery from ${m.hostname} (${m.ip})`, 'dim');
        if (m.neighbors.length === 0) out.print('No hosts responded.', 'warn');
        for (const ip of m.neighbors) {
          const host = s.findByIp(ip);
          if (host) out.print(`Nmap scan report for ${host.hostname} (${ip})`);
        }
        out.print(`Nmap done: ${m.neighbors.length} IP address(es) (${m.neighbors.length} host(s) up) scanned.`);
        s.noise(5, out);
        return;
      }

      const ip = targets[0];
      const host = m.neighbors.includes(ip) ? s.findByIp(ip) : undefined;
      if (!host) {
        out.print(`Note: host ${ip} seems down. No route from ${m.hostname}.`, 'err');
        return;
      }
      out.print(`Starting Nmap (breach-sim) against ${ip}`, 'dim');
      out.print(`Nmap scan report for ${host.hostname} (${ip})`);
      out.print(versions ? 'PORT      STATE  SERVICE    VERSION' : 'PORT      STATE  SERVICE');
      for (const p of host.ports) {
        const row = `${`${p.port}/tcp`.padEnd(9)} open   ${p.service.padEnd(10)}`;
        out.print(versions ? `${row} ${p.banner}` : row.trimEnd());
        out.sound('ping');
      }
      if (host.ports.length === 0) out.print('All scanned ports are closed.', 'dim');
      out.print(`Nmap done: 1 IP address (1 host up) scanned.`);
      s.noise(10, out);
    },
  },
  {
    name: 'ssh',
    aliases: ['connect'],
    usage: 'ssh [user@]<ip>',
    summary: 'open a session on a neighbouring host. ssh user@ip asks for that user\'s password',
    example: 'ssh rfoster@10.0.0.20',
    run(s, args, out) {
      const target = args[0];
      if (!target) {
        out.print('usage: ssh [user@]<ip>', 'err');
        return;
      }
      const at = target.lastIndexOf('@');
      const user = at >= 0 ? target.slice(0, at) : null;
      const ip = at >= 0 ? target.slice(at + 1) : target;
      const host = s.machine.neighbors.includes(ip) ? s.findByIp(ip) : undefined;
      if (!host) {
        out.print(`ssh: connect to host ${ip} port 22: No route to host`, 'err');
        return;
      }
      s.pushFrame(host.id);
      out.print(`Connected to ${host.hostname} (${ip}) as ${s.frame.user}.`, 'ok');
      out.sound('enter');
      s.noise(3, out);
      if (user && user !== s.frame.user) s.requestPassword(user);
    },
  },
  {
    name: 'su',
    aliases: ['login'],
    usage: 'su <user> [password]',
    summary: 'switch to a user. no argument on a web host opens its login form',
    example: 'su admin',
    run(s, args, out) {
      if (args.length === 0) {
        if (s.machine.webForm) {
          s.openForm(out);
          return;
        }
        out.print('usage: su <user>', 'err');
        return;
      }
      const user = args[0];
      if (args.length >= 2) {
        s.attemptLogin(user, args.slice(1).join(' '), out);
        return;
      }
      s.requestPassword(user);
      if (s.machine.recovery?.[user] && s.config.recoveryHints === 'direct') out.print('Forgot it? Type ? at the prompt to start account recovery.', 'dim');
    },
  },
  {
    name: 'exit',
    usage: 'exit',
    summary: 'close the current session (from your rig, abort the mission)',
    example: 'exit',
    run(s, _args, out) {
      if (s.stack.length > 1) {
        const closed = s.machine.hostname;
        s.popFrame();
        out.print(`Connection to ${closed} closed. Back on ${s.machine.hostname}.`, 'dim');
        return;
      }
      out.print(`Disconnecting from ${s.machine.hostname}. Aborting mission.`, 'sys');
      out.quit = true;
    },
  },
  {
    name: 'ping',
    usage: 'ping [-c count] <ip>',
    summary: 'send echo requests to a neighbouring host',
    example: 'ping -c 2 10.0.0.20',
    run(s, args, out) {
      let count = 4;
      let ip: string | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-c') count = Math.max(1, Math.min(10, Number(args[++i]) || 4));
        else if (!args[i].startsWith('-')) ip = args[i];
      }
      if (!ip) {
        out.print('usage: ping [-c count] <ip>', 'err');
        return;
      }
      out.print(`PING ${ip} (${ip}) 56(84) bytes of data.`);
      if (!s.machine.neighbors.includes(ip) || !s.findByIp(ip)) {
        out.print(`From ${s.machine.ip} icmp_seq=1 Destination Host Unreachable`, 'err');
        s.noise(2, out);
        return;
      }
      for (let seq = 1; seq <= count; seq++) {
        out.print(`64 bytes from ${ip}: icmp_seq=${seq} ttl=64 time=${(0.8 + seq * 0.3).toFixed(1)} ms`);
      }
      out.print(`--- ${ip} ping statistics ---`, 'dim');
      out.print(`${count} packets transmitted, ${count} received, 0% packet loss`, 'dim');
      s.noise(2, out);
    },
  },
  {
    name: 'ifconfig',
    usage: 'ifconfig',
    summary: 'show the network interface address',
    example: 'ifconfig',
    run(s, _args, out) {
      out.print('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
      out.print(`        inet ${s.machine.ip}  netmask 255.255.255.0  broadcast ${broadcast(s.machine.ip)}`);
    },
  },
  {
    name: 'ip',
    usage: 'ip a',
    summary: 'show addresses (ip a, ip addr)',
    example: 'ip a',
    run(s, args, out) {
      if (!['a', 'addr', 'address'].includes(args[0] ?? '')) {
        out.print('usage: ip a', 'err');
        return;
      }
      out.print(`2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP`);
      out.print(`    inet ${s.machine.ip}/24 brd ${broadcast(s.machine.ip)} scope global eth0`);
    },
  },
];
