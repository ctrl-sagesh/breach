// Shared types for the game engine and mission data.
// Mission files are pure data built from these shapes; the engine knows nothing about specific missions.

export type LineKind = 'out' | 'echo' | 'err' | 'ok' | 'warn' | 'dim' | 'sys' | 'title' | 'glitch' | 'dir' | 'exec';

export interface Line {
  text: string;
  kind: LineKind;
  /** Optional coloured pieces. `text` is still the whole plain line, used for scanning and piping. */
  segments?: { text: string; kind: LineKind }[];
}

export type SoundEvent =
  | 'key'
  | 'command'
  | 'error'
  | 'enter'
  | 'alert'
  | 'alarm'
  | 'granted'
  | 'denied'
  | 'trace'
  | 'glitch'
  | 'tick'
  | 'rank'
  | 'sting'
  | 'win'
  | 'fail'
  | 'chatter'
  | 'ping'
  | 'boom';

export interface FileDef {
  content: string;
  /** Account that owns the file. */
  owner?: string;
  /** Private files are readable only by their owner and root. */
  private?: boolean;
  /** Shown green by ls, with the execute bit in ls -l. */
  executable?: boolean;
}

export interface DirDef {
  owner?: string;
  private?: boolean;
}

export interface UserDef {
  name: string;
  password: string;
  home: string;
  /** Member of the sudoers file. Only these accounts can use sudo. */
  sudo?: boolean;
}

export interface PortDef {
  port: number;
  service: string;
  banner: string;
}

export interface ProcDef {
  pid: number;
  user: string;
  name: string;
  /** Security processes (IDS, sentry, auditd) multiply trace gain while they run. */
  security?: boolean;
}

export interface SecurityQuestion {
  question: string;
  answer: string;
}

export interface WebFormDef {
  title: string;
  /** Accounts the login table contains. Order matters: the first matching row wins. */
  rows: { username: string; password: string }[];
  /**
   * SQL template. `{username}` and `{password}` are pasted in raw, the way a careless app would.
   * Supported SQL: SELECT ... FROM ... WHERE expr, with = AND OR parentheses, quoted strings, -- and # comments.
   */
  query: string;
  success: string[];
}

export interface MachineDef {
  id: string;
  hostname: string;
  ip: string;
  /** IPs this machine can route to. Scanning and connecting only work along these edges. */
  neighbors: string[];
  defaultUser: string;
  users: UserDef[];
  ports: PortDef[];
  files: Record<string, FileDef>;
  dirs?: Record<string, DirDef>;
  processes?: ProcDef[];
  /** Security questions for account recovery, keyed by username. Triggered by typing ? at a password prompt. */
  recovery?: Record<string, SecurityQuestion[]>;
  webForm?: WebFormDef;
}

export interface HashDef {
  hash: string;
  plaintext: string;
  algo: string;
}

export interface EmailDef {
  from: string;
  date: string;
  subject: string;
  body: string;
}

export interface EndingDef {
  id: string;
  label: string;
  text: string[];
}

export type StoryLine = string | { text: string; glitch: true };

export interface MissionDef {
  id: string;
  number: number;
  codename: string;
  title: string;
  client: string;
  briefing: StoryLine[];
  debrief: StoryLine[];
  start: { machine: string; cwd: string };
  /** Must include the rig (the player's own machine, id "rig"). */
  machines: MachineDef[];
  hashes: HashDef[];
  inbox: EmailDef[];
  flag: string;
  hints: [string, string, string];
  /** If present, submitting the flag opens a choice that selects an ending. */
  endings?: EndingDef[];
  /** Per-tier additions. Missing tiers play the base mission unchanged. */
  tierOverrides?: TierOverrides;
  /** Walkthrough used by the test suite to prove the mission is beatable. Entries are typed exactly as a player would type them. */
  solution: string[];
  /** The same walkthrough typed with the real Kali command names. The tests play it too. */
  kaliSolution: string[];
}

export type Tier = 'easy' | 'medium' | 'hard';

/** Extra content injected on a tier. Used for decoys: extra files, users, processes, mail. */
export interface MachineOverride {
  files?: Record<string, FileDef>;
  users?: UserDef[];
  processes?: ProcDef[];
}

export interface TierOverride {
  machines?: Record<string, MachineOverride>;
  /** Subjects of base inbox messages to drop on this tier. Applied before `inbox` is appended. */
  hideInbox?: string[];
  inbox?: EmailDef[];
}

export type TierOverrides = Partial<Record<Tier, TierOverride>>;

export type FailReason = 'trace' | 'time';

export type SessionStatus = 'playing' | 'choosing' | 'won' | 'failed';
