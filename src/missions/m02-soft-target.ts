// Mission 2: weak passwords. Find a hash in a config file, crack the weak one, and log in.

import type { MissionDef } from '../engine/types';
import { makeRig } from './shared';

const CORVID_IP = '10.13.37.44';
const DANA_HASH = 'd8578edf8458ce06fbc5bb76a58c5ca4';
const OPS_HASH = '7c6a180b36896a0a8c02787eeafb0e4c';
const ROOT_HASH = '$6$mailsalt$Ab3KqP8xTz9LmN2vR7wY5uI0oE1sD4fG6hJ8kL0pQ2zXc';
const DANA_PASSWORD = 'monkey';

const mission: MissionDef = {
  id: 'm02-soft-target',
  number: 2,
  codename: 'SOFT TARGET',
  title: 'Corvid Logistics: mail server',
  client: 'QUILL',
  briefing: [
    'Corvid Logistics runs a mail server with a user database nobody has rotated since the last election.',
    'QUILL: "I need Dana Reyes\'s inbox. Do not touch the other accounts. They are not paying us."',
    { text: 'Somewhere behind the login prompt, a password is waiting to be guessed.', glitch: true },
  ],
  debrief: [
    'Dana\'s inbox is full of invoices and one unanswered email asking about a server migration.',
    'Weak passwords are not a technology problem. They are a people problem wearing a technology costume.',
    'Note the ops account. Its hash was long, random and out of reach. That is the kind you want.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([CORVID_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Corvid Logistics mail (${CORVID_IP})
Goal: Dana Reyes's account. Flag is in her home directory.
Tip from the last job: read the config files before you guess.`,
      },
    }),
    {
      id: 'corvid',
      hostname: 'corvid-mail',
      ip: CORVID_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'dana', password: DANA_PASSWORD, home: '/home/dana' },
        { name: 'ops', password: 'Vx!9qLm#Tz4w', home: '/home/ops' },
        { name: 'root', password: 'Qz8!vL2#mR9xKt', home: '/root' },
      ],
      ports: [
        { port: 25, service: 'smtp', banner: 'Postfix 3.4.13' },
        { port: 80, service: 'http', banner: 'nginx 1.14.0' },
        { port: 143, service: 'imap', banner: 'Dovecot 2.3.4' },
      ],
      processes: [
        { pid: 88, user: 'root', name: 'postfix/master' },
        { pid: 203, user: 'ops', name: 'imapd' },
      ],
      files: {
        '/opt/mailer/config/users.db': {
          content: `# mailer user database (exported 2024-02-11)
# format: user:hash:algo
dana:${DANA_HASH}:md5
ops:${OPS_HASH}:md5
root:${ROOT_HASH}:sha512crypt
`,
        },
        '/opt/mailer/config/smtp.conf': { content: 'relay_host = mx.corvid.example\nauth = required\n' },
        '/etc/passwd': {
          content: 'root:x:0:0:root:/root:/bin/sh\nguest:x:1000:1000::/home/guest:/bin/sh\ndana:x:1001:1001::/home/dana:/bin/sh\nops:x:1002:1002::/home/ops:/bin/sh\n',
        },
        '/etc/shadow': {
          owner: 'root',
          private: true,
          content: `root:${ROOT_HASH}:19000:0:99999:7:::\n`,
        },
        '/home/guest/readme.txt': { content: 'Corvid mail: guest accounts are disabled for IMAP.' },
        '/home/dana/notes.txt': {
          owner: 'dana',
          private: true,
          content: 'TODO: move mail to the new server. Ask ops for the certificate.',
        },
        '/home/dana/flag.txt': {
          owner: 'dana',
          private: true,
          content: 'BREACH{weak_hash_weak_day}',
        },
      },
      dirs: {
        '/home/dana': { owner: 'dana', private: true },
        '/root': { owner: 'root', private: true },
      },
    },
  ],
  hashes: [
    { hash: DANA_HASH, plaintext: DANA_PASSWORD, algo: 'md5' },
    { hash: OPS_HASH, plaintext: 'Vx!9qLm#Tz4w', algo: 'md5' },
    { hash: ROOT_HASH, plaintext: 'Qz8!vL2#mR9xKt', algo: 'sha512crypt' },
  ],
  inbox: [
    {
      from: 'QUILL',
      date: 'Tue 18:40',
      subject: 'Dana Reyes',
      body: `Dana runs the Corvid mail box at ${CORVID_IP}. She uses the mailer app for her own account.
Find the account, find her password, find the flag in her home.`,
    },
  ],
  flag: 'BREACH{weak_hash_weak_day}',
  hints: [
    'Logins need a password, and passwords leave traces. Look for the mail app\'s own data under /opt before you touch anything else.',
    'crack only breaks weak hashes: ones made from common words. Long, random hashes are not worth your trace.',
    `cat /opt/mailer/config/users.db, crack ${DANA_HASH}, login dana with the result, then cat /home/dana/flag.txt.`,
  ],
  tierOverrides: {
    hard: {
      machines: {
        corvid: {
          files: {
            '/opt/mailer/config/users.db.bak': { content: '# old export (2022)\nintern:0f4d5c3e9b8a7f6e5d4c3b2a1f0e9d8c:md5\n' },
            '/home/dana/.bash_history': { owner: 'dana', private: true, content: 'mutt\nls ~/mail\nexit' },
          },
        },
      },
    },
  },
  kaliSolution: [
    'nmap',
    `ssh ${CORVID_IP}`,
    'cat /opt/mailer/config/users.db',
    `john ${DANA_HASH}`,
    'su dana',
    DANA_PASSWORD,
    'cat /home/dana/flag.txt',
    'submit BREACH{weak_hash_weak_day}',
  ],
  solution: [
    'scan',
    `connect ${CORVID_IP}`,
    'cat /opt/mailer/config/users.db',
    `crack ${DANA_HASH}`,
    'login dana',
    DANA_PASSWORD,
    'cat /home/dana/flag.txt',
    'submit BREACH{weak_hash_weak_day}',
  ],
};

export default mission;
