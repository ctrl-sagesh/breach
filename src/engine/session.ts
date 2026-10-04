// GameSession: one attempt at one mission. Owns the machine state, the session stack (pivoting),
// the trace meter, pending prompts (password, recovery questions, web form, ending choice) and the flag check.
// The UI only calls input(), prompt(), inputMode(), complete() and reads the public fields.

import { COMMAND_LIST, COMMANDS } from './commands';
import { canRead, isDir, isFile, listDir, normalizePath } from './fs';
import { runLoginQuery } from './sql';
import { applyTier, DIFFICULTY, type TierConfig } from './difficulty';
import { buildSecrets, ClueLog, containsWord, type ClueCategory, type Secret } from './clues';
import { closest } from './suggest';
import type { Stdin } from './commands/types';
import type { FailReason, LineKind, Line, MachineDef, MissionDef, ProcDef, SessionStatus, SoundEvent, Tier } from './types';

/** Everything a command prints goes through Out, so the UI can render, type out and play sounds for it. */
export class Out {
  readonly lines: Line[] = [];
  readonly sounds: SoundEvent[] = [];
  clear = false;
  quit = false;

  print(text: string, kind: LineKind = 'out'): void {
    this.lines.push({ text, kind });
  }

  /** One line made of coloured pieces, such as an ls listing. */
  printSegments(parts: { text: string; kind: LineKind }[]): void {
    this.lines.push({ text: parts.map((p) => p.text).join(''), kind: 'out', segments: parts });
  }

  sound(event: SoundEvent): void {
    this.sounds.push(event);
  }
}

export interface Frame {
  machineId: string;
  user: string;
  cwd: string;
  /** Directory before the last cd, for cd -. */
  prev?: string;
}

export interface PromptParts {
  user: string;
  host: string;
  path: string;
  symbol: '#' | '$';
  root: boolean;
}

export interface RuntimeMachine {
  def: MachineDef;
  processes: ProcDef[];
  compromised: boolean;
}

export type Pending =
  | { kind: 'password'; user: string }
  | { kind: 'recovery'; user: string; index: number; answers: string[] }
  | { kind: 'form-user' }
  | { kind: 'form-pass'; username: string }
  | { kind: 'choice' };

export type InputMode = 'shell' | 'password' | 'text' | 'choice' | 'over';

export interface Completion {
  value: string;
  options: string[];
}

export interface SessionOptions {
  now?: () => number;
  tier?: Tier;
}

const TRACE_LIMIT = 100;
/** Trace thresholds that warn the player, in order. Each fires once per attempt. */
const TRACE_WARNINGS = [70, 75, 85] as const;
const SECURITY_MULTIPLIER = 1.5;
const SECURITY_KILL_RELIEF = 20;
/** Commands whose output is never scanned for clues: hints would otherwise repeat themselves, and help text names example strings. */
const QUIET_FOR_CLUES = new Set(['help', 'hint', 'notes']);

export class GameSession {
  /** The mission as it plays on this tier (overrides applied). */
  readonly mission: MissionDef;
  readonly baseMission: MissionDef;
  readonly tier: Tier;
  readonly config: TierConfig;
  failReason: FailReason | null = null;
  readonly runtime: Record<string, RuntimeMachine> = {};
  stack: Frame[];
  trace = 0;
  hintsUsed = 0;
  history: string[] = [];
  status: SessionStatus = 'playing';
  pending: Pending | null = null;
  endingId: string | null = null;
  failedLogins = 0;
  /** Discoveries and player notes for this attempt. */
  readonly clues = new ClueLog();

  private readonly secrets: Secret[];
  private warningsGiven = 0;
  private readonly now: () => number;
  private readonly startedAt: number;
  private endedAt: number | null = null;

  constructor(baseMission: MissionDef, options: SessionOptions = {}) {
    this.tier = options.tier ?? 'medium';
    this.config = DIFFICULTY[this.tier];
    this.baseMission = baseMission;
    const mission = applyTier(baseMission, this.tier);
    this.mission = mission;
    this.secrets = this.config.autoClues ? buildSecrets(mission) : [];
    this.now = options.now ?? (() => Date.now());
    this.startedAt = this.now();
    for (const def of mission.machines) {
      this.runtime[def.id] = { def, processes: (def.processes ?? []).map((p) => ({ ...p })), compromised: false };
    }
    const start = this.runtime[mission.start.machine].def;
    this.stack = [{ machineId: start.id, user: start.defaultUser, cwd: mission.start.cwd }];
  }

  // ---- read-only views -------------------------------------------------------------------------

  get frame(): Frame {
    return this.stack[this.stack.length - 1];
  }

  get machine(): MachineDef {
    return this.runtime[this.frame.machineId].def;
  }

  get processes(): ProcDef[] {
    return this.runtime[this.frame.machineId].processes;
  }

  get hintLimit(): number {
    return this.config.hintLimit;
  }

  /** Seconds left on a timed tier, or null when there is no clock. */
  timeRemaining(): number | null {
    if (this.config.timeLimitSeconds === null) return null;
    return Math.max(0, this.config.timeLimitSeconds - this.elapsedSeconds());
  }

  get finished(): boolean {
    return this.status === 'won' || this.status === 'failed';
  }

  home(): string {
    return this.machine.users.find((u) => u.name === this.frame.user)?.home ?? '/';
  }

  resolve(path: string): string {
    return normalizePath(path, this.frame.cwd, this.home());
  }

  findByIp(ip: string): MachineDef | undefined {
    return Object.values(this.runtime)
      .map((r) => r.def)
      .find((d) => d.ip === ip);
  }

  elapsedSeconds(): number {
    return Math.max(0, Math.floor(((this.endedAt ?? this.now()) - this.startedAt) / 1000));
  }

  intro(): Line[] {
    return [
      { text: `${this.machine.hostname} :: session open as ${this.frame.user}`, kind: 'sys' },
      { text: "Type 'help' for commands. Every noisy action raises your trace.", kind: 'dim' },
    ];
  }

  inputMode(): InputMode {
    if (this.finished) return 'over';
    const p = this.pending;
    if (!p) return 'shell';
    if (p.kind === 'password' || p.kind === 'form-pass') return 'password';
    if (p.kind === 'choice') return 'choice';
    return 'text';
  }

  /** The shell prompt in parts, so the UI can colour them the way Kali does. */
  promptParts(): PromptParts {
    const home = this.home();
    const cwd = this.frame.cwd;
    const path = cwd === home ? '~' : cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
    const root = this.frame.user === 'root';
    return { user: this.frame.user, host: this.machine.hostname, path, symbol: root ? '#' : '$', root };
  }

  prompt(): string {
    const p = this.pending;
    if (p) {
      switch (p.kind) {
        case 'password':
          return 'Password: ';
        case 'form-pass':
          return 'password: ';
        case 'form-user':
          return 'username: ';
        case 'recovery': {
          const question = this.machine.recovery?.[p.user]?.[p.index]?.question ?? '';
          return `Q${p.index + 1}. ${question} `;
        }
        case 'choice':
          return `choose [1-${this.mission.endings?.length ?? 0}]: `;
      }
    }
    const parts = this.promptParts();
    return `${parts.user}@${parts.host}:${parts.path}${parts.symbol} `;
  }

  // ---- input -----------------------------------------------------------------------------------

  /** Feed one line of player input. Returns what to print and which sounds to play. */
  input(raw: string): Out {
    const out = new Out();
    this.expireIfLate();
    const mode = this.inputMode();

    if (mode === 'over') {
      out.print('Session closed.', 'dim');
      return out;
    }

    if (mode === 'password') out.print(`${this.prompt()}${'*'.repeat(raw.length)}`, 'echo');
    else out.print(`${this.prompt()}${mode === 'shell' ? raw.trim() : raw}`, 'echo');

    if (this.pending) {
      this.handlePending(raw, out);
      return out;
    }

    const line = raw.trim();
    if (line) {
      this.history.push(line);
      const start = out.lines.length;
      this.dispatch(line, out);
      if (!QUIET_FOR_CLUES.has(splitCommand(line)[0])) this.scanForClues(out.lines.slice(start));
    }
    return out;
  }

  private dispatch(line: string, out: Out): void {
    const segments = splitPipeline(line);
    if (segments.some((seg) => seg === '')) {
      out.print('bash: syntax error near unexpected token `|\'', 'err');
      return;
    }
    let stdin: Stdin = null;
    for (let i = 0; i < segments.length; i++) {
      const [name, ...args] = splitCommand(segments[i]);
      const command = COMMANDS.get(name);
      if (!command) {
        out.print(`bash: ${name}: command not found`, 'err');
        const near = closest(name, COMMAND_LIST);
        if (near.length) out.print(`Did you mean: ${near.join(', ')}?`, 'dim');
        return;
      }
      if (i === segments.length - 1) {
        command.run(this, args, out, stdin);
        return;
      }
      // Earlier parts of a pipeline feed the next part. Errors and warnings still reach the player.
      const sub = new Out();
      command.run(this, args, sub, stdin);
      out.sounds.push(...sub.sounds);
      stdin = [];
      for (const piece of sub.lines) {
        if (piece.kind === 'err' || piece.kind === 'warn') out.lines.push(piece);
        else stdin.push(piece.text);
      }
      // A failed part ends the pipeline, the way a shell does after a non-zero exit.
      if (sub.lines.some((piece) => piece.kind === 'err')) return;
    }
  }

  /** Runs one line with root rights, for sudo. The real account comes back afterwards. */
  runAsRoot(line: string, out: Out): void {
    const frame = this.frame;
    const user = frame.user;
    frame.user = 'root';
    try {
      this.dispatch(line, out);
    } finally {
      frame.user = user;
    }
  }

  /** The account this session is logged in as can use sudo. */
  canSudo(): boolean {
    return Boolean(this.machine.users.find((u) => u.name === this.frame.user)?.sudo);
  }

  /** Ctrl+C at a password or question prompt: drops the question. Returns true when one was open. */
  cancelPending(out: Out): boolean {
    if (!this.pending) return false;
    this.pending = null;
    out.print('^C', 'dim');
    return true;
  }

  /** Records a discovery in the clue log. Does nothing on tiers without an automatic log. */
  discover(category: ClueCategory, text: string): void {
    if (this.config.autoClues) this.clues.record(category, text);
  }

  /** Looks for known secrets in command output and logs the ones that appear as whole words. */
  private scanForClues(lines: Line[]): void {
    if (this.secrets.length === 0) return;
    for (const line of lines) {
      for (const secret of this.secrets) {
        if (containsWord(line.text, secret.text)) this.clues.record(secret.category, secret.text);
      }
    }
  }

  /**
   * Corrects a mistyped path one segment at a time. Each segment uses the exact child when it exists,
   * otherwise the closest child the current user can read (so private names are never suggested).
   * Returns the corrected absolute path, or null when nothing close exists.
   */
  suggestPath(input: string): string | null {
    const target = this.resolve(input);
    let cur = '/';
    let changed = false;
    for (const seg of target.split('/').filter(Boolean)) {
      const exact = cur === '/' ? `/${seg}` : `${cur}/${seg}`;
      if (isFile(this.machine, exact) || isDir(this.machine, exact)) {
        cur = exact;
        continue;
      }
      if (!isDir(this.machine, cur) || !canRead(this.machine, cur, this.frame.user)) return null;
      const readable = listDir(this.machine, cur)
        .map((e) => e.name)
        .filter((name) => canRead(this.machine, cur === '/' ? `/${name}` : `${cur}/${name}`, this.frame.user));
      const [match] = closest(seg, readable, 1);
      if (!match) return null;
      cur = cur === '/' ? `/${match}` : `${cur}/${match}`;
      changed = true;
    }
    return changed ? cur : null;
  }

  private handlePending(raw: string, out: Out): void {
    const p = this.pending;
    if (!p) return;

    switch (p.kind) {
      case 'password': {
        this.pending = null;
        if (raw === '?' && this.machine.recovery?.[p.user]) {
          this.pending = { kind: 'recovery', user: p.user, index: 0, answers: [] };
          out.print('Account recovery started. Answer your security questions.', 'warn');
          return;
        }
        const account = this.machine.users.find((u) => u.name === p.user);
        if (account && account.password === raw) this.grant(p.user, out);
        else this.loginFailed(out);
        return;
      }

      case 'recovery': {
        const questions = this.machine.recovery?.[p.user] ?? [];
        p.answers.push(raw);
        if (p.answers.length < questions.length) {
          p.index = p.answers.length;
          return;
        }
        this.pending = null;
        const ok = questions.every((q, i) => normalize(q.answer) === normalize(p.answers[i]));
        if (ok) this.grant(p.user, out);
        else this.loginFailed(out);
        return;
      }

      case 'form-user':
        this.pending = { kind: 'form-pass', username: raw };
        return;

      case 'form-pass':
        this.pending = null;
        this.submitForm(p.username, raw, out);
        return;

      case 'choice':
        this.choose(raw, out);
        return;
    }
  }

  // ---- actions used by commands ----------------------------------------------------------------

  /** Adds trace for a noisy action. Security processes on the current host multiply it. */
  noise(base: number, out: Out): void {
    if (this.finished) return;
    const alarmed = this.processes.some((p) => p.security);
    const amount = Math.round(base * this.config.traceMultiplier * (alarmed ? SECURITY_MULTIPLIER : 1));
    this.trace = Math.min(TRACE_LIMIT, this.trace + amount);

    const messages = [
      'the network is watching you. Slow down or get out.',
      'alarm raised. Security has your address.',
      'one more mistake and you are burned.',
    ];
    const sounds: SoundEvent[] = ['trace', 'alarm', 'alert'];
    TRACE_WARNINGS.forEach((level, i) => {
      if (this.warningsGiven > i || this.trace < level) return;
      this.warningsGiven = i + 1;
      out.print(`!! TRACE ${level}%: ${messages[i]}`, 'warn');
      out.sound(sounds[i]);
    });
    if (this.trace >= TRACE_LIMIT) {
      this.status = 'failed';
      this.failReason = 'trace';
      this.pending = null;
      this.endedAt = this.now();
      out.print('TRACE 100%. Connection severed. Mission failed.', 'err');
      out.sound('fail');
    }
  }

  /** Ends the attempt when the clock runs out. Returns true if this call ended it. */
  expireIfLate(): boolean {
    if (this.status !== 'playing') return false;
    if (this.timeRemaining() !== 0) return false;
    this.status = 'failed';
    this.failReason = 'time';
    this.pending = null;
    this.endedAt = this.now();
    return true;
  }

  lowerTrace(amount: number): void {
    this.trace = Math.max(0, this.trace - amount);
  }

  /** Opens a session on another machine. The new frame starts as that machine's default user. */
  pushFrame(machineId: string): void {
    const def = this.runtime[machineId].def;
    const home = def.users.find((u) => u.name === def.defaultUser)?.home ?? '/';
    this.stack.push({ machineId, user: def.defaultUser, cwd: home });
  }

  popFrame(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  /** Password prompt for `login <user> [password]`. */
  attemptLogin(user: string, password: string, out: Out): void {
    const account = this.machine.users.find((u) => u.name === user);
    if (account && account.password === password) this.grant(user, out);
    else this.loginFailed(out);
  }

  requestPassword(user: string): void {
    this.pending = { kind: 'password', user };
  }

  openForm(out: Out): void {
    const form = this.machine.webForm;
    if (!form) return;
    out.print(`=== ${form.title} ===`, 'title');
    out.print('Credentials are sent to the server exactly as typed.', 'dim');
    this.pending = { kind: 'form-user' };
  }

  submitFlag(text: string, out: Out): void {
    if (this.status !== 'playing') return;
    if (text.trim() !== this.mission.flag) {
      out.print('Access denied: that is not the flag.', 'err');
      out.sound('denied');
      return;
    }
    if (this.mission.endings?.length) {
      this.status = 'choosing';
      this.pending = { kind: 'choice' };
      out.print('FLAG ACCEPTED. The client is waiting for your call.', 'ok');
      out.print('What do you do with the packet?', 'warn');
      this.mission.endings.forEach((e, i) => out.print(`  ${i + 1}) ${e.label}`));
      out.sound('granted');
      return;
    }
    this.win(out);
  }

  // ---- internals -------------------------------------------------------------------------------

  private grant(user: string, out: Out): void {
    const account = this.machine.users.find((u) => u.name === user);
    this.frame.user = user;
    this.frame.cwd = account?.home ?? '/';
    this.runtime[this.frame.machineId].compromised = true;
    out.print(`Access granted. Logged in as ${user}.`, 'ok');
    out.sound('granted');
    this.noise(4, out);
  }

  private loginFailed(out: Out): void {
    this.failedLogins++;
    out.print('Login incorrect.', 'err');
    out.sound('denied');
    this.noise(15, out);
  }

  private submitForm(username: string, password: string, out: Out): void {
    const form = this.machine.webForm;
    if (!form) return;
    const result = runLoginQuery(form.query, username, password, form.rows);
    if (!result.ok && result.error) {
      out.print(`SQL error: ${result.error}`, 'err');
      out.sound('alert');
      this.noise(5, out);
      return;
    }
    if (!result.ok) {
      this.failedLogins++;
      out.print('Invalid credentials.', 'err');
      out.sound('denied');
      this.noise(15, out);
      return;
    }
    out.print(`Welcome, ${result.user}.`, 'ok');
    out.sound('granted');
    for (const line of form.success) out.print(line, 'ok');
    this.noise(4, out);
  }

  private choose(raw: string, out: Out): void {
    const endings = this.mission.endings ?? [];
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n < 1 || n > endings.length) {
      out.print(`Choose 1-${endings.length}.`, 'warn');
      return;
    }
    const ending = endings[n - 1];
    this.endingId = ending.id;
    this.pending = null;
    this.win(out, ending.text);
  }

  private win(out: Out, extra: string[] = []): void {
    this.status = 'won';
    this.endedAt = this.now();
    if (!this.mission.endings?.length) out.print('FLAG ACCEPTED. Payment queued. Mission complete.', 'ok');
    for (const line of extra) out.print(line);
    out.sound('win');
  }

  // ---- tab completion --------------------------------------------------------------------------

  complete(line: string): Completion {
    // After a pipe, complete the command that follows it.
    const pipeAt = line.lastIndexOf('|');
    if (pipeAt >= 0) {
      const inner = this.complete(line.slice(pipeAt + 1).replace(/^\s+/, ''));
      return { value: `${line.slice(0, pipeAt + 1)} ${inner.value}`, options: inner.options };
    }

    const endsWithSpace = /\s$/.test(line);
    const parts = line.split(/\s+/).filter(Boolean);

    if (parts.length <= 1 && !endsWithSpace) {
      const partial = parts[0] ?? '';
      const options = COMMAND_LIST.filter((c) => c.startsWith(partial));
      return finishCompletion('', partial, options);
    }

    // Aliases complete as the command they stand for: connect is ssh, scan is nmap, crack is john.
    const cmd = COMMANDS.get(parts[0])?.name ?? parts[0];
    const partial = endsWithSpace ? '' : parts[parts.length - 1];
    const base = line.slice(0, line.length - partial.length);
    let options: string[] = [];

    switch (cmd) {
      case 'cd':
      case 'ls':
      case 'cat':
      case 'grep':
      case 'head':
      case 'tail':
      case 'wc':
      case 'find':
        options = this.pathCandidates(partial);
        break;
      case 'ssh':
      case 'nmap':
      case 'ping': {
        // user@ip: the part after the @ completes against neighbours, the user part is kept as typed.
        const at = partial.lastIndexOf('@');
        const prefix = at >= 0 ? partial.slice(0, at + 1) : '';
        const ipPart = partial.slice(at + 1);
        options = this.machine.neighbors.filter((ip) => ip.startsWith(ipPart)).map((ip) => `${prefix}${ip}`);
        break;
      }
      case 'su':
        options = this.machine.users.map((u) => u.name).filter((n) => n.startsWith(partial));
        break;
      case 'decode':
      case 'base64':
        if (parts.length <= 2) options = ['base64', 'rot13', 'hex'].filter((e) => e.startsWith(partial));
        break;
      case 'kill':
        options = this.processes.map((p) => String(p.pid)).filter((pid) => pid.startsWith(partial));
        break;
      case 'help':
      case 'man':
        options = COMMAND_LIST.filter((c) => c.startsWith(partial));
        break;
      default:
        break;
    }
    return finishCompletion(base, partial, options);
  }

  private pathCandidates(partial: string): string[] {
    const slash = partial.lastIndexOf('/');
    const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : '';
    const namePart = partial.slice(slash + 1);
    const abs = this.resolve(dirPart || '.');
    if (!isDir(this.machine, abs) || !canRead(this.machine, abs, this.frame.user)) return [];
    return listDir(this.machine, abs)
      .filter((e) => e.name.startsWith(namePart) && (namePart.startsWith('.') || !e.name.startsWith('.')))
      .map((e) => `${dirPart}${e.name}${e.type === 'dir' ? '/' : ''}`);
  }
}

/** Splits a line on | outside quotes. Each part is one command of a pipeline. Quotes are kept for splitCommand. */
export function splitPipeline(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '|') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/** Splits a shell line into words. Single and double quotes group words; everything else is literal. */
export function splitCommand(line: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: string | null = null;
  let hasWord = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasWord = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current || hasWord) words.push(current);
      current = '';
      hasWord = false;
      continue;
    }
    current += ch;
    hasWord = true;
  }
  if (current || hasWord) words.push(current);
  return words;
}

function normalize(answer: string): string {
  return answer.trim().toLowerCase();
}

function commonPrefix(items: string[]): string {
  if (items.length === 0) return '';
  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

function finishCompletion(base: string, partial: string, options: string[]): Completion {
  if (options.length === 0) return { value: base + partial, options: [] };
  if (options.length === 1) {
    const only = options[0];
    return { value: base + only + (only.endsWith('/') ? '' : ' '), options };
  }
  const shared = commonPrefix(options);
  return { value: base + (shared.length > partial.length ? shared : partial), options };
}
