// Mission 5: social engineering. The bank portal's recovery questions are answered from public posts and family records.

import type { MissionDef } from '../engine/types';
import { makeRig } from './shared';

const PORTAL_IP = '10.13.37.90';
const MIRROR_IP = '10.13.37.91';
const RFOSTER_PASSWORD = 'Xk!29pQ-bunny';

const mission: MissionDef = {
  id: 'm05-personal-files',
  number: 5,
  codename: 'PERSONAL FILES',
  title: 'Brightwater Credit Union: member account',
  client: 'QUILL',
  briefing: [
    'QUILL: "The target is a person, not a company. Rhea Foster. She banks at Brightwater. I do not need her password. I need her."',
    'The member portal has a recovery flow. It asks questions a stranger should not know the answers to. Strangers do anyway.',
    { text: 'Your trace counter ticks up while you read her life. It feels very quiet in here.', glitch: true },
  ],
  debrief: [
    'Rhea never used a password manager. She used her dog, her hometown and her mother, and she posted all three online.',
    'Security questions are a password with a public answer. Treat them like a password, or better, use random answers nobody could guess.',
    'Social engineering rarely needs malware. It needs patience and a search bar.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([PORTAL_IP, MIRROR_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Rhea Foster, Brightwater member account (${PORTAL_IP})
Goal: into her account, flag in her home directory.
Public records are on the social mirror (${MIRROR_IP}).`,
      },
    }),
    {
      id: 'portal',
      hostname: 'brightwater-portal',
      ip: PORTAL_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'rfoster', password: RFOSTER_PASSWORD, home: '/home/rfoster' },
      ],
      ports: [
        { port: 443, service: 'https', banner: 'nginx 1.18.0' },
        { port: 22, service: 'ssh', banner: 'OpenSSH 8.9p1' },
      ],
      files: {
        '/srv/portal/README': {
          content: 'Brightwater Credit Union member portal (staging).\nMembers: log in with your password.\nLocked out? Recovery questions were set at enrollment.',
        },
        '/srv/portal/logs/access.log': {
          content: 'GET /statement 200 rfoster\nGET /login 401 unknown\nGET /login 200 rfoster',
        },
        '/home/guest/readme.txt': { content: 'Guest access is read-only.' },
        '/home/rfoster/statement.txt': {
          owner: 'rfoster',
          private: true,
          content: 'Checking      4,812.07\nSavings      19,200.00',
        },
        '/home/rfoster/flag.txt': {
          owner: 'rfoster',
          private: true,
          content: 'BREACH{the_answers_were_public}',
        },
      },
      dirs: { '/home/rfoster': { owner: 'rfoster', private: true } },
      recovery: {
        rfoster: [
          { question: "First pet's name?", answer: 'biscuit' },
          { question: 'City you grew up in?', answer: 'lakeport' },
          { question: "Mother's maiden name?", answer: 'vance' },
        ],
      },
    },
    {
      id: 'mirror',
      hostname: 'social-mirror',
      ip: MIRROR_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [{ name: 'guest', password: '', home: '/home/guest' }],
      ports: [{ port: 80, service: 'http', banner: 'Apache 2.4.41 (mirror)' }],
      files: {
        '/srv/mirror/posts/2022-07-14.txt': {
          content: 'Pepper (the neighbour cat) has declared war on my recycling bin.',
        },
        '/srv/mirror/posts/2023-11-30.txt': {
          content: 'Throwback: grew up in Lakeport, and yes the lake is still cold. #hometown',
        },
        '/srv/mirror/posts/2024-03-02.txt': {
          content: 'Walked Biscuit before the rain. My beagle is the greatest good boy in Lakeport. Fight me.',
        },
        '/srv/archive/family-tree.txt': {
          content: 'Vance family tree (shared with cousins)\n\nMarisol Vance (later Foster), b. 1961, Lakeport\n  -> Gerald Foster, b. 1985\n  -> Rhea Foster, b. 1988',
        },
        '/home/guest/readme.txt': { content: 'Mirror of public posts. Read-only.' },
      },
    },
  ],
  hashes: [],
  inbox: [
    {
      from: 'QUILL',
      date: 'Fri 20:05',
      subject: 'The target',
      body: `Rhea Foster. Brightwater Credit Union member. The portal is at ${PORTAL_IP}.
She is careful with passwords. She is not careful with her life, which is public.`,
    },
    {
      from: 'QUILL',
      date: 'Fri 20:09',
      subject: 'Where the facts are',
      body: `Her public posts and the family archive are on ${MIRROR_IP}. Use only what is already out there. It is the same information she gave the bank.`,
    },
    {
      from: 'QUILL',
      date: 'Fri 20:14',
      subject: 'Locked out, on purpose',
      body: 'The portal has a forgot-password route, the usual one. It asks the usual questions. Strangers can answer those from public records, and so can anyone who knows her.',
    },
  ],
  flag: 'BREACH{the_answers_were_public}',
  hints: [
    'Passwords are hard to guess. People are easy to research. Read the mail, then the client packet.',
    `The social mirror (${MIRROR_IP}) has her posts and the family archive. Look for her pet, her hometown and her mother.`,
    `login rfoster, then type ? at the password prompt to start recovery. Answer: biscuit, lakeport, vance. Then cat /home/rfoster/flag.txt.`,
  ],
  // Easy plays the base inbox, which has the direct recovery mail. Medium swaps it for a subtler one. Hard has no nudge.
  tierOverrides: {
    medium: {
      hideInbox: ['Locked out, on purpose'],
      inbox: [
        {
          from: 'QUILL',
          date: 'Fri 20:14',
          subject: 'Re: the portal',
          body: 'Forget the password. Banks have a second door for members who lose theirs. It asks questions only the member should know, and the member is not always the only one who knows them.',
        },
      ],
    },
    hard: {
      hideInbox: ['Locked out, on purpose'],
      machines: {
        portal: {
          files: {
            '/srv/portal/logs/access.old': { content: 'GET /login 401 rfoster\nGET /login 401 rfoster\nGET /statement 200 rfoster' },
          },
        },
        mirror: {
          files: {
            '/srv/mirror/posts/2021-02-09.txt': { content: 'Pepper got her shots today. Wish me luck.' },
            '/srv/archive/recipes.txt': { content: "Grandma Vance's pie: flour, butter, apples from the lakeport orchard." },
          },
        },
      },
    },
  },
  kaliSolution: [
    'nmap',
    `ssh ${MIRROR_IP}`,
    'cat /srv/mirror/posts/2024-03-02.txt',
    'cat /srv/mirror/posts/2023-11-30.txt',
    'cat /srv/archive/family-tree.txt',
    'exit',
    `ssh rfoster@${PORTAL_IP}`,
    '?',
    'biscuit',
    'lakeport',
    'vance',
    'cat /home/rfoster/flag.txt',
    'submit BREACH{the_answers_were_public}',
  ],
  solution: [
    'scan',
    `connect ${MIRROR_IP}`,
    'cat /srv/mirror/posts/2024-03-02.txt',
    'cat /srv/mirror/posts/2023-11-30.txt',
    'cat /srv/archive/family-tree.txt',
    'exit',
    `connect ${PORTAL_IP}`,
    'login rfoster',
    '?',
    'biscuit',
    'lakeport',
    'vance',
    'cat /home/rfoster/flag.txt',
    'submit BREACH{the_answers_were_public}',
  ],
};

export default mission;
