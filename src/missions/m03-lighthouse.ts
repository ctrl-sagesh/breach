// Mission 3: encoded secrets. Base64 hides a password in a config file, and rot13 hides the flag.
// A hex decoy is included so players learn that a decoded string is not automatically the flag.

import type { MissionDef } from '../engine/types';
import { rot13, toBase64, toHex } from '../engine/encoding';
import { makeRig } from './shared';

const LIGHTHOUSE_IP = '10.13.37.61';
const SVC_PASSWORD = 'Tl3ghthouse-29';
const SVC_B64 = toBase64(SVC_PASSWORD);
const FLAG = 'BREACH{rot13_is_not_encryption}';
const VAULT_NOTE = rot13(`Vault maintenance key: ${FLAG}`);

const mission: MissionDef = {
  id: 'm03-lighthouse',
  number: 3,
  codename: 'LIGHTHOUSE',
  title: 'Lighthouse Freight: config host',
  client: 'QUILL',
  briefing: [
    'Lighthouse Freight keeps service credentials in a config file. QUILL says "encoded" is not the same as "protected."',
    'QUILL: "Unwrap the service password. Then find the vault note. The company keeps its best secrets somewhere boring."',
    { text: 'The config file has a comment about being committed to git once. Nobody ever rotated it.', glitch: true },
  ],
  debrief: [
    'Base64 is an encoding, not a lock. So is ROT13, which is a joke that survives because it looks like encryption.',
    'The decoy hex string was also decodable. Not every readable string is the answer. Check that it matches what the job asked for.',
    'Lighthouse never rotated the password. Neither did half the internet.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([LIGHTHOUSE_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Lighthouse Freight config host (${LIGHTHOUSE_IP})
Goal: service account 'svc', then the flag in its home.
Notes from QUILL: secrets here are encoded, not encrypted.`,
      },
    }),
    {
      id: 'lighthouse',
      hostname: 'lighthouse-cfg',
      ip: LIGHTHOUSE_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'svc', password: SVC_PASSWORD, home: '/home/svc' },
      ],
      ports: [
        { port: 22, service: 'ssh', banner: 'OpenSSH 8.2p1' },
        { port: 443, service: 'https', banner: 'nginx 1.18.0' },
      ],
      files: {
        '/etc/lighthouse/app.conf': {
          content: `[database]
host = 10.13.37.62
user = svc
password_b64 = ${SVC_B64}
# rotate before the audit. this file was committed to git once.
`,
        },
        '/etc/lighthouse/README': {
          content: 'Lighthouse Freight config host.\nPolicy 4.2: credentials are encoded at rest.\nIf you cannot read it, ask Mara.',
        },
        '/home/guest/readme.txt': { content: 'Guests may read the public config only.' },
        '/home/svc/vault_note.rot13': {
          owner: 'svc',
          private: true,
          content: VAULT_NOTE,
        },
        '/home/svc/decoy.hex': {
          owner: 'svc',
          private: true,
          content: toHex('Decoy: BREACH{nice_try_decoy}'),
        },
        '/home/svc/chat.log': {
          owner: 'svc',
          private: true,
          content: 'mara: did you finish the vault note?\nsvc: its rot13, like last time lol\nmara: that is not encryption.\nsvc: it is encryption for my cousin.',
        },
      },
      dirs: { '/home/svc': { owner: 'svc', private: true } },
    },
  ],
  hashes: [],
  inbox: [
    {
      from: 'QUILL',
      date: 'Wed 07:15',
      subject: 'Encoded is not locked',
      body: `The config host is at ${LIGHTHOUSE_IP}. Their password is wrapped in the most common encoding on earth.
The vault note is the thing I want. It is in the service account's home.`,
    },
  ],
  flag: FLAG,
  hints: [
    'The app config has a database password, but it is wrapped. Read the config first and look at the field name.',
    'password_b64 says what kind of wrapping it is. decode it with the right encoding, then login svc with the result.',
    'After login, look in /home/svc. The file ending in .rot13 holds the flag. Decode it, then submit only the BREACH{...} part.',
  ],
  tierOverrides: {
    hard: {
      machines: {
        lighthouse: {
          files: {
            '/etc/lighthouse/app.conf.old': { content: '[database]\nhost = 10.13.37.62\nuser = svc\npassword_b64 = ' + toBase64('oldpass-2021') + '\n' },
            '/home/svc/.bash_history': { owner: 'svc', private: true, content: 'ls\ncat ~/todo.txt\nexit' },
          },
        },
      },
    },
  },
  kaliSolution: [
    'nmap',
    `ssh ${LIGHTHOUSE_IP}`,
    'cat /etc/lighthouse/app.conf',
    `echo ${SVC_B64} | base64 -d`,
    'su svc',
    SVC_PASSWORD,
    'cat /home/svc/vault_note.rot13',
    `echo ${VAULT_NOTE} | tr 'A-Za-z' 'N-ZA-Mn-za-m'`,
    `submit ${FLAG}`,
  ],
  solution: [
    'scan',
    `connect ${LIGHTHOUSE_IP}`,
    'cat /etc/lighthouse/app.conf',
    `decode base64 ${SVC_B64}`,
    'login svc',
    SVC_PASSWORD,
    'cat /home/svc/vault_note.rot13',
    `decode rot13 ${VAULT_NOTE}`,
    `submit ${FLAG}`,
  ],
};

export default mission;
