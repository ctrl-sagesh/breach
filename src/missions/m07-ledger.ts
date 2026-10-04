// Mission 7: simplified SQL injection. The staff login pastes your input straight into its query.
// The source file leaks the query shape, and the database error leaks where your input ends up.

import type { MissionDef } from '../engine/types';
import { makeRig } from './shared';

const LEDGER_IP = '10.13.37.150';
const ADMIN_PASSWORD = 'Cr3st-Ledger!9';
const FLAG = 'BREACH{tautology_beats_password}';

const LOGIN_PHP = `<?php
// staff login. TODO: switch to prepared statements (ticket LED-212)
$user = $_POST['username'];
$pass = $_POST['password'];
$q = "SELECT id, username FROM users WHERE username = '$user' AND password = '$pass'";
$rows = db_query($q);
if (count($rows) > 0) {
    $_SESSION['staff'] = $rows[0]['username'];
    redirect('/admin/');
} else {
    echo 'Invalid credentials';
}
?>`;

const mission: MissionDef = {
  id: 'm07-ledger',
  number: 7,
  codename: 'LEDGER',
  title: 'Crest Payroll Ledger: staff login',
  client: 'QUILL',
  briefing: [
    'Harlan Crest Holdings runs payroll through a web form that was written in a hurry. QUILL wants the admin panel.',
    'QUILL: "Ask it nicely. Then stop asking." The rig can reach the ledger host. Nothing else.',
    { text: 'The staff form is a text box that talks to a database. Text boxes have opinions about quotation marks.', glitch: true },
  ],
  debrief: [
    'The form pasted your username into a SQL string. A single quote closed the string early, and OR made the whole WHERE clause true.',
    'This is SQL injection in its simplest form. The fix is prepared statements: the database should never parse your input as code.',
    'The ledger had the flag in its admin export. Payroll data, unlocked by a text box. That is the business model of most breaches.',
  ],
  start: { machine: 'rig', cwd: '/home/ghost' },
  machines: [
    makeRig([LEDGER_IP], {
      '/home/ghost/job.txt': {
        owner: 'ghost',
        content: `JOB: Crest Payroll Ledger (${LEDGER_IP})
Goal: admin panel of the staff login. Flag is in the admin export token.
Tip: the login form is a web form. Read the source before you type.`,
      },
    }),
    {
      id: 'ledger',
      hostname: 'ledger-web',
      ip: LEDGER_IP,
      neighbors: [],
      defaultUser: 'guest',
      users: [
        { name: 'guest', password: '', home: '/home/guest' },
        { name: 'admin', password: ADMIN_PASSWORD, home: '/home/admin' },
        { name: 'clerk', password: 'payday2024', home: '/home/clerk' },
      ],
      ports: [
        { port: 80, service: 'http', banner: 'Apache 2.4.41' },
        { port: 443, service: 'https', banner: 'Apache 2.4.41 (TLS)' },
      ],
      webForm: {
        title: 'CREST PAYROLL LEDGER :: STAFF LOGIN',
        rows: [
          { username: 'admin', password: ADMIN_PASSWORD },
          { username: 'clerk', password: 'payday2024' },
        ],
        query: "SELECT id, username FROM users WHERE username = '{username}' AND password = '{password}'",
        success: ['--- PAYROLL ADMIN ---', `Export token: ${FLAG}`, 'Use the export token to close ticket LED-212.'],
      },
      files: {
        '/var/www/ledger/login.php': { content: LOGIN_PHP },
        '/var/www/ledger/README': {
          content: 'CREST PAYROLL LEDGER (internal)\nStaff only. The staff form is the login.\nTODO: prepared statements, ticket LED-212.',
        },
        '/var/www/ledger/db-notes.txt': {
          content: 'users(id, username, password)  -- plaintext, migration pending',
        },
        '/var/www/ledger/admin/payroll.csv': {
          owner: 'admin',
          private: true,
          content: 'name,salary\nhalvorsen,212000\nmarrow,198000',
        },
        '/home/guest/readme.txt': { content: 'Guests cannot read payroll.' },
      },
      dirs: { '/var/www/ledger/admin': { owner: 'admin', private: true } },
    },
  ],
  hashes: [],
  inbox: [
    {
      from: 'QUILL',
      date: 'Mon 22:17',
      subject: 'Payroll',
      body: `The ledger host is ${LEDGER_IP}. Its staff form is the only way in. I want the admin export.
If you read the source, you will see what the form expects you to be.`,
    },
  ],
  flag: FLAG,
  hints: [
    'The staff form builds its database query by pasting in whatever you type. Read login.php to see exactly where your input lands.',
    'Put a single quote in the username. If the form breaks, the SQL error shows you where your input ended up.',
    "Close the username string with a quote, make the WHERE clause always true with OR, then comment out the rest with --. Any password works after that.",
  ],
  tierOverrides: {
    hard: {
      machines: {
        ledger: {
          files: {
            '/var/www/ledger/login.php.bak': { content: '<?php\n// old version, before ticket LED-212\n// password check was moved into the query\n?>' },
            '/var/www/ledger/CHANGELOG': { content: 'LED-212 open: switch to prepared statements.' },
          },
        },
      },
    },
  },
  // The login form is a web page with no command-line equivalent in this simulation, so it keeps the form command.
  kaliSolution: [
    'nmap',
    `ssh ${LEDGER_IP}`,
    'cat /var/www/ledger/login.php',
    'login',
    "' OR '1'='1' --",
    'anything',
    `submit ${FLAG}`,
  ],
  solution: [
    'scan',
    `connect ${LEDGER_IP}`,
    'cat /var/www/ledger/login.php',
    'login',
    "' OR '1'='1' --",
    'anything',
    `submit ${FLAG}`,
  ],
};

export default mission;
