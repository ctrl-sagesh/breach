// Mission 1: tutorial. Navigation, scanning, reading a public share, and a password left where it should not be.

import type { MissionDef } from '../engine/types';
import { makeRig } from './shared';

const FENWICK_IP = '10.13.37.20';

const mission: MissionDef = {
  id: 'm01-dead-drop',
  number: 1,
  codename: 'DEAD DROP',
  title: 'Fenwick Accounts: first contact',
  client: 'QUILL',
  briefing: [
    'The exchange board has one new posting. No company name. No pay scale. Just a handle and a deadline.',
    'QUILL: "Fenwick Accounts runs its shared drive on a box nobody updates. I need to see inside. Get me the admin login and the flag that proves you were there."',
    { text: 'You accept. Your trace counter is already watching.', glitch: true },
  ],
  debrief: [
    'The flag hits the drop within the second. QUILL pays before you disconnect.',
    'Fenwick never noticed. That is the job: the best breaches leave the furniture where it was.',
    'The next posting has a company name this time.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([FENWICK_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Fenwick Accounts (${FENWICK_IP})
Goal: get into the NAS, find the flag, submit it.
Tools on this rig: scan, connect, ls, cd, cat, login, submit.
Type "help" to see everything.`,
      },
    }),
    {
      id: 'fenwick',
      hostname: 'fenwick-nas',
      ip: FENWICK_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'admin', password: 'bluebird77', home: '/home/admin' },
      ],
      ports: [
        { port: 21, service: 'ftp', banner: 'vsftpd 3.0.2' },
        { port: 22, service: 'ssh', banner: 'OpenSSH 6.6 (old)' },
        { port: 445, service: 'smb', banner: 'Samba 4.1.17' },
      ],
      files: {
        '/srv/share/Public/readme.txt': {
          content: 'Fenwick Accounts shared drive.\nThe Public folder is for invoices only.\nNo passwords in here, please.',
        },
        '/srv/share/Public/invoices-2019.csv': {
          content: 'invoice,client,amount\n1001,Harbor Co,4200\n1002,Lantern LLC,880\n1003,Corvid Logistics,15300',
        },
        '/srv/share/Public/sticky.txt': {
          content: 'NAS admin login (for the audit, DO NOT SHARE):\n  user: admin\n  pass: bluebird77\n\n-- delete this after the audit, Greg',
        },
        '/home/guest/welcome.txt': { content: 'Welcome to the Fenwick NAS.' },
        '/home/admin/payroll.csv': {
          owner: 'admin',
          private: true,
          content: 'name,salary\nG. Fenwick,184000',
        },
        '/home/admin/flag.txt': {
          owner: 'admin',
          private: true,
          content: 'BREACH{sticky_notes_are_forever}',
        },
      },
      dirs: { '/home/admin': { owner: 'admin', private: true } },
    },
  ],
  hashes: [],
  inbox: [
    {
      from: 'QUILL',
      date: 'Mon 09:02',
      subject: 'Welcome aboard',
      body: `Fenwick Accounts is a small firm with a big NAS. It lives at ${FENWICK_IP}.
Get the admin login, get the flag. I will know it when I see it.`,
    },
  ],
  flag: 'BREACH{sticky_notes_are_forever}',
  hints: [
    'Shared drives are full of notes people forget to delete. Start by looking around the public share.',
    'Find the folder that anyone can read, list it, and open the note that sounds like a reminder.',
    `connect ${FENWICK_IP}, cd /srv/share/Public, cat sticky.txt, then login admin with the password you find. The flag is in admin's home.`,
  ],
  tierOverrides: {
    hard: {
      machines: {
        fenwick: {
          files: {
            '/srv/share/Public/old-sticky.txt': { content: 'rotated 2019 login (superseded):\n  user: admin\n  pass: summer2019' },
            '/srv/share/Public/payroll-q3.csv': { content: 'quarter,total\nQ3,412000' },
            '/home/guest/.notes': { content: 'todo: stop leaving passwords in Public' },
          },
          users: [{ name: 'intern', password: 'Spring!2019', home: '/home/intern' }],
        },
      },
      inbox: [
        { from: 'GREG', date: 'Mon 11:40', subject: 'Audit closed', body: 'Audit closed. Yes, the sticky notes are still up. Fixing it next sprint.' },
      ],
    },
  },
  kaliSolution: [
    'nmap',
    `ssh ${FENWICK_IP}`,
    'ls',
    'cd /srv/share/Public',
    'cat sticky.txt',
    'su admin',
    'bluebird77',
    'cat /home/admin/flag.txt',
    'submit BREACH{sticky_notes_are_forever}',
  ],
  solution: [
    'scan',
    `connect ${FENWICK_IP}`,
    'ls',
    'cd /srv/share/Public',
    'cat sticky.txt',
    'login admin',
    'bluebird77',
    'cat /home/admin/flag.txt',
    'submit BREACH{sticky_notes_are_forever}',
  ],
};

export default mission;
