// Mission 8: finale. The client is not who they seemed. The choice at the end decides the ending.

import type { MissionDef } from '../engine/types';
import { toBase64 } from '../engine/encoding';
import { makeRig } from './shared';

const ARCHIVE_IP = '10.13.37.240';
const MARROW_PASSWORD = 'M4rr0w-Keys-88';
const FLAG = 'BREACH{the_client_was_the_crime}';

const mission: MissionDef = {
  id: 'm08-ghost-protocol',
  number: 8,
  codename: 'GHOST PROTOCOL',
  title: 'Harlan Crest Archive: the last job',
  client: 'QUILL',
  briefing: [
    'QUILL\'s final posting arrives with the same signature as always. The timestamp is a few minutes wrong. You notice. You decide not to mention it.',
    'QUILL: "One last archive. Pull the staff directory and whatever the incident team left lying around. Then you are clear. Do not ask why I need a directory."',
    { text: 'The dossiers you built for the last seven jobs are sitting in a folder somewhere. Your handwriting is on all of them.', glitch: true },
  ],
  debrief: [
    'The directory lists QUILL\'s real name. It is the head of internal security at the company the client claimed to be exposing.',
    'The incident brief names the journalist, Teo Vance, as the story. The dossiers you built were the evidence. You were the contractor the plan did not need to trust.',
    'Whatever you do next, you can no longer pretend the job was only data.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([ARCHIVE_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Harlan Crest Archive (${ARCHIVE_IP})
Goal: the staff directory and the incident folder, then the flag in marrow's home.
Payment: on delivery of the flag.`,
      },
    }),
    {
      id: 'archive',
      hostname: 'crest-archive',
      ip: ARCHIVE_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'marrow', password: MARROW_PASSWORD, home: '/home/marrow' },
      ],
      ports: [
        { port: 22, service: 'ssh', banner: 'OpenSSH 9.2p1' },
        { port: 443, service: 'https', banner: 'nginx 1.22.1' },
      ],
      files: {
        '/srv/hr/directory.txt': {
          content: `HARLAN CREST HOLDINGS :: STAFF DIRECTORY (internal, do not forward)

Marrow, Ilse      Director, Internal Security      ext 4417
Halvorsen, Dana   CFO                               ext 4100
Vance, Teo        (former employee, flagged)        n/a

Note: the exchange handle "QUILL" is listed under Marrow, Ilse. Do not repeat.`,
        },
        '/srv/hr/.provision': {
          content: `# provisioning note (auto-generated)
user: marrow
pass_b64: ${toBase64(MARROW_PASSWORD)}
# remove after first login`,
        },
        '/srv/incident/brief-0412.txt': {
          content: `SUBJECT: Vance packet
1. Dossiers from the Brightwater, Corvid, Harbor and Lighthouse jobs go into the packet.
2. The packet goes to the Ledger Post as an anonymous tip from QUILL.
3. Teo Vance is the named source. Make him the story.
4. Contractor "ghost" does not need the full plan. Keep it that way.`,
        },
        '/srv/incident/ledger-post-packet.txt': {
          content: 'attachments:\n  dossier_vance.pdf   (from job 5)\n  ledger_export.csv   (from job 7)\n  harbor_logs.txt     (from job 4)',
        },
        '/home/marrow/flag.txt': {
          owner: 'marrow',
          private: true,
          content: FLAG,
        },
        '/home/marrow/quill-drafts.txt': {
          owner: 'marrow',
          private: true,
          content: 'draft 3: "an anonymous source inside Harlan Crest confirms Vance took payments..."',
        },
      },
      dirs: { '/home/marrow': { owner: 'marrow', private: true } },
    },
  ],
  hashes: [],
  inbox: [
    {
      from: 'QUILL',
      date: 'Sun 03:58',
      subject: 'Last one',
      body: `Crest Archive at ${ARCHIVE_IP}. Pull the staff directory and the incident folder.
You have been very reliable. Nothing personal. Keep your head down.`,
    },
  ],
  flag: FLAG,
  hints: [
    'Before you finish, ask who the client really is. The staff directory answers that more honestly than the mail does.',
    'A hidden provisioning file sits in /srv/hr. ls -a shows hidden files. Its password is base64 encoded.',
    'decode base64 on the pass_b64 value, login marrow with the result, cat /home/marrow/flag.txt, submit it, then choose an ending.',
  ],
  endings: [
    {
      id: 'burn',
      label: 'Burn the packet. Wipe the drop, keep the money, vanish.',
      text: [
        'You wipe the drop and the exchange board. The payment lands in an account nobody can trace back to you.',
        'Somewhere inside Harlan Crest a director sleeps well. You will never know whether that was a mistake.',
      ],
    },
    {
      id: 'expose',
      label: 'Send the packet to Teo Vance, with the frame attached.',
      text: [
        'You send the packet to Teo Vance with no name and no fee. He calls back within the hour. He has been expecting a tip for months.',
        'The Ledger Post runs the story with the frame exposed. Ilse Marrow resigns on a Tuesday. You stop being a ghost and become a witness.',
      ],
    },
    {
      id: 'sell',
      label: 'Sell the packet back to Harlan Crest. Handles can be passed on.',
      text: [
        'Harlan Crest pays triple and asks for a new handle. You give them one. It is not QUILL. It is GHOST.',
        'A week later a new client posts a job with no company name. You recognise the phrasing, because it is yours.',
      ],
    },
  ],
  tierOverrides: {
    hard: {
      machines: {
        archive: {
          files: {
            '/srv/hr/.provision.old': { content: '# superseded provisioning note\nuser: marrow\npass_b64: ' + toBase64('changeme') + '\n' },
            '/srv/hr/payroll-2019.csv': { content: 'name,salary\nVance Teo,0\nHalvorsen Dana,240000' },
          },
        },
      },
    },
  },
  kaliSolution: [
    `ssh ${ARCHIVE_IP}`,
    'cat /srv/hr/directory.txt',
    'cat /srv/incident/brief-0412.txt',
    'ls -la /srv/hr',
    'cat /srv/hr/.provision',
    `echo ${toBase64(MARROW_PASSWORD)} | base64 -d`,
    'su marrow',
    MARROW_PASSWORD,
    'cat /home/marrow/flag.txt',
    `submit ${FLAG}`,
    '2',
  ],
  solution: [
    `connect ${ARCHIVE_IP}`,
    'cat /srv/hr/directory.txt',
    'cat /srv/incident/brief-0412.txt',
    'ls -a /srv/hr',
    'cat /srv/hr/.provision',
    `decode base64 ${toBase64(MARROW_PASSWORD)}`,
    'login marrow',
    MARROW_PASSWORD,
    'cat /home/marrow/flag.txt',
    `submit ${FLAG}`,
    '2',
  ],
};

export default mission;
