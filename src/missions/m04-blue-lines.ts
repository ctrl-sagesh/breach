// Mission 4: log forensics. Someone got in before you. Find the first successful intruder in rotated logs.

import type { MissionDef } from '../engine/types';
import { makeRig } from './shared';

const HARBOR_IP = '10.13.37.77';

const mission: MissionDef = {
  id: 'm04-blue-lines',
  number: 4,
  codename: 'BLUE LINES',
  title: 'Harbor Web: who got in first',
  client: 'QUILL',
  briefing: [
    'Harbor Web was breached three weeks before QUILL noticed. "Someone got in first," QUILL writes. "I want the name of the first one through the door."',
    'QUILL: "Do not get distracted by the loud stuff. Loud is what people use to hide quiet."',
    { text: 'The logs on that box are older than this job. Whoever it was left their handwriting in them.', glitch: true },
  ],
  debrief: [
    'The first real entry was not the brute-force noise on the first page. It was a quiet successful login, in a file most people never open.',
    'Log timestamps and log rotation are where forensics lives. The current log is rarely the whole story.',
    'Failed logins are attempts. Accepted logins are doors. Learn to tell them apart.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([HARBOR_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Harbor Web forensics (${HARBOR_IP})
Goal: the username of the first intruder to get a shell from outside.
Flag format: BREACH{username}`,
      },
    }),
    {
      id: 'harbor',
      hostname: 'harbor-web',
      ip: HARBOR_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [{ name: 'guest', password: '', home: '/home/guest' }],
      ports: [
        { port: 22, service: 'ssh', banner: 'OpenSSH 7.4' },
        { port: 80, service: 'http', banner: 'nginx 1.12.2' },
      ],
      files: {
        '/var/log/README': {
          content: 'Logs rotate weekly. The previous week lives in numbered files (auth.log.1).\nAsk ops before deleting anything.',
        },
        '/var/log/auth.log.1': {
          content: [
            'Feb 02 02:58:11 harbor-web sshd[790]: Connection closed by 10.13.37.9 port 51200',
            'Feb 02 03:11:04 harbor-web sshd[811]: Failed password for root from 45.19.2.8 port 40122 ssh2',
            'Feb 02 03:11:09 harbor-web sshd[811]: Failed password for root from 45.19.2.8 port 40122 ssh2',
            'Feb 02 03:14:52 harbor-web sshd[833]: Accepted password for svc_backup from 203.0.113.44 port 50311 ssh2',
            'Feb 02 03:15:01 harbor-web sudo: svc_backup : TTY=pts/0 ; COMMAND=/bin/bash',
            'Feb 02 03:20:17 harbor-web sshd[840]: Failed password for deploy from 45.19.2.8 port 40170 ssh2',
            'Feb 02 09:02:44 harbor-web sshd[901]: Accepted publickey for ops from 10.13.37.9 port 51977 ssh2',
          ].join('\n'),
        },
        '/var/log/auth.log': {
          content: [
            'Feb 09 14:20:03 harbor-web sshd[1204]: Accepted password for webdev from 10.13.37.9 port 52001 ssh2',
            'Feb 09 14:31:45 harbor-web sshd[1210]: Failed password for admin from 198.51.100.7 port 60012 ssh2',
            'Mar 01 22:48:09 harbor-web sshd[1288]: Accepted password for admin from 198.51.100.7 port 60990 ssh2',
            'Mar 01 22:49:30 harbor-web sshd[1290]: Accepted password for ops from 10.13.37.9 port 52200 ssh2',
          ].join('\n'),
        },
        '/var/log/syslog': {
          content: 'Feb 02 03:15:02 harbor-web kernel: [eth0] link up\nFeb 02 03:15:02 harbor-web cron[477]: (root) CMD (backup.sh)',
        },
        '/var/log/nginx/access.log': {
          content: '203.0.113.44 - - "GET /admin HTTP/1.1" 404\n198.51.100.7 - - "GET /login HTTP/1.1" 200',
        },
      },
    },
  ],
  hashes: [],
  inbox: [
    {
      from: 'QUILL',
      date: 'Thu 11:30',
      subject: 'Who was first',
      body: `Harbor Web lives at ${HARBOR_IP}. Start with the logs. I need the first successful login from outside the 10.13.37 range.
Do not trust my memory of dates. Trust the files.`,
    },
  ],
  flag: 'BREACH{svc_backup}',
  // The player builds the flag themselves from a discovered fragment (the username in the log line) wrapped
  // in the stated template; the complete flag string never appears anywhere for a per-run swap to find.
  // See src/lib/variation.ts.
  varyFlag: false,
  hints: [
    'The first break-in is the earliest successful login from outside. Failed attempts are noise, not entry.',
    'Logs rotate into numbered files. Read /var/log/README before you assume the current auth.log is the whole story.',
    'grep -r Accepted /var/log, then find the oldest "Accepted password" line from an address outside 10.13.37. The username is the flag.',
  ],
  tierOverrides: {
    hard: {
      machines: {
        harbor: {
          files: {
            '/var/log/auth.log.2': { content: 'Jan 26 04:01:12 harbor-web sshd[640]: Failed password for root from 45.19.2.8 port 40011 ssh2\nJan 26 04:01:19 harbor-web sshd[640]: Connection closed by 45.19.2.8 port 40011' },
            '/var/log/cron.log': { content: 'Feb 02 03:00:01 harbor-web CRON[477]: (root) CMD (logrotate)\nFeb 09 03:00:01 harbor-web CRON[512]: (root) CMD (logrotate)' },
          },
        },
      },
    },
  },
  kaliSolution: [
    'nmap',
    `ssh ${HARBOR_IP}`,
    'ls /var/log',
    'cat /var/log/README',
    'grep -r Accepted /var/log',
    'submit BREACH{svc_backup}',
  ],
  solution: [
    'scan',
    `connect ${HARBOR_IP}`,
    'ls /var/log',
    'cat /var/log/README',
    'grep -r Accepted /var/log',
    'submit BREACH{svc_backup}',
  ],
};

export default mission;
