// Mission 6: pivoting. The DMZ gateway is the only door. Get in, neutralise the sentry, then reach the internal vault.

import type { MissionDef } from '../engine/types';
import { makeRig } from './shared';

const GATEWAY_IP = '10.13.37.100';
const VAULT_IP = '10.13.37.120';
const DEPLOY_PASSWORD = 'depl0y-2026!';
const DBADMIN_PASSWORD = 'Vault!sync-77';
const SENTRY_PID = 412;

const mission: MissionDef = {
  id: 'm06-pivot',
  number: 6,
  codename: 'PIVOT',
  title: 'Harlan Crest DMZ: the way through',
  client: 'QUILL',
  briefing: [
    'The DMZ gateway is the front door of Harlan Crest Holdings. Behind it is a database nobody outside the company should be able to reach.',
    'QUILL: "The gateway is only the bridge. The vault behind it has dossiers on people who asked the wrong questions. Get through. Then get into the vault."',
    { text: 'A sentry process is running on the gateway. It has not noticed you yet.', glitch: true },
  ],
  debrief: [
    'You never touched the vault from outside. You went through the gateway, which is how real attacks work: one foothold, then the next.',
    'The sentry mattered. Security tooling that runs on a box you control is a problem you solve with the account that owns it.',
    'Reading the dossier index was a bad feeling. You will think about it later.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([GATEWAY_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Harlan Crest DMZ (${GATEWAY_IP})
Goal: reach the internal vault (not directly reachable from the rig).
Flag is in /srv/vault on the vault host.`,
      },
    }),
    {
      id: 'gateway',
      hostname: 'dmz-gateway',
      ip: GATEWAY_IP,
      neighbors: [VAULT_IP],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'deploy', password: DEPLOY_PASSWORD, home: '/home/deploy' },
        { name: 'root', password: 'unused-root-x9', home: '/root' },
      ],
      ports: [
        { port: 22, service: 'ssh', banner: 'OpenSSH 8.2p1' },
        { port: 443, service: 'https', banner: 'nginx 1.18.0' },
      ],
      processes: [
        { pid: 1, user: 'root', name: 'init' },
        { pid: SENTRY_PID, user: 'deploy', name: 'ids-sentry --watch all', security: true },
        { pid: 501, user: 'www-data', name: 'nginx: worker' },
      ],
      files: {
        '/opt/deploy/deploy.env': {
          content: `DEPLOY_USER=deploy
DEPLOY_PASS=${DEPLOY_PASSWORD}
# TODO: move this into the vault. (it is public, I know)`,
        },
        '/opt/deploy/scripts/backup.sh': {
          owner: 'deploy',
          private: true,
          executable: true,
          content: `#!/bin/sh
# nightly dump of the vault database
DBHOST=${VAULT_IP}
DBUSER=dbadmin
DBPASS=${DBADMIN_PASSWORD}
mysqldump -h $DBHOST -u $DBUSER -p$DBPASS vault > /srv/backups/vault.sql
`,
        },
        '/home/deploy/.bash_history': {
          owner: 'deploy',
          private: true,
          content: `ssh dbadmin@${VAULT_IP}\nsystemctl status ids-sentry\nexit`,
        },
        '/home/guest/readme.txt': { content: 'DMZ gateway. Authorized staff only.' },
      },
      dirs: {
        '/home/deploy': { owner: 'deploy', private: true },
        '/opt/deploy/scripts': { owner: 'deploy', private: true },
      },
    },
    {
      id: 'vault',
      hostname: 'vault-db',
      ip: VAULT_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'dbadmin', password: DBADMIN_PASSWORD, home: '/home/dbadmin' },
      ],
      ports: [{ port: 3306, service: 'mysql', banner: 'MySQL 5.7.42' }],
      files: {
        '/srv/vault/README': { content: 'Vault database. Dumps nightly. Do not query from the DMZ.' },
        '/srv/vault/dossiers/teo-vance.txt': {
          owner: 'dbadmin',
          private: true,
          content: 'SUBJECT: Teo Vance (freelance journalist)\nHome: 14 Mill St, Lakeport\nStatus: packet drafted, awaiting QUILL sign-off',
        },
        '/srv/vault/flag.txt': {
          owner: 'dbadmin',
          private: true,
          content: 'BREACH{pivot_complete_ids_ignored}',
        },
      },
      dirs: { '/srv/vault': { owner: 'dbadmin', private: true } },
    },
  ],
  hashes: [],
  inbox: [
    {
      from: 'QUILL',
      date: 'Sat 14:12',
      subject: 'Front door',
      body: `The gateway is at ${GATEWAY_IP}. It is the only host you can see from the rig.
Once you are inside, you will see what is behind it. The vault is the prize.`,
    },
  ],
  flag: 'BREACH{pivot_complete_ids_ignored}',
  hints: [
    'The gateway is a bridge. Look for credentials sitting in plain sight in /opt before you try anything clever.',
    'A security process is watching this host (ps). Its trace multiplier is why your numbers climb. Kill it from the account that owns it.',
    `login deploy, read backup.sh for the database password, scan from the gateway to find the vault, connect ${VAULT_IP}, login dbadmin, cat /srv/vault/flag.txt.`,
  ],
  tierOverrides: {
    hard: {
      machines: {
        gateway: {
          files: {
            '/opt/deploy/CHANGELOG': { content: 'v2.4: rotated ids-sentry config\nv2.5: TODO remove deploy password from deploy.env' },
          },
          users: [{ name: 'backup', password: 'backup', home: '/home/backup' }],
          processes: [{ pid: 777, user: 'root', name: 'crond' }],
        },
        vault: {
          files: {
            '/srv/vault/dossiers/index.txt': { owner: 'dbadmin', private: true, content: 'teo-vance.txt\nmarcus-hale.txt\nilse-lund.txt' },
          },
        },
      },
    },
  },
  kaliSolution: [
    'nmap',
    `ssh ${GATEWAY_IP}`,
    'cat /opt/deploy/deploy.env',
    'su deploy',
    DEPLOY_PASSWORD,
    'ps',
    `kill ${SENTRY_PID}`,
    'cat /opt/deploy/scripts/backup.sh',
    'nmap',
    `ssh ${VAULT_IP}`,
    'su dbadmin',
    DBADMIN_PASSWORD,
    'cat /srv/vault/flag.txt',
    'submit BREACH{pivot_complete_ids_ignored}',
  ],
  solution: [
    'scan',
    `connect ${GATEWAY_IP}`,
    'cat /opt/deploy/deploy.env',
    'login deploy',
    DEPLOY_PASSWORD,
    'ps',
    `kill ${SENTRY_PID}`,
    'cat /opt/deploy/scripts/backup.sh',
    'scan',
    `connect ${VAULT_IP}`,
    'login dbadmin',
    DBADMIN_PASSWORD,
    'cat /srv/vault/flag.txt',
    'submit BREACH{pivot_complete_ids_ignored}',
  ],
};

export default mission;
