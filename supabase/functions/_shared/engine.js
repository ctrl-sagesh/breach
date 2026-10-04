// src/engine/difficulty.ts
var TIERS = ["easy", "medium", "hard"];
var DIFFICULTY = {
  easy: {
    label: "Easy",
    description: "Forgiving trace, full tab completion, a tip in every briefing.",
    hintLimit: 3,
    traceMultiplier: 0.6,
    pointMultiplier: 1,
    timeLimitSeconds: null,
    showTimer: false,
    briefingTip: true,
    recoveryHints: "direct",
    autoClues: true
  },
  medium: {
    label: "Medium",
    description: "The standard balance. Three hints, full completion.",
    hintLimit: 3,
    traceMultiplier: 1,
    pointMultiplier: 1.5,
    timeLimitSeconds: null,
    showTimer: false,
    briefingTip: false,
    recoveryHints: "footer",
    autoClues: true
  },
  hard: {
    label: "Hard",
    description: "One hint, fast trace, decoys in every machine, a 20 minute clock.",
    hintLimit: 1,
    traceMultiplier: 1.6,
    pointMultiplier: 2.5,
    timeLimitSeconds: 20 * 60,
    showTimer: true,
    briefingTip: false,
    recoveryHints: "none",
    autoClues: false
  }
};
function pointsFor(baseScore, tier) {
  return Math.round(baseScore * DIFFICULTY[tier].pointMultiplier);
}
function applyTier(mission9, tier) {
  const override = mission9.tierOverrides?.[tier];
  if (!override) return mission9;
  const machines = mission9.machines.map((machine) => {
    const extra = override.machines?.[machine.id];
    if (!extra) return machine;
    return {
      ...machine,
      files: { ...machine.files, ...extra.files ?? {} },
      users: [...machine.users, ...extra.users ?? []],
      processes: [...machine.processes ?? [], ...extra.processes ?? []]
    };
  });
  const hidden = new Set(override.hideInbox ?? []);
  return {
    ...mission9,
    machines,
    inbox: [...mission9.inbox.filter((m) => !hidden.has(m.subject)), ...override.inbox ?? []]
  };
}

// src/engine/scoring.ts
var MAX_MISSION_SCORE = 1e3;
var MIN_MISSION_SCORE = 100;
function scoreMission(seconds, trace, hints) {
  const timePenalty = Math.min(400, Math.floor(seconds / 3));
  const tracePenalty = Math.min(300, trace * 2);
  const hintPenalty = hints * 120;
  return Math.max(MIN_MISSION_SCORE, MAX_MISSION_SCORE - timePenalty - tracePenalty - hintPenalty);
}

// src/engine/suggest.ts
function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}
function closest(word, candidates, limit = 3) {
  const target = word.toLowerCase();
  if (!target) return [];
  const maxDistance = target.length < 4 ? 1 : 2;
  return candidates.map((c) => ({ c, d: levenshtein(target, c.toLowerCase()) })).filter((x) => x.d > 0 && x.d <= maxDistance).sort((x, y) => x.d - y.d || x.c.localeCompare(y.c)).slice(0, limit).map((x) => x.c);
}

// src/engine/encoding.ts
function toBase64(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(input) {
  const binary = atob(input.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
  });
}
function toHex(text) {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(input) {
  const clean = input.replace(/\s+/g, "");
  if (!/^([0-9a-f]{2})+$/i.test(clean)) throw new Error("invalid hex");
  const bytes = Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16));
  return new TextDecoder().decode(bytes);
}

// src/engine/fs.ts
function normalizePath(input, cwd, home) {
  let target = input;
  if (target === "~" || target.startsWith("~/")) target = home + target.slice(1);
  const full = target.startsWith("/") ? target : `${cwd}/${target}`;
  const parts = [];
  for (const seg of full.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join("/")}`;
}
function isFile(m, abs) {
  return Object.prototype.hasOwnProperty.call(m.files, abs);
}
function isDir(m, abs) {
  if (abs === "/" || m.dirs?.[abs]) return true;
  const prefix = `${abs}/`;
  return Object.keys(m.files).some((p) => p.startsWith(prefix));
}
function canRead(m, abs, user) {
  if (user === "root") return true;
  let cur = "";
  for (const seg of abs.split("/").filter(Boolean)) {
    cur += `/${seg}`;
    const node = isFile(m, cur) ? m.files[cur] : m.dirs?.[cur];
    if (node?.private && node.owner !== user) return false;
  }
  return true;
}
function listDir(m, abs) {
  const prefix = abs === "/" ? "/" : `${abs}/`;
  const entries = /* @__PURE__ */ new Map();
  for (const [path, file] of Object.entries(m.files)) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      entries.set(rest, { name: rest, type: "file", owner: file.owner, size: file.content.length, private: file.private, executable: file.executable });
    } else {
      const name = rest.slice(0, slash);
      if (!entries.has(name)) {
        const dir = m.dirs?.[`${prefix}${name}`];
        entries.set(name, { name, type: "dir", owner: dir?.owner, size: 0, private: dir?.private });
      }
    }
  }
  for (const [path, dir] of Object.entries(m.dirs ?? {})) {
    if (path === abs || !path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).split("/")[0];
    if (!entries.has(name)) entries.set(name, { name, type: "dir", owner: dir.owner, size: 0, private: dir.private });
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function filesUnder(m, abs) {
  const prefix = abs === "/" ? "/" : `${abs}/`;
  return Object.keys(m.files).filter((p) => p.startsWith(prefix)).sort();
}

// src/engine/commands/crypto.ts
var WORDLIST = [
  "password",
  "123456",
  "letmein",
  "admin",
  "welcome",
  "monkey",
  "dragon",
  "qwerty",
  "sunshine",
  "princess",
  "football",
  "iloveyou",
  "trustno1",
  "shadow",
  "master",
  "summer",
  "winter",
  "ghost",
  "canary",
  "hunter2"
];
function sourceText(s, file, stdin, out) {
  if (file) {
    const abs = s.resolve(file);
    if (!isFile(s.machine, abs)) {
      out.print(`base64: ${file}: No such file or directory`, "err");
      return null;
    }
    if (!canRead(s.machine, abs, s.frame.user)) {
      out.print(`base64: ${file}: Permission denied`, "err");
      return null;
    }
    return s.machine.files[abs].content.trim();
  }
  if (stdin) return stdin.join("\n").trim();
  out.print("usage: base64 [-d] [file]   (or pipe input in)", "err");
  return null;
}
var cryptoCommands = [
  {
    name: "john",
    aliases: ["hashcat", "crack"],
    usage: "john <hash>",
    summary: "wordlist attack on a hash (only common passwords fall). hashcat and crack also work",
    example: "john 3f2a9c7e1b4d8f60a5c2e9d17b8a4f3e",
    run(s, args, out) {
      const hash = args.filter((a) => !a.startsWith("-")).pop();
      if (!hash) {
        out.print("usage: john <hash>", "err");
        return;
      }
      out.print(`Loaded 1 password hash. Wordlist: ${WORDLIST.length} entries.`, "dim");
      out.sound("chatter");
      const entry = s.mission.hashes.find((h) => h.hash === hash);
      if (entry && WORDLIST.includes(entry.plaintext)) {
        out.print(`${hash.slice(0, 16)}...  (${entry.algo})`, "dim");
        out.print(`MATCH (${entry.algo}): ${entry.plaintext}`, "ok");
        out.sound("granted");
      } else {
        out.print("No password hashes cracked (wordlist exhausted).", "err");
        out.sound("denied");
      }
      s.noise(12, out);
    }
  },
  {
    name: "base64",
    usage: "base64 [-d] [file]",
    summary: "encode text, or with -d decode it. reads a file or a pipe",
    example: "echo aGVsbG8= | base64 -d",
    run(s, args, out, stdin) {
      const decode = args.includes("-d") || args.includes("--decode");
      const file = args.find((a) => !a.startsWith("-"));
      const text = sourceText(s, file, stdin, out);
      if (text === null) return;
      if (!decode) {
        out.print(toBase64(text));
        return;
      }
      try {
        const decoded = fromBase64(text);
        out.print(decoded, "ok");
        s.discover("decoded", decoded);
      } catch {
        out.print("base64: invalid input", "err");
      }
    }
  },
  {
    name: "decode",
    usage: "decode <base64|rot13|hex> <text>",
    summary: "decode an encoded string (the short form of base64 -d)",
    example: "decode base64 aGVsbG8=",
    run(s, args, out) {
      const [encoding, ...rest] = args;
      const text = rest.join(" ");
      if (!encoding || !text) {
        out.print("usage: decode <base64|rot13|hex> <text>", "err");
        return;
      }
      let decoded;
      try {
        switch (encoding.toLowerCase()) {
          case "base64":
            decoded = fromBase64(text);
            break;
          case "rot13":
            decoded = rot13(text);
            break;
          case "hex":
            decoded = fromHex(text);
            break;
          default:
            out.print(`decode: unknown encoding '${encoding}' (try base64, rot13, hex)`, "err");
            return;
        }
      } catch {
        out.print(`decode: input is not valid ${encoding.toLowerCase()}`, "err");
        return;
      }
      out.print(decoded, "ok");
      s.discover("decoded", decoded);
    }
  }
];

// src/engine/commands/files.ts
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function didYouMean(s, target, out) {
  const fixed = s.suggestPath(target);
  if (fixed) out.print(`Did you mean: ${fixed}?`, "dim");
}
function entryKind(e) {
  if (e.type === "dir") return "dir";
  return e.executable ? "exec" : "out";
}
function permissions(e) {
  if (e.type === "dir") return `d${e.private ? "rwx------" : "rwxr-xr-x"}`;
  if (e.private) return e.executable ? "-rwx------" : "-rw-------";
  return e.executable ? "-rwxr-xr-x" : "-rw-r--r--";
}
function globToRegExp(glob) {
  const source = glob.split("").map((c) => c === "*" ? ".*" : c === "?" ? "." : escapeRegExp(c)).join("");
  return new RegExp(`^${source}$`);
}
var fileCommands = [
  {
    name: "ls",
    usage: "ls [-la] [path...]",
    summary: "list directory contents (-a shows hidden, -l long format with permissions and owners)",
    example: "ls -la /home",
    run(s, args, out) {
      const flags = args.filter((a) => a.startsWith("-")).join("");
      const paths = args.filter((a) => !a.startsWith("-"));
      const showAll = flags.includes("a");
      const long = flags.includes("l");
      const targets = paths.length ? paths : ["."];
      for (const target of targets) {
        const abs = s.resolve(target);
        if (isFile(s.machine, abs)) {
          if (!canRead(s.machine, abs, s.frame.user)) out.print(`ls: cannot access '${target}': Permission denied`, "err");
          else out.print(target);
          continue;
        }
        if (!isDir(s.machine, abs)) {
          out.print(`ls: cannot access '${target}': No such file or directory`, "err");
          didYouMean(s, target, out);
          continue;
        }
        if (!canRead(s.machine, abs, s.frame.user)) {
          out.print(`ls: cannot open directory '${target}': Permission denied`, "err");
          continue;
        }
        if (targets.length > 1) out.print(`${target}:`, "dim");
        const entries = listDir(s.machine, abs).filter((e) => showAll || !e.name.startsWith("."));
        if (long) {
          for (const e of entries) {
            const owner = (e.owner ?? "root").padEnd(8);
            const size = String(e.size).padStart(5);
            const label = e.type === "dir" ? `${e.name}/` : e.name;
            out.printSegments([
              { text: `${permissions(e)} 1 ${owner} ${size} `, kind: "out" },
              { text: label, kind: entryKind(e) }
            ]);
          }
        } else if (entries.length) {
          const parts = [];
          entries.forEach((e, i) => {
            if (i > 0) parts.push({ text: "  ", kind: "out" });
            parts.push({ text: e.type === "dir" ? `${e.name}/` : e.name, kind: entryKind(e) });
          });
          out.printSegments(parts);
        }
      }
    }
  },
  {
    name: "cd",
    usage: "cd [path | - | ..]",
    summary: "change directory. no argument goes home, cd - goes back",
    example: "cd /srv/logs",
    run(s, args, out) {
      const back = args[0] === "-";
      const target = back ? s.frame.prev ?? s.frame.cwd : args[0] ?? "~";
      const abs = s.resolve(target);
      if (isFile(s.machine, abs)) {
        out.print(`cd: not a directory: ${target}`, "err");
        return;
      }
      if (!isDir(s.machine, abs)) {
        out.print(`cd: no such file or directory: ${target}`, "err");
        didYouMean(s, target, out);
        return;
      }
      if (!canRead(s.machine, abs, s.frame.user)) {
        out.print(`cd: permission denied: ${target}`, "err");
        return;
      }
      s.frame.prev = s.frame.cwd;
      s.frame.cwd = abs;
      if (back) out.print(abs);
    }
  },
  {
    name: "pwd",
    usage: "pwd",
    summary: "print the current directory",
    example: "pwd",
    run(s, _args, out) {
      out.print(s.frame.cwd);
    }
  },
  {
    name: "cat",
    usage: "cat <file...>",
    summary: "print file contents. with no file, prints piped input",
    example: "cat notes.txt",
    run(s, args, out, stdin) {
      if (args.length === 0) {
        if (stdin) {
          for (const line of stdin) out.print(line);
          return;
        }
        out.print("cat: missing operand. Give a file, or pipe something in.", "err");
        return;
      }
      for (const target of args) {
        const abs = s.resolve(target);
        if (isDir(s.machine, abs) && !isFile(s.machine, abs)) {
          out.print(`cat: ${target}: Is a directory`, "err");
        } else if (!isFile(s.machine, abs)) {
          out.print(`cat: ${target}: No such file or directory`, "err");
          didYouMean(s, target, out);
        } else if (!canRead(s.machine, abs, s.frame.user)) {
          out.print(`cat: ${target}: Permission denied`, "err");
        } else {
          s.reads.add(`${s.frame.machineId}:${abs}`);
          for (const line of s.machine.files[abs].content.split("\n")) out.print(line);
        }
      }
    }
  },
  {
    name: "grep",
    usage: "grep [-rin] <pattern> [file|dir...]",
    summary: "search files for a pattern (-r recursive, -i ignore case, -n line numbers). reads a pipe when no file is given",
    example: 'grep -rin "password" /srv',
    run(s, args, out, stdin) {
      const opts = /* @__PURE__ */ new Set();
      const rest = [];
      for (const a of args) {
        if (/^-[a-zA-Z]+$/.test(a)) for (const c of a.slice(1)) opts.add(c);
        else rest.push(a);
      }
      if (rest.length === 0) {
        out.print("Usage: grep [-rin] <pattern> [file|dir...]", "err");
        return;
      }
      const [pattern, ...targets] = rest;
      const flags = opts.has("i") ? "i" : "";
      let re;
      try {
        re = new RegExp(pattern, flags);
      } catch {
        re = new RegExp(escapeRegExp(pattern), flags);
      }
      if (targets.length === 0 && stdin) {
        stdin.forEach((line, idx) => {
          if (!re.test(line)) return;
          out.print(`${opts.has("n") ? `${idx + 1}:` : ""}${line}`);
        });
        return;
      }
      const recursive = opts.has("r");
      if (targets.length === 0 && !recursive) {
        out.print("grep: no input file given", "err");
        return;
      }
      const files = [];
      for (const target of targets.length ? targets : ["."]) {
        const abs = s.resolve(target);
        if (isFile(s.machine, abs)) {
          if (canRead(s.machine, abs, s.frame.user)) files.push(abs);
          else out.print(`grep: ${target}: Permission denied`, "err");
        } else if (isDir(s.machine, abs)) {
          if (!recursive) {
            out.print(`grep: ${target}: Is a directory`, "err");
            continue;
          }
          files.push(...filesUnder(s.machine, abs).filter((p) => canRead(s.machine, p, s.frame.user)));
        } else {
          out.print(`grep: ${target}: No such file or directory`, "err");
          didYouMean(s, target, out);
        }
      }
      const showName = files.length > 1 || recursive || targets.length > 1;
      for (const file of files) {
        s.machine.files[file].content.split("\n").forEach((line, idx) => {
          if (!re.test(line)) return;
          const prefix = `${showName ? `${file}:` : ""}${opts.has("n") ? `${idx + 1}:` : ""}`;
          out.print(`${prefix}${line}`);
        });
      }
    }
  },
  {
    name: "find",
    usage: "find [path] [-name pattern] [-type f|d]",
    summary: "list files and directories under a path, filtered by name or type",
    example: 'find /srv -name "*.txt" -type f',
    run(s, args, out) {
      let base = ".";
      let namePattern = null;
      let type = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-name") namePattern = globToRegExp(args[++i] ?? "*");
        else if (args[i] === "-type") type = args[++i] === "d" ? "d" : "f";
        else if (!args[i].startsWith("-")) base = args[i];
      }
      const root = s.resolve(base);
      if (!isDir(s.machine, root) && !isFile(s.machine, root)) {
        out.print(`find: '${base}': No such file or directory`, "err");
        return;
      }
      if (!canRead(s.machine, root, s.frame.user)) {
        out.print(`find: '${base}': Permission denied`, "err");
        return;
      }
      const dirname = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
      const found = /* @__PURE__ */ new Set([root]);
      for (const file of filesUnder(s.machine, root)) {
        if (!canRead(s.machine, file, s.frame.user)) continue;
        found.add(file);
        for (let parent = dirname(file); parent !== root && parent.length > root.length - (root === "/" ? 1 : 0); parent = dirname(parent)) {
          if (canRead(s.machine, parent, s.frame.user)) found.add(parent);
        }
      }
      for (const path of [...found].sort()) {
        const isDirectory = isDir(s.machine, path) && !isFile(s.machine, path);
        if (type === "f" && isDirectory) continue;
        if (type === "d" && !isDirectory) continue;
        const name = path.slice(path.lastIndexOf("/") + 1);
        if (namePattern && !namePattern.test(name)) continue;
        out.print(path === root ? base : base + path.slice(root.length));
      }
    }
  }
];

// src/engine/commands/network.ts
function broadcast(ip) {
  const parts = ip.split(".");
  return [...parts.slice(0, 3), "255"].join(".");
}
var networkCommands = [
  {
    name: "nmap",
    aliases: ["scan"],
    usage: "nmap [-sV] [-sn] [ip]",
    summary: "no argument: discover neighbours. with an ip: port scan (-sV adds service versions)",
    example: "nmap -sV 10.0.0.20",
    run(s, args, out) {
      const m = s.machine;
      const flags = args.filter((a) => a.startsWith("-"));
      const targets = args.filter((a) => !a.startsWith("-"));
      const versions = flags.includes("-sV");
      if (targets.length === 0 || flags.includes("-sn")) {
        out.print(`Starting Nmap (breach-sim) host discovery from ${m.hostname} (${m.ip})`, "dim");
        if (m.neighbors.length === 0) out.print("No hosts responded.", "warn");
        for (const ip2 of m.neighbors) {
          const host2 = s.findByIp(ip2);
          if (host2) out.print(`Nmap scan report for ${host2.hostname} (${ip2})`);
        }
        out.print(`Nmap done: ${m.neighbors.length} IP address(es) (${m.neighbors.length} host(s) up) scanned.`);
        s.noise(5, out);
        return;
      }
      const ip = targets[0];
      const host = m.neighbors.includes(ip) ? s.findByIp(ip) : void 0;
      if (!host) {
        out.print(`Note: host ${ip} seems down. No route from ${m.hostname}.`, "err");
        return;
      }
      out.print(`Starting Nmap (breach-sim) against ${ip}`, "dim");
      out.print(`Nmap scan report for ${host.hostname} (${ip})`);
      out.print(versions ? "PORT      STATE  SERVICE    VERSION" : "PORT      STATE  SERVICE");
      for (const p of host.ports) {
        const row = `${`${p.port}/tcp`.padEnd(9)} open   ${p.service.padEnd(10)}`;
        out.print(versions ? `${row} ${p.banner}` : row.trimEnd());
        out.sound("ping");
      }
      if (host.ports.length === 0) out.print("All scanned ports are closed.", "dim");
      out.print(`Nmap done: 1 IP address (1 host up) scanned.`);
      s.noise(10, out);
    }
  },
  {
    name: "ssh",
    aliases: ["connect"],
    usage: "ssh [user@]<ip>",
    summary: "open a session on a neighbouring host. ssh user@ip asks for that user's password",
    example: "ssh rfoster@10.0.0.20",
    run(s, args, out) {
      const target = args[0];
      if (!target) {
        out.print("usage: ssh [user@]<ip>", "err");
        return;
      }
      const at = target.lastIndexOf("@");
      const user = at >= 0 ? target.slice(0, at) : null;
      const ip = at >= 0 ? target.slice(at + 1) : target;
      const host = s.machine.neighbors.includes(ip) ? s.findByIp(ip) : void 0;
      if (!host) {
        out.print(`ssh: connect to host ${ip} port 22: No route to host`, "err");
        return;
      }
      s.pushFrame(host.id);
      out.print(`Connected to ${host.hostname} (${ip}) as ${s.frame.user}.`, "ok");
      out.sound("enter");
      s.noise(3, out);
      if (user && user !== s.frame.user) s.requestPassword(user);
    }
  },
  {
    name: "su",
    aliases: ["login"],
    usage: "su <user> [password]",
    summary: "switch to a user. no argument on a web host opens its login form",
    example: "su admin",
    run(s, args, out) {
      if (args.length === 0) {
        if (s.machine.webForm) {
          s.openForm(out);
          return;
        }
        out.print("usage: su <user>", "err");
        return;
      }
      const user = args[0];
      if (args.length >= 2) {
        s.attemptLogin(user, args.slice(1).join(" "), out);
        return;
      }
      s.requestPassword(user);
      if (s.machine.recovery?.[user] && s.config.recoveryHints === "direct") out.print("Forgot it? Type ? at the prompt to start account recovery.", "dim");
    }
  },
  {
    name: "exit",
    usage: "exit",
    summary: "close the current session (from your rig, abort the mission)",
    example: "exit",
    run(s, _args, out) {
      if (s.stack.length > 1) {
        const closed = s.machine.hostname;
        s.popFrame();
        out.print(`Connection to ${closed} closed. Back on ${s.machine.hostname}.`, "dim");
        return;
      }
      out.print(`Disconnecting from ${s.machine.hostname}. Aborting mission.`, "sys");
      out.quit = true;
    }
  },
  {
    name: "ping",
    usage: "ping [-c count] <ip>",
    summary: "send echo requests to a neighbouring host",
    example: "ping -c 2 10.0.0.20",
    run(s, args, out) {
      let count = 4;
      let ip;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-c") count = Math.max(1, Math.min(10, Number(args[++i]) || 4));
        else if (!args[i].startsWith("-")) ip = args[i];
      }
      if (!ip) {
        out.print("usage: ping [-c count] <ip>", "err");
        return;
      }
      out.print(`PING ${ip} (${ip}) 56(84) bytes of data.`);
      if (!s.machine.neighbors.includes(ip) || !s.findByIp(ip)) {
        out.print(`From ${s.machine.ip} icmp_seq=1 Destination Host Unreachable`, "err");
        s.noise(2, out);
        return;
      }
      for (let seq = 1; seq <= count; seq++) {
        out.print(`64 bytes from ${ip}: icmp_seq=${seq} ttl=64 time=${(0.8 + seq * 0.3).toFixed(1)} ms`);
      }
      out.print(`--- ${ip} ping statistics ---`, "dim");
      out.print(`${count} packets transmitted, ${count} received, 0% packet loss`, "dim");
      s.noise(2, out);
    }
  },
  {
    name: "ifconfig",
    usage: "ifconfig",
    summary: "show the network interface address",
    example: "ifconfig",
    run(s, _args, out) {
      out.print("eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500");
      out.print(`        inet ${s.machine.ip}  netmask 255.255.255.0  broadcast ${broadcast(s.machine.ip)}`);
    }
  },
  {
    name: "ip",
    usage: "ip a",
    summary: "show addresses (ip a, ip addr)",
    example: "ip a",
    run(s, args, out) {
      if (!["a", "addr", "address"].includes(args[0] ?? "")) {
        out.print("usage: ip a", "err");
        return;
      }
      out.print(`2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP`);
      out.print(`    inet ${s.machine.ip}/24 brd ${broadcast(s.machine.ip)} scope global eth0`);
    }
  }
];

// src/engine/clues.ts
var CLUE_LABELS = {
  ip: "IP",
  username: "USER",
  password: "PASS",
  hash: "HASH",
  decoded: "DECODED"
};
var SKIPPED_USERNAMES = /* @__PURE__ */ new Set(["root"]);
function buildSecrets(mission9) {
  const secrets = [];
  for (const machine of mission9.machines) {
    if (machine.id === "rig") continue;
    secrets.push({ category: "ip", text: machine.ip });
    for (const user of machine.users) {
      if (!SKIPPED_USERNAMES.has(user.name)) secrets.push({ category: "username", text: user.name });
      if (user.password) secrets.push({ category: "password", text: user.password });
    }
  }
  for (const entry of mission9.hashes) {
    secrets.push({ category: "hash", text: entry.hash });
    secrets.push({ category: "password", text: entry.plaintext });
  }
  return secrets;
}
var WORD_CHAR = /[A-Za-z0-9_]/;
function containsWord(line, token) {
  let at = line.indexOf(token);
  while (at >= 0) {
    const before = line[at - 1] ?? "";
    const after = line[at + token.length] ?? "";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    at = line.indexOf(token, at + 1);
  }
  return false;
}
var ClueLog = class {
  constructor() {
    this.discovered = [];
    this.seen = /* @__PURE__ */ new Set();
    this.playerNotes = [];
  }
  /** Records a discovery once per category and text. Returns true when it is new. */
  record(category, text) {
    const key = `${category}\0${text}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.discovered.push({ category, text });
    return true;
  }
  addNote(text) {
    this.playerNotes.push(text);
  }
  get clues() {
    return this.discovered;
  }
  get notes() {
    return this.playerNotes;
  }
};

// src/engine/commands/notes.ts
var NOTE_LIMIT = 200;
var notesCommands = [
  {
    name: "notes",
    usage: "notes [add <text>]",
    summary: "show the clue log and your notes. notes add <text> writes one",
    example: "notes add mirror has her pet and her hometown",
    run(s, args, out) {
      if (args[0] === "add") {
        const text = args.slice(1).join(" ").trim();
        if (!text) {
          out.print("usage: notes add <text>", "err");
          return;
        }
        if (text.length > NOTE_LIMIT) {
          out.print(`notes: keep a note under ${NOTE_LIMIT} characters.`, "err");
          return;
        }
        s.clues.addNote(text);
        out.print("Note saved.", "ok");
        return;
      }
      if (args.length > 0) {
        out.print("usage: notes [add <text>]", "err");
        return;
      }
      if (s.config.autoClues) {
        out.print("CLUE LOG (automatic)", "title");
        if (s.clues.clues.length === 0) out.print("  Nothing yet. Scan, read files and decode what you find.", "dim");
        for (const clue of s.clues.clues) out.print(`  ${CLUE_LABELS[clue.category].padEnd(8)} ${clue.text}`);
      } else {
        out.print("No automatic clue log on this tier. Keep your own with notes add <text>.", "dim");
      }
      out.print("");
      out.print("NOTES", "title");
      if (s.clues.notes.length === 0) out.print("  None yet.", "dim");
      s.clues.notes.forEach((note, i) => out.print(`  ${i + 1}. ${note}`));
    }
  }
];

// src/engine/commands/system.ts
var systemCommands = [
  {
    name: "whoami",
    usage: "whoami",
    summary: "print the account you are logged in as",
    example: "whoami",
    run(s, _args, out) {
      out.print(s.frame.user);
    }
  },
  {
    name: "hostname",
    usage: "hostname",
    summary: "print the name of the current host",
    example: "hostname",
    run(s, _args, out) {
      out.print(s.machine.hostname);
    }
  },
  {
    name: "ps",
    usage: "ps",
    summary: "list running processes on this host",
    example: "ps",
    run(s, _args, out) {
      out.print("  PID USER     COMMAND", "dim");
      for (const p of s.processes) {
        out.print(`${String(p.pid).padStart(5)} ${p.user.padEnd(8)} ${p.name}`);
      }
    }
  },
  {
    name: "kill",
    usage: "kill <pid>",
    summary: "terminate a process you own (root can kill anything)",
    example: "kill 412",
    run(s, args, out) {
      if (!args[0]) {
        out.print("usage: kill <pid>", "err");
        return;
      }
      const pid = Number(args[0]);
      const index = s.processes.findIndex((p) => p.pid === pid);
      if (!Number.isInteger(pid) || index < 0) {
        out.print(`kill: (${args[0]}) - No such process`, "err");
        return;
      }
      const proc = s.processes[index];
      if (proc.user !== s.frame.user && s.frame.user !== "root") {
        out.print(`kill: (${pid}) - Operation not permitted`, "err");
        return;
      }
      s.processes.splice(index, 1);
      out.print(`Terminated ${proc.name} (pid ${pid})`, "ok");
      if (proc.security) {
        s.lowerTrace(20);
        out.print("[sentry] monitoring gap detected. Trace multiplier lifted on this host.", "warn");
      }
    }
  },
  {
    name: "mail",
    usage: "mail [n]",
    summary: "read the inbox (mail <n> opens one message)",
    example: "mail 2",
    run(s, args, out) {
      const inbox = s.mission.inbox;
      if (args.length === 0) {
        if (inbox.length === 0) out.print("No mail.", "dim");
        inbox.forEach((m, i) => out.print(`[${i + 1}] ${m.date}  ${m.from.padEnd(8)} ${m.subject}`));
        return;
      }
      const n = Number(args[0]);
      const message = Number.isInteger(n) ? inbox[n - 1] : void 0;
      if (!message) {
        out.print(`mail: no message ${args[0]}`, "err");
        return;
      }
      out.print(`From: ${message.from}`, "dim");
      out.print(`Date: ${message.date}`, "dim");
      out.print(`Subj: ${message.subject}`, "dim");
      out.print("");
      for (const line of message.body.split("\n")) out.print(line);
    }
  },
  {
    name: "submit",
    usage: "submit <flag>",
    summary: "submit the flag you found to complete the job",
    example: "submit BREACH{example_flag}",
    run(s, args, out) {
      if (args.length === 0) {
        out.print("usage: submit <flag>", "err");
        return;
      }
      s.submitFlag(args.join(" "), out);
    }
  },
  {
    name: "hint",
    usage: "hint",
    summary: "reveal the next hint (each one costs score)",
    example: "hint",
    run(s, _args, out) {
      if (s.hintsUsed >= s.hintLimit) {
        out.print("No hints left. Trust your notes.", "warn");
        return;
      }
      s.hintsUsed++;
      out.print(`[HINT ${s.hintsUsed}/${s.hintLimit}] ${s.mission.hints[s.hintsUsed - 1]}`, "warn");
    }
  },
  {
    name: "history",
    usage: "history",
    summary: "list the commands you have typed",
    example: "history",
    run(s, _args, out) {
      s.history.forEach((cmd, i) => out.print(`${String(i + 1).padStart(4)}  ${cmd}`));
    }
  },
  {
    name: "echo",
    usage: "echo <text>",
    summary: "print text",
    example: "echo hello world",
    run(_s, args, out) {
      out.print(args.join(" "));
    }
  },
  {
    name: "clear",
    usage: "clear",
    summary: "clear the screen",
    example: "clear",
    run(_s, _args, out) {
      out.clear = true;
    }
  },
  {
    name: "sudo",
    usage: "sudo <command>",
    summary: "run a command as root, if your account is in the sudoers file",
    example: "sudo cat /etc/shadow",
    run(s, args, out) {
      s.sudoTries++;
      if (args.length === 0) {
        out.print("usage: sudo <command>", "err");
        return;
      }
      if (!s.canSudo()) {
        out.print(`[sudo] password for ${s.frame.user}: `, "dim");
        out.print(`${s.frame.user} is not in the sudoers file. This incident will be reported.`, "err");
        out.sound("denied");
        s.noise(3, out);
        return;
      }
      s.runAsRoot(args.map((a) => /\s/.test(a) ? `"${a}"` : a).join(" "), out);
    }
  }
];

// src/engine/commands/text.ts
function inputLines(s, file, stdin, out) {
  if (file) {
    const abs = s.resolve(file);
    if (!isFile(s.machine, abs)) {
      out.print(`${file}: No such file or directory`, "err");
      return null;
    }
    if (!canRead(s.machine, abs, s.frame.user)) {
      out.print(`${file}: Permission denied`, "err");
      return null;
    }
    return s.machine.files[abs].content.split("\n");
  }
  if (stdin) return stdin;
  out.print("usage: needs a file or piped input", "err");
  return null;
}
function countArg(args, fallback) {
  const rest = [];
  let n = fallback;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n") n = Math.max(0, Number(args[++i]) || 0);
    else if (/^-\d+$/.test(args[i])) n = Math.max(0, Number(args[i].slice(1)));
    else rest.push(args[i]);
  }
  return { n, rest };
}
function expandSet(set) {
  const out = [];
  for (let i = 0; i < set.length; i++) {
    if (set[i + 1] === "-" && i + 2 < set.length) {
      const from = set.charCodeAt(i);
      const to = set.charCodeAt(i + 2);
      for (let c = from; c <= to; c++) out.push(String.fromCharCode(c));
      i += 2;
    } else {
      out.push(set[i]);
    }
  }
  return out;
}
var textCommands = [
  {
    name: "head",
    usage: "head [-n N] [file]",
    summary: "print the first lines of a file or a pipe (default 10)",
    example: "cat /var/log/auth.log | head -n 5",
    run(s, args, out, stdin) {
      const { n, rest } = countArg(args, 10);
      const lines = inputLines(s, rest[0], stdin, out);
      if (lines) for (const line of lines.slice(0, n)) out.print(line);
    }
  },
  {
    name: "tail",
    usage: "tail [-n N] [file]",
    summary: "print the last lines of a file or a pipe (default 10)",
    example: "cat /var/log/auth.log | tail -n 3",
    run(s, args, out, stdin) {
      const { n, rest } = countArg(args, 10);
      const lines = inputLines(s, rest[0], stdin, out);
      if (!lines) return;
      const trimmed = lines.length && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
      for (const line of trimmed.slice(Math.max(0, trimmed.length - n))) out.print(line);
    }
  },
  {
    name: "wc",
    usage: "wc [-l] [-w] [-c] [file]",
    summary: "count lines, words and characters in a file or a pipe",
    example: "cat /etc/passwd | wc -l",
    run(s, args, out, stdin) {
      const flags = args.filter((a) => a.startsWith("-")).join("");
      const file = args.find((a) => !a.startsWith("-"));
      const lines = inputLines(s, file, stdin, out);
      if (!lines) return;
      const text = lines.join("\n");
      const counts = {
        l: lines.length - (text.endsWith("\n") ? 1 : 0),
        w: text.split(/\s+/).filter(Boolean).length,
        c: text.length
      };
      const picked = ["l", "w", "c"].filter((k) => flags.includes(k));
      const shown = picked.length ? picked.map((k) => counts[k]) : [counts.l, counts.w, counts.c];
      out.print(`${shown.join(" ")}${file ? ` ${file}` : ""}`);
    }
  },
  {
    name: "tr",
    usage: "tr <from> <to>",
    summary: "translate characters in a pipe. ranges like A-Z are allowed",
    example: "echo Uryyb | tr 'A-Za-z' 'N-ZA-Mn-za-m'",
    run(_s, args, out, stdin) {
      if (args.length < 2) {
        out.print("usage: tr <from> <to>   (e.g. tr 'A-Za-z' 'N-ZA-Mn-za-m')", "err");
        return;
      }
      if (!stdin) {
        out.print("tr: needs piped input", "err");
        return;
      }
      const from = expandSet(args[0]);
      const to = expandSet(args[1]);
      for (const line of stdin) {
        out.print(
          [...line].map((ch) => {
            const idx = from.indexOf(ch);
            if (idx < 0) return ch;
            return to[Math.min(idx, to.length - 1)] ?? ch;
          }).join("")
        );
      }
    }
  }
];

// src/engine/commands/index.ts
var helpCommand = {
  name: "help",
  usage: "help [command]",
  summary: "list commands, or show one command with an example",
  example: "help grep",
  run(s, args, out) {
    if (args.length > 0) {
      showCommand(args[0], out, "help");
      return;
    }
    out.print("BREACH shell. Tab completes (twice lists), up/down recalls history, Ctrl+L clears.", "sys");
    out.print("");
    for (const c of ALL) out.print(`  ${c.usage.padEnd(30)} ${c.summary}`);
    out.print("");
    out.print("Password prompts do not echo.", "dim");
    if (s.config.recoveryHints !== "none") {
      out.print("At a Password prompt, type ? to start account recovery (security questions), if the host offers it.", "dim");
      out.print("Recovery answers are checked exactly as you type them, ignoring case.", "dim");
    }
  }
};
var manCommand = {
  name: "man",
  usage: "man <command>",
  summary: "show the manual page for a command",
  example: "man nmap",
  run(_s, args, out) {
    if (args.length === 0) {
      out.print("What manual page do you want? usage: man <command>", "err");
      return;
    }
    showCommand(args[0], out, "man");
  }
};
function showCommand(name, out, style) {
  const spec = COMMANDS.get(name);
  if (!spec) {
    out.print(style === "man" ? `No manual entry for ${name}` : `help: no command '${name}'`, "err");
    const near = closest(name, COMMAND_LIST);
    if (near.length) out.print(`Did you mean: ${near.join(", ")}?`, "dim");
    return;
  }
  const alias = spec.name !== name ? ` (alias of ${spec.name})` : "";
  if (style === "man") {
    out.print("NAME", "title");
    out.print(`  ${spec.name} - ${spec.summary}${alias}`);
    out.print("SYNOPSIS", "title");
    out.print(`  ${spec.usage}`);
    out.print("EXAMPLE", "title");
    out.print(`  ${spec.example}`);
    return;
  }
  out.print(`${spec.usage}${alias}`, "title");
  out.print(`  ${spec.summary}`);
  out.print(`  e.g. ${spec.example}`, "dim");
}
var ALL = [
  helpCommand,
  manCommand,
  ...fileCommands,
  ...textCommands,
  ...networkCommands,
  ...cryptoCommands,
  ...systemCommands,
  ...notesCommands
];
var COMMANDS = new Map(ALL.flatMap((c) => [c.name, ...c.aliases ?? []].map((n) => [n, c])));
var COMMAND_LIST = [...COMMANDS.keys()];

// src/engine/sql.ts
var SqlError = class extends Error {
};
var KEYWORDS = /* @__PURE__ */ new Set(["SELECT", "FROM", "WHERE", "AND", "OR"]);
function syntaxError(sql, pos) {
  const near = sql.slice(pos).split("\n")[0];
  return new SqlError(`You have an error in your SQL syntax; check the manual for the right syntax near '${near}' at line 1`);
}
function tokenize(sql) {
  const toks = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "#" || c === "-" && sql[i + 1] === "-") break;
    if (c === "'") {
      let j = i + 1;
      let value = "";
      for (; ; ) {
        if (j >= sql.length) throw syntaxError(sql, i);
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            value += "'";
            j += 2;
            continue;
          }
          break;
        }
        value += sql[j];
        j++;
      }
      toks.push({ type: "str", value, pos: i });
      i = j + 1;
      continue;
    }
    if (c === "(") {
      toks.push({ type: "lp", value: c, pos: i++ });
      continue;
    }
    if (c === ")") {
      toks.push({ type: "rp", value: c, pos: i++ });
      continue;
    }
    if (c === "=" || c === "," || c === "*" || c === ";") {
      toks.push({ type: "op", value: c, pos: i++ });
      continue;
    }
    if (/\d/.test(c)) {
      let j = i;
      while (j < sql.length && /\d/.test(sql[j])) j++;
      toks.push({ type: "num", value: sql.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
      const word = sql.slice(i, j);
      const upper = word.toUpperCase();
      toks.push(KEYWORDS.has(upper) ? { type: "kw", value: upper, pos: i } : { type: "id", value: word.toLowerCase(), pos: i });
      i = j;
      continue;
    }
    throw syntaxError(sql, i);
  }
  return toks;
}
var WhereParser = class {
  constructor(toks, sql, row) {
    this.toks = toks;
    this.sql = sql;
    this.row = row;
    this.i = 0;
  }
  parse() {
    const result = this.or();
    if (this.i < this.toks.length) throw syntaxError(this.sql, this.toks[this.i].pos);
    return result;
  }
  peek() {
    return this.toks[this.i];
  }
  isKw(word) {
    const t = this.peek();
    return t?.type === "kw" && t.value === word;
  }
  or() {
    let value = this.and();
    while (this.isKw("OR")) {
      this.i++;
      const right = this.and();
      value = value || right;
    }
    return value;
  }
  and() {
    let value = this.cmp();
    while (this.isKw("AND")) {
      this.i++;
      const right = this.cmp();
      value = value && right;
    }
    return value;
  }
  cmp() {
    const t = this.peek();
    if (t?.type === "lp") {
      this.i++;
      const inner = this.or();
      const close = this.peek();
      if (close?.type !== "rp") throw syntaxError(this.sql, close?.pos ?? this.sql.length);
      this.i++;
      return inner;
    }
    const left = this.value();
    const op = this.peek();
    if (op?.type !== "op" || op.value !== "=") throw syntaxError(this.sql, op?.pos ?? this.sql.length);
    this.i++;
    const right = this.value();
    return left === right;
  }
  value() {
    const t = this.peek();
    if (!t) throw syntaxError(this.sql, this.sql.length);
    this.i++;
    if (t.type === "str" || t.type === "num") return t.value;
    if (t.type === "id") {
      if (!(t.value in this.row)) throw new SqlError(`Unknown column '${t.value}' in 'where clause'`);
      return this.row[t.value];
    }
    throw syntaxError(this.sql, t.pos);
  }
};
function runLoginQuery(template, username, password, rows) {
  const query = template.split("{username}").join(username).split("{password}").join(password);
  try {
    const toks = tokenize(query);
    const whereAt = toks.findIndex((t) => t.type === "kw" && t.value === "WHERE");
    if (whereAt < 0) throw syntaxError(query, 0);
    const body = toks.slice(whereAt + 1);
    const hit = rows.map((r, i) => ({ id: String(i + 1), ...r })).find((row) => new WhereParser(body, query, row).parse());
    return hit ? { ok: true, user: hit.username, query } : { ok: false, query };
  } catch (err) {
    if (err instanceof SqlError) return { ok: false, query, error: err.message };
    throw err;
  }
}

// src/engine/session.ts
var Out = class {
  constructor() {
    this.lines = [];
    this.sounds = [];
    this.clear = false;
    this.quit = false;
  }
  print(text, kind = "out") {
    this.lines.push({ text, kind });
  }
  /** One line made of coloured pieces, such as an ls listing. */
  printSegments(parts) {
    this.lines.push({ text: parts.map((p) => p.text).join(""), kind: "out", segments: parts });
  }
  sound(event) {
    this.sounds.push(event);
  }
};
var TRACE_LIMIT = 100;
var TRACE_WARNINGS = [70, 75, 85];
var SECURITY_MULTIPLIER = 1.5;
var QUIET_FOR_CLUES = /* @__PURE__ */ new Set(["help", "hint", "notes"]);
var GameSession = class {
  constructor(baseMission, options = {}) {
    this.failReason = null;
    this.runtime = {};
    this.trace = 0;
    this.hintsUsed = 0;
    this.history = [];
    this.status = "playing";
    this.pending = null;
    this.endingId = null;
    this.failedLogins = 0;
    /** Facts the achievements read at the end of an attempt. */
    this.reads = /* @__PURE__ */ new Set();
    this.sudoTries = 0;
    this.usedAliases = false;
    this.usedPipe = false;
    /** Discoveries and player notes for this attempt. */
    this.clues = new ClueLog();
    this.warningsGiven = 0;
    this.endedAt = null;
    this.tier = options.tier ?? "medium";
    this.config = DIFFICULTY[this.tier];
    this.baseMission = baseMission;
    const mission9 = applyTier(baseMission, this.tier);
    this.mission = mission9;
    this.secrets = this.config.autoClues ? buildSecrets(mission9) : [];
    this.now = options.now ?? (() => Date.now());
    this.startedAt = this.now();
    for (const def of mission9.machines) {
      this.runtime[def.id] = { def, processes: (def.processes ?? []).map((p) => ({ ...p })), compromised: false };
    }
    const start = this.runtime[mission9.start.machine].def;
    this.stack = [{ machineId: start.id, user: start.defaultUser, cwd: mission9.start.cwd }];
  }
  // ---- read-only views -------------------------------------------------------------------------
  get frame() {
    return this.stack[this.stack.length - 1];
  }
  get machine() {
    return this.runtime[this.frame.machineId].def;
  }
  get processes() {
    return this.runtime[this.frame.machineId].processes;
  }
  get hintLimit() {
    return this.config.hintLimit;
  }
  /** Seconds left on a timed tier, or null when there is no clock. */
  timeRemaining() {
    if (this.config.timeLimitSeconds === null) return null;
    return Math.max(0, this.config.timeLimitSeconds - this.elapsedSeconds());
  }
  get finished() {
    return this.status === "won" || this.status === "failed";
  }
  home() {
    return this.machine.users.find((u) => u.name === this.frame.user)?.home ?? "/";
  }
  resolve(path) {
    return normalizePath(path, this.frame.cwd, this.home());
  }
  findByIp(ip) {
    return Object.values(this.runtime).map((r) => r.def).find((d) => d.ip === ip);
  }
  elapsedSeconds() {
    return Math.max(0, Math.floor(((this.endedAt ?? this.now()) - this.startedAt) / 1e3));
  }
  intro() {
    return [
      { text: `${this.machine.hostname} :: session open as ${this.frame.user}`, kind: "sys" },
      { text: "Type 'help' for commands. Every noisy action raises your trace.", kind: "dim" }
    ];
  }
  inputMode() {
    if (this.finished) return "over";
    const p = this.pending;
    if (!p) return "shell";
    if (p.kind === "password" || p.kind === "form-pass") return "password";
    if (p.kind === "choice") return "choice";
    return "text";
  }
  /** The shell prompt in parts, so the UI can colour them the way Kali does. */
  promptParts() {
    const home = this.home();
    const cwd = this.frame.cwd;
    const path = cwd === home ? "~" : cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
    const root = this.frame.user === "root";
    return { user: this.frame.user, host: this.machine.hostname, path, symbol: root ? "#" : "$", root };
  }
  prompt() {
    const p = this.pending;
    if (p) {
      switch (p.kind) {
        case "password":
          return "Password: ";
        case "form-pass":
          return "password: ";
        case "form-user":
          return "username: ";
        case "recovery": {
          const question = this.machine.recovery?.[p.user]?.[p.index]?.question ?? "";
          return `Q${p.index + 1}. ${question} `;
        }
        case "choice":
          return `choose [1-${this.mission.endings?.length ?? 0}]: `;
      }
    }
    const parts = this.promptParts();
    return `${parts.user}@${parts.host}:${parts.path}${parts.symbol} `;
  }
  // ---- input -----------------------------------------------------------------------------------
  /** Feed one line of player input. Returns what to print and which sounds to play. */
  input(raw) {
    const out = new Out();
    this.expireIfLate();
    const mode = this.inputMode();
    if (mode === "over") {
      out.print("Session closed.", "dim");
      return out;
    }
    if (mode === "password") out.print(`${this.prompt()}${"*".repeat(raw.length)}`, "echo");
    else out.print(`${this.prompt()}${mode === "shell" ? raw.trim() : raw}`, "echo");
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
  dispatch(line, out) {
    const segments = splitPipeline(line);
    if (segments.some((seg) => seg === "")) {
      out.print("bash: syntax error near unexpected token `|'", "err");
      return;
    }
    if (segments.length > 1) this.usedPipe = true;
    let stdin = null;
    for (let i = 0; i < segments.length; i++) {
      const [name, ...args] = splitCommand(segments[i]);
      const command = COMMANDS.get(name);
      if (!command) {
        out.print(`bash: ${name}: command not found`, "err");
        const near = closest(name, COMMAND_LIST);
        if (near.length) out.print(`Did you mean: ${near.join(", ")}?`, "dim");
        return;
      }
      if (command.name !== name) this.usedAliases = true;
      if (i === segments.length - 1) {
        command.run(this, args, out, stdin);
        return;
      }
      const sub = new Out();
      command.run(this, args, sub, stdin);
      out.sounds.push(...sub.sounds);
      stdin = [];
      for (const piece of sub.lines) {
        if (piece.kind === "err" || piece.kind === "warn") out.lines.push(piece);
        else stdin.push(piece.text);
      }
      if (sub.lines.some((piece) => piece.kind === "err")) return;
    }
  }
  /** Runs one line with root rights, for sudo. The real account comes back afterwards. */
  runAsRoot(line, out) {
    const frame = this.frame;
    const user = frame.user;
    frame.user = "root";
    try {
      this.dispatch(line, out);
    } finally {
      frame.user = user;
    }
  }
  /** The account this session is logged in as can use sudo. */
  canSudo() {
    return Boolean(this.machine.users.find((u) => u.name === this.frame.user)?.sudo);
  }
  /** Ctrl+C at a password or question prompt: drops the question. Returns true when one was open. */
  cancelPending(out) {
    if (!this.pending) return false;
    this.pending = null;
    out.print("^C", "dim");
    return true;
  }
  /** Records a discovery in the clue log. Does nothing on tiers without an automatic log. */
  discover(category, text) {
    if (this.config.autoClues) this.clues.record(category, text);
  }
  /** Looks for known secrets in command output and logs the ones that appear as whole words. */
  scanForClues(lines) {
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
  suggestPath(input) {
    const target = this.resolve(input);
    let cur = "/";
    let changed = false;
    for (const seg of target.split("/").filter(Boolean)) {
      const exact = cur === "/" ? `/${seg}` : `${cur}/${seg}`;
      if (isFile(this.machine, exact) || isDir(this.machine, exact)) {
        cur = exact;
        continue;
      }
      if (!isDir(this.machine, cur) || !canRead(this.machine, cur, this.frame.user)) return null;
      const readable = listDir(this.machine, cur).map((e) => e.name).filter((name) => canRead(this.machine, cur === "/" ? `/${name}` : `${cur}/${name}`, this.frame.user));
      const [match] = closest(seg, readable, 1);
      if (!match) return null;
      cur = cur === "/" ? `/${match}` : `${cur}/${match}`;
      changed = true;
    }
    return changed ? cur : null;
  }
  handlePending(raw, out) {
    const p = this.pending;
    if (!p) return;
    switch (p.kind) {
      case "password": {
        this.pending = null;
        if (raw === "?" && this.machine.recovery?.[p.user]) {
          this.pending = { kind: "recovery", user: p.user, index: 0, answers: [] };
          out.print("Account recovery started. Answer your security questions.", "warn");
          return;
        }
        const account = this.machine.users.find((u) => u.name === p.user);
        if (account && account.password === raw) this.grant(p.user, out);
        else this.loginFailed(out);
        return;
      }
      case "recovery": {
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
      case "form-user":
        this.pending = { kind: "form-pass", username: raw };
        return;
      case "form-pass":
        this.pending = null;
        this.submitForm(p.username, raw, out);
        return;
      case "choice":
        this.choose(raw, out);
        return;
    }
  }
  // ---- actions used by commands ----------------------------------------------------------------
  /** Adds trace for a noisy action. Security processes on the current host multiply it. */
  noise(base, out) {
    if (this.finished) return;
    const alarmed = this.processes.some((p) => p.security);
    const amount = Math.round(base * this.config.traceMultiplier * (alarmed ? SECURITY_MULTIPLIER : 1));
    this.trace = Math.min(TRACE_LIMIT, this.trace + amount);
    const messages = [
      "the network is watching you. Slow down or get out.",
      "alarm raised. Security has your address.",
      "one more mistake and you are burned."
    ];
    const sounds = ["trace", "alarm", "alert"];
    TRACE_WARNINGS.forEach((level, i) => {
      if (this.warningsGiven > i || this.trace < level) return;
      this.warningsGiven = i + 1;
      out.print(`!! TRACE ${level}%: ${messages[i]}`, "warn");
      out.sound(sounds[i]);
    });
    if (this.trace >= TRACE_LIMIT) {
      this.status = "failed";
      this.failReason = "trace";
      this.pending = null;
      this.endedAt = this.now();
      out.print("TRACE 100%. Connection severed. Mission failed.", "err");
      out.sound("fail");
    }
  }
  /** Ends the attempt when the clock runs out. Returns true if this call ended it. */
  expireIfLate() {
    if (this.status !== "playing") return false;
    if (this.timeRemaining() !== 0) return false;
    this.status = "failed";
    this.failReason = "time";
    this.pending = null;
    this.endedAt = this.now();
    return true;
  }
  lowerTrace(amount) {
    this.trace = Math.max(0, this.trace - amount);
  }
  /** Opens a session on another machine. The new frame starts as that machine's default user. */
  pushFrame(machineId) {
    const def = this.runtime[machineId].def;
    const home = def.users.find((u) => u.name === def.defaultUser)?.home ?? "/";
    this.stack.push({ machineId, user: def.defaultUser, cwd: home });
  }
  popFrame() {
    if (this.stack.length > 1) this.stack.pop();
  }
  /** Password prompt for `login <user> [password]`. */
  attemptLogin(user, password, out) {
    const account = this.machine.users.find((u) => u.name === user);
    if (account && account.password === password) this.grant(user, out);
    else this.loginFailed(out);
  }
  requestPassword(user) {
    this.pending = { kind: "password", user };
  }
  openForm(out) {
    const form = this.machine.webForm;
    if (!form) return;
    out.print(`=== ${form.title} ===`, "title");
    out.print("Credentials are sent to the server exactly as typed.", "dim");
    this.pending = { kind: "form-user" };
  }
  submitFlag(text, out) {
    if (this.status !== "playing") return;
    if (text.trim() !== this.mission.flag) {
      out.print("Access denied: that is not the flag.", "err");
      out.sound("denied");
      return;
    }
    if (this.mission.endings?.length) {
      this.status = "choosing";
      this.pending = { kind: "choice" };
      out.print("FLAG ACCEPTED. The client is waiting for your call.", "ok");
      out.print("What do you do with the packet?", "warn");
      this.mission.endings.forEach((e, i) => out.print(`  ${i + 1}) ${e.label}`));
      out.sound("granted");
      return;
    }
    this.win(out);
  }
  // ---- internals -------------------------------------------------------------------------------
  grant(user, out) {
    const account = this.machine.users.find((u) => u.name === user);
    this.frame.user = user;
    this.frame.cwd = account?.home ?? "/";
    this.runtime[this.frame.machineId].compromised = true;
    out.print(`Access granted. Logged in as ${user}.`, "ok");
    out.sound("granted");
    this.noise(4, out);
  }
  loginFailed(out) {
    this.failedLogins++;
    out.print("Login incorrect.", "err");
    out.sound("denied");
    this.noise(15, out);
  }
  submitForm(username, password, out) {
    const form = this.machine.webForm;
    if (!form) return;
    const result = runLoginQuery(form.query, username, password, form.rows);
    if (!result.ok && result.error) {
      out.print(`SQL error: ${result.error}`, "err");
      out.sound("alert");
      this.noise(5, out);
      return;
    }
    if (!result.ok) {
      this.failedLogins++;
      out.print("Invalid credentials.", "err");
      out.sound("denied");
      this.noise(15, out);
      return;
    }
    out.print(`Welcome, ${result.user}.`, "ok");
    out.sound("granted");
    for (const line of form.success) out.print(line, "ok");
    this.noise(4, out);
  }
  choose(raw, out) {
    const endings = this.mission.endings ?? [];
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n < 1 || n > endings.length) {
      out.print(`Choose 1-${endings.length}.`, "warn");
      return;
    }
    const ending = endings[n - 1];
    this.endingId = ending.id;
    this.pending = null;
    this.win(out, ending.text);
  }
  win(out, extra = []) {
    this.status = "won";
    this.endedAt = this.now();
    if (!this.mission.endings?.length) out.print("FLAG ACCEPTED. Payment queued. Mission complete.", "ok");
    for (const line of extra) out.print(line);
    out.sound("win");
  }
  // ---- tab completion --------------------------------------------------------------------------
  complete(line) {
    const pipeAt = line.lastIndexOf("|");
    if (pipeAt >= 0) {
      const inner = this.complete(line.slice(pipeAt + 1).replace(/^\s+/, ""));
      return { value: `${line.slice(0, pipeAt + 1)} ${inner.value}`, options: inner.options };
    }
    const endsWithSpace = /\s$/.test(line);
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length <= 1 && !endsWithSpace) {
      const partial2 = parts[0] ?? "";
      const options2 = COMMAND_LIST.filter((c) => c.startsWith(partial2));
      return finishCompletion("", partial2, options2);
    }
    const cmd = COMMANDS.get(parts[0])?.name ?? parts[0];
    const partial = endsWithSpace ? "" : parts[parts.length - 1];
    const base = line.slice(0, line.length - partial.length);
    let options = [];
    switch (cmd) {
      case "cd":
      case "ls":
      case "cat":
      case "grep":
      case "head":
      case "tail":
      case "wc":
      case "find":
        options = this.pathCandidates(partial);
        break;
      case "ssh":
      case "nmap":
      case "ping": {
        const at = partial.lastIndexOf("@");
        const prefix = at >= 0 ? partial.slice(0, at + 1) : "";
        const ipPart = partial.slice(at + 1);
        options = this.machine.neighbors.filter((ip) => ip.startsWith(ipPart)).map((ip) => `${prefix}${ip}`);
        break;
      }
      case "su":
        options = this.machine.users.map((u) => u.name).filter((n) => n.startsWith(partial));
        break;
      case "decode":
      case "base64":
        if (parts.length <= 2) options = ["base64", "rot13", "hex"].filter((e) => e.startsWith(partial));
        break;
      case "kill":
        options = this.processes.map((p) => String(p.pid)).filter((pid) => pid.startsWith(partial));
        break;
      case "help":
      case "man":
        options = COMMAND_LIST.filter((c) => c.startsWith(partial));
        break;
      default:
        break;
    }
    return finishCompletion(base, partial, options);
  }
  pathCandidates(partial) {
    const slash = partial.lastIndexOf("/");
    const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : "";
    const namePart = partial.slice(slash + 1);
    const abs = this.resolve(dirPart || ".");
    if (!isDir(this.machine, abs) || !canRead(this.machine, abs, this.frame.user)) return [];
    return listDir(this.machine, abs).filter((e) => e.name.startsWith(namePart) && (namePart.startsWith(".") || !e.name.startsWith("."))).map((e) => `${dirPart}${e.name}${e.type === "dir" ? "/" : ""}`);
  }
};
function splitPipeline(line) {
  const parts = [];
  let current = "";
  let quote = null;
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
    if (ch === "|") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}
function splitCommand(line) {
  const words = [];
  let current = "";
  let quote = null;
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
      current = "";
      hasWord = false;
      continue;
    }
    current += ch;
    hasWord = true;
  }
  if (current || hasWord) words.push(current);
  return words;
}
function normalize(answer) {
  return answer.trim().toLowerCase();
}
function commonPrefix(items) {
  if (items.length === 0) return "";
  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}
function finishCompletion(base, partial, options) {
  if (options.length === 0) return { value: base + partial, options: [] };
  if (options.length === 1) {
    const only = options[0];
    return { value: base + only + (only.endsWith("/") ? "" : " "), options };
  }
  const shared = commonPrefix(options);
  return { value: base + (shared.length > partial.length ? shared : partial), options };
}

// src/engine/replay.ts
var CANCEL_MARK = "";
var RUN_LIMITS = {
  maxCommands: 2e3,
  maxCommandLength: 300,
  /** Two commands cannot land closer together than this. Faster than a person can type or paste one by one. */
  minGapMs: 120,
  /** Averaged over the whole run. Typing and reading a walkthrough takes longer than a script needs. */
  minAverageMs: 500
};
var fail = (reason) => ({ ok: false, reason });
function validateRun(run, missions) {
  const mission9 = missions.find((m) => m.id === run.missionId);
  if (!mission9) return fail("unknown mission");
  if (!TIERS.includes(run.tier)) return fail("unknown tier");
  if (!Array.isArray(run.commands) || run.commands.length === 0) return fail("empty run");
  if (run.commands.length > RUN_LIMITS.maxCommands) return fail("too many commands");
  let prev = -1;
  for (const c of run.commands) {
    if (typeof c !== "object" || c === null) return fail("malformed command");
    if (!Number.isInteger(c.t) || c.t < 0) return fail("bad timestamp");
    if (typeof c.cmd !== "string" || c.cmd.length > RUN_LIMITS.maxCommandLength) return fail("bad command text");
    if (c.t < prev) return fail("timestamps go backwards");
    if (prev >= 0 && c.t - prev < RUN_LIMITS.minGapMs) return fail("impossible timing: commands too close together");
    prev = c.t;
  }
  if (prev < run.commands.length * RUN_LIMITS.minAverageMs) return fail("impossible timing: the run is too fast overall");
  let clock = 0;
  const session = new GameSession(mission9, { tier: run.tier, now: () => clock });
  for (const c of run.commands) {
    if (session.finished) return fail("commands after the attempt ended");
    clock = c.t;
    if (c.cmd === CANCEL_MARK) session.cancelPending(new Out());
    else session.input(c.cmd);
  }
  if (session.status === "failed") return fail(session.failReason === "time" ? "the clock ran out" : "trace reached 100%");
  if (session.status !== "won") return fail("incomplete run: the flag was never accepted");
  const seconds = session.elapsedSeconds();
  const score = scoreMission(seconds, session.trace, session.hintsUsed);
  if (run.claimedScore !== void 0 && run.claimedScore !== score) return fail("claimed score does not match the replay");
  return {
    ok: true,
    score,
    points: pointsFor(score, run.tier),
    seconds,
    trace: session.trace,
    hints: session.hintsUsed,
    endingId: session.endingId,
    usedAliases: session.usedAliases,
    usedPipe: session.usedPipe
  };
}

// src/missions/shared.ts
var BUG_REPORT_CONTACT = "breachgame.contact@gmail.com";
var EASTER_EGG_PATH = "/home/ghost/.leaderboard-bug";
function makeRig(neighbors, files = {}) {
  return {
    id: "rig",
    hostname: "ghost-rig",
    ip: "10.66.0.1",
    neighbors,
    defaultUser: "ghost",
    users: [{ name: "ghost", password: "local-only", home: "/home/ghost" }],
    ports: [],
    files: {
      [EASTER_EGG_PATH]: {
        owner: "ghost",
        private: true,
        content: `Found a way to break the leaderboard? Report it, do not exploit it.
Contact: ${BUG_REPORT_CONTACT}
Serious reports get a name on the wall of thanks.`
      },
      ...files
    },
    dirs: { "/home/ghost": { owner: "ghost", private: true } }
  };
}

// src/missions/m01-dead-drop.ts
var FENWICK_IP = "10.13.37.20";
var mission = {
  id: "m01-dead-drop",
  number: 1,
  codename: "DEAD DROP",
  title: "Fenwick Accounts: first contact",
  client: "QUILL",
  briefing: [
    "The exchange board has one new posting. No company name. No pay scale. Just a handle and a deadline.",
    'QUILL: "Fenwick Accounts runs its shared drive on a box nobody updates. I need to see inside. Get me the admin login and the flag that proves you were there."',
    { text: "You accept. Your trace counter is already watching.", glitch: true }
  ],
  debrief: [
    "The flag hits the drop within the second. QUILL pays before you disconnect.",
    "Fenwick never noticed. That is the job: the best breaches leave the furniture where it was.",
    "The next posting has a company name this time."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([FENWICK_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Fenwick Accounts (${FENWICK_IP})
Goal: get into the NAS, find the flag, submit it.
Tools on this rig: scan, connect, ls, cd, cat, login, submit.
Type "help" to see everything.`
      }
    }),
    {
      id: "fenwick",
      hostname: "fenwick-nas",
      ip: FENWICK_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "admin", password: "bluebird77", home: "/home/admin" }
      ],
      ports: [
        { port: 21, service: "ftp", banner: "vsftpd 3.0.2" },
        { port: 22, service: "ssh", banner: "OpenSSH 6.6 (old)" },
        { port: 445, service: "smb", banner: "Samba 4.1.17" }
      ],
      files: {
        "/srv/share/Public/readme.txt": {
          content: "Fenwick Accounts shared drive.\nThe Public folder is for invoices only.\nNo passwords in here, please."
        },
        "/srv/share/Public/invoices-2019.csv": {
          content: "invoice,client,amount\n1001,Harbor Co,4200\n1002,Lantern LLC,880\n1003,Corvid Logistics,15300"
        },
        "/srv/share/Public/sticky.txt": {
          content: "NAS admin login (for the audit, DO NOT SHARE):\n  user: admin\n  pass: bluebird77\n\n-- delete this after the audit, Greg"
        },
        "/home/guest/welcome.txt": { content: "Welcome to the Fenwick NAS." },
        "/home/admin/payroll.csv": {
          owner: "admin",
          private: true,
          content: "name,salary\nG. Fenwick,184000"
        },
        "/home/admin/flag.txt": {
          owner: "admin",
          private: true,
          content: "BREACH{sticky_notes_are_forever}"
        }
      },
      dirs: { "/home/admin": { owner: "admin", private: true } }
    }
  ],
  hashes: [],
  inbox: [
    {
      from: "QUILL",
      date: "Mon 09:02",
      subject: "Welcome aboard",
      body: `Fenwick Accounts is a small firm with a big NAS. It lives at ${FENWICK_IP}.
Get the admin login, get the flag. I will know it when I see it.`
    }
  ],
  flag: "BREACH{sticky_notes_are_forever}",
  hints: [
    "Shared drives are full of notes people forget to delete. Start by looking around the public share.",
    "Find the folder that anyone can read, list it, and open the note that sounds like a reminder.",
    `connect ${FENWICK_IP}, cd /srv/share/Public, cat sticky.txt, then login admin with the password you find. The flag is in admin's home.`
  ],
  tierOverrides: {
    hard: {
      machines: {
        fenwick: {
          files: {
            "/srv/share/Public/old-sticky.txt": { content: "rotated 2019 login (superseded):\n  user: admin\n  pass: summer2019" },
            "/srv/share/Public/payroll-q3.csv": { content: "quarter,total\nQ3,412000" },
            "/home/guest/.notes": { content: "todo: stop leaving passwords in Public" }
          },
          users: [{ name: "intern", password: "Spring!2019", home: "/home/intern" }]
        }
      },
      inbox: [
        { from: "GREG", date: "Mon 11:40", subject: "Audit closed", body: "Audit closed. Yes, the sticky notes are still up. Fixing it next sprint." }
      ]
    }
  },
  kaliSolution: [
    "nmap",
    `ssh ${FENWICK_IP}`,
    "ls",
    "cd /srv/share/Public",
    "cat sticky.txt",
    "su admin",
    "bluebird77",
    "cat /home/admin/flag.txt",
    "submit BREACH{sticky_notes_are_forever}"
  ],
  solution: [
    "scan",
    `connect ${FENWICK_IP}`,
    "ls",
    "cd /srv/share/Public",
    "cat sticky.txt",
    "login admin",
    "bluebird77",
    "cat /home/admin/flag.txt",
    "submit BREACH{sticky_notes_are_forever}"
  ]
};
var m01_dead_drop_default = mission;

// src/missions/m02-soft-target.ts
var CORVID_IP = "10.13.37.44";
var DANA_HASH = "d8578edf8458ce06fbc5bb76a58c5ca4";
var OPS_HASH = "7c6a180b36896a0a8c02787eeafb0e4c";
var ROOT_HASH = "$6$mailsalt$Ab3KqP8xTz9LmN2vR7wY5uI0oE1sD4fG6hJ8kL0pQ2zXc";
var DANA_PASSWORD = "monkey";
var mission2 = {
  id: "m02-soft-target",
  number: 2,
  codename: "SOFT TARGET",
  title: "Corvid Logistics: mail server",
  client: "QUILL",
  briefing: [
    "Corvid Logistics runs a mail server with a user database nobody has rotated since the last election.",
    `QUILL: "I need Dana Reyes's inbox. Do not touch the other accounts. They are not paying us."`,
    { text: "Somewhere behind the login prompt, a password is waiting to be guessed.", glitch: true }
  ],
  debrief: [
    "Dana's inbox is full of invoices and one unanswered email asking about a server migration.",
    "Weak passwords are not a technology problem. They are a people problem wearing a technology costume.",
    "Note the ops account. Its hash was long, random and out of reach. That is the kind you want."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([CORVID_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Corvid Logistics mail (${CORVID_IP})
Goal: Dana Reyes's account. Flag is in her home directory.
Tip from the last job: read the config files before you guess.`
      }
    }),
    {
      id: "corvid",
      hostname: "corvid-mail",
      ip: CORVID_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "dana", password: DANA_PASSWORD, home: "/home/dana" },
        { name: "ops", password: "Vx!9qLm#Tz4w", home: "/home/ops" },
        { name: "root", password: "Qz8!vL2#mR9xKt", home: "/root" }
      ],
      ports: [
        { port: 25, service: "smtp", banner: "Postfix 3.4.13" },
        { port: 80, service: "http", banner: "nginx 1.14.0" },
        { port: 143, service: "imap", banner: "Dovecot 2.3.4" }
      ],
      processes: [
        { pid: 88, user: "root", name: "postfix/master" },
        { pid: 203, user: "ops", name: "imapd" }
      ],
      files: {
        "/opt/mailer/config/users.db": {
          content: `# mailer user database (exported 2024-02-11)
# format: user:hash:algo
dana:${DANA_HASH}:md5
ops:${OPS_HASH}:md5
root:${ROOT_HASH}:sha512crypt
`
        },
        "/opt/mailer/config/smtp.conf": { content: "relay_host = mx.corvid.example\nauth = required\n" },
        "/etc/passwd": {
          content: "root:x:0:0:root:/root:/bin/sh\nguest:x:1000:1000::/home/guest:/bin/sh\ndana:x:1001:1001::/home/dana:/bin/sh\nops:x:1002:1002::/home/ops:/bin/sh\n"
        },
        "/etc/shadow": {
          owner: "root",
          private: true,
          content: `root:${ROOT_HASH}:19000:0:99999:7:::
`
        },
        "/home/guest/readme.txt": { content: "Corvid mail: guest accounts are disabled for IMAP." },
        "/home/dana/notes.txt": {
          owner: "dana",
          private: true,
          content: "TODO: move mail to the new server. Ask ops for the certificate."
        },
        "/home/dana/flag.txt": {
          owner: "dana",
          private: true,
          content: "BREACH{weak_hash_weak_day}"
        }
      },
      dirs: {
        "/home/dana": { owner: "dana", private: true },
        "/root": { owner: "root", private: true }
      }
    }
  ],
  hashes: [
    { hash: DANA_HASH, plaintext: DANA_PASSWORD, algo: "md5" },
    { hash: OPS_HASH, plaintext: "Vx!9qLm#Tz4w", algo: "md5" },
    { hash: ROOT_HASH, plaintext: "Qz8!vL2#mR9xKt", algo: "sha512crypt" }
  ],
  inbox: [
    {
      from: "QUILL",
      date: "Tue 18:40",
      subject: "Dana Reyes",
      body: `Dana runs the Corvid mail box at ${CORVID_IP}. She uses the mailer app for her own account.
Find the account, find her password, find the flag in her home.`
    }
  ],
  flag: "BREACH{weak_hash_weak_day}",
  hints: [
    "Logins need a password, and passwords leave traces. Look for the mail app's own data under /opt before you touch anything else.",
    "crack only breaks weak hashes: ones made from common words. Long, random hashes are not worth your trace.",
    `cat /opt/mailer/config/users.db, crack ${DANA_HASH}, login dana with the result, then cat /home/dana/flag.txt.`
  ],
  tierOverrides: {
    hard: {
      machines: {
        corvid: {
          files: {
            "/opt/mailer/config/users.db.bak": { content: "# old export (2022)\nintern:0f4d5c3e9b8a7f6e5d4c3b2a1f0e9d8c:md5\n" },
            "/home/dana/.bash_history": { owner: "dana", private: true, content: "mutt\nls ~/mail\nexit" }
          }
        }
      }
    }
  },
  kaliSolution: [
    "nmap",
    `ssh ${CORVID_IP}`,
    "cat /opt/mailer/config/users.db",
    `john ${DANA_HASH}`,
    "su dana",
    DANA_PASSWORD,
    "cat /home/dana/flag.txt",
    "submit BREACH{weak_hash_weak_day}"
  ],
  solution: [
    "scan",
    `connect ${CORVID_IP}`,
    "cat /opt/mailer/config/users.db",
    `crack ${DANA_HASH}`,
    "login dana",
    DANA_PASSWORD,
    "cat /home/dana/flag.txt",
    "submit BREACH{weak_hash_weak_day}"
  ]
};
var m02_soft_target_default = mission2;

// src/missions/m03-lighthouse.ts
var LIGHTHOUSE_IP = "10.13.37.61";
var SVC_PASSWORD = "Tl3ghthouse-29";
var SVC_B64 = toBase64(SVC_PASSWORD);
var FLAG = "BREACH{rot13_is_not_encryption}";
var VAULT_NOTE = rot13(`Vault maintenance key: ${FLAG}`);
var mission3 = {
  id: "m03-lighthouse",
  number: 3,
  codename: "LIGHTHOUSE",
  title: "Lighthouse Freight: config host",
  client: "QUILL",
  briefing: [
    'Lighthouse Freight keeps service credentials in a config file. QUILL says "encoded" is not the same as "protected."',
    'QUILL: "Unwrap the service password. Then find the vault note. The company keeps its best secrets somewhere boring."',
    { text: "The config file has a comment about being committed to git once. Nobody ever rotated it.", glitch: true }
  ],
  debrief: [
    "Base64 is an encoding, not a lock. So is ROT13, which is a joke that survives because it looks like encryption.",
    "The decoy hex string was also decodable. Not every readable string is the answer. Check that it matches what the job asked for.",
    "Lighthouse never rotated the password. Neither did half the internet."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([LIGHTHOUSE_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Lighthouse Freight config host (${LIGHTHOUSE_IP})
Goal: service account 'svc', then the flag in its home.
Notes from QUILL: secrets here are encoded, not encrypted.`
      }
    }),
    {
      id: "lighthouse",
      hostname: "lighthouse-cfg",
      ip: LIGHTHOUSE_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "svc", password: SVC_PASSWORD, home: "/home/svc" }
      ],
      ports: [
        { port: 22, service: "ssh", banner: "OpenSSH 8.2p1" },
        { port: 443, service: "https", banner: "nginx 1.18.0" }
      ],
      files: {
        "/etc/lighthouse/app.conf": {
          content: `[database]
host = 10.13.37.62
user = svc
password_b64 = ${SVC_B64}
# rotate before the audit. this file was committed to git once.
`
        },
        "/etc/lighthouse/README": {
          content: "Lighthouse Freight config host.\nPolicy 4.2: credentials are encoded at rest.\nIf you cannot read it, ask Mara."
        },
        "/home/guest/readme.txt": { content: "Guests may read the public config only." },
        "/home/svc/vault_note.rot13": {
          owner: "svc",
          private: true,
          content: VAULT_NOTE
        },
        "/home/svc/decoy.hex": {
          owner: "svc",
          private: true,
          content: toHex("Decoy: BREACH{nice_try_decoy}")
        },
        "/home/svc/chat.log": {
          owner: "svc",
          private: true,
          content: "mara: did you finish the vault note?\nsvc: its rot13, like last time lol\nmara: that is not encryption.\nsvc: it is encryption for my cousin."
        }
      },
      dirs: { "/home/svc": { owner: "svc", private: true } }
    }
  ],
  hashes: [],
  inbox: [
    {
      from: "QUILL",
      date: "Wed 07:15",
      subject: "Encoded is not locked",
      body: `The config host is at ${LIGHTHOUSE_IP}. Their password is wrapped in the most common encoding on earth.
The vault note is the thing I want. It is in the service account's home.`
    }
  ],
  flag: FLAG,
  hints: [
    "The app config has a database password, but it is wrapped. Read the config first and look at the field name.",
    "password_b64 says what kind of wrapping it is. decode it with the right encoding, then login svc with the result.",
    "After login, look in /home/svc. The file ending in .rot13 holds the flag. Decode it, then submit only the BREACH{...} part."
  ],
  tierOverrides: {
    hard: {
      machines: {
        lighthouse: {
          files: {
            "/etc/lighthouse/app.conf.old": { content: "[database]\nhost = 10.13.37.62\nuser = svc\npassword_b64 = " + toBase64("oldpass-2021") + "\n" },
            "/home/svc/.bash_history": { owner: "svc", private: true, content: "ls\ncat ~/todo.txt\nexit" }
          }
        }
      }
    }
  },
  kaliSolution: [
    "nmap",
    `ssh ${LIGHTHOUSE_IP}`,
    "cat /etc/lighthouse/app.conf",
    `echo ${SVC_B64} | base64 -d`,
    "su svc",
    SVC_PASSWORD,
    "cat /home/svc/vault_note.rot13",
    `echo ${VAULT_NOTE} | tr 'A-Za-z' 'N-ZA-Mn-za-m'`,
    `submit ${FLAG}`
  ],
  solution: [
    "scan",
    `connect ${LIGHTHOUSE_IP}`,
    "cat /etc/lighthouse/app.conf",
    `decode base64 ${SVC_B64}`,
    "login svc",
    SVC_PASSWORD,
    "cat /home/svc/vault_note.rot13",
    `decode rot13 ${VAULT_NOTE}`,
    `submit ${FLAG}`
  ]
};
var m03_lighthouse_default = mission3;

// src/missions/m04-blue-lines.ts
var HARBOR_IP = "10.13.37.77";
var mission4 = {
  id: "m04-blue-lines",
  number: 4,
  codename: "BLUE LINES",
  title: "Harbor Web: who got in first",
  client: "QUILL",
  briefing: [
    'Harbor Web was breached three weeks before QUILL noticed. "Someone got in first," QUILL writes. "I want the name of the first one through the door."',
    'QUILL: "Do not get distracted by the loud stuff. Loud is what people use to hide quiet."',
    { text: "The logs on that box are older than this job. Whoever it was left their handwriting in them.", glitch: true }
  ],
  debrief: [
    "The first real entry was not the brute-force noise on the first page. It was a quiet successful login, in a file most people never open.",
    "Log timestamps and log rotation are where forensics lives. The current log is rarely the whole story.",
    "Failed logins are attempts. Accepted logins are doors. Learn to tell them apart."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([HARBOR_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Harbor Web forensics (${HARBOR_IP})
Goal: the username of the first intruder to get a shell from outside.
Flag format: BREACH{username}`
      }
    }),
    {
      id: "harbor",
      hostname: "harbor-web",
      ip: HARBOR_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [{ name: "guest", password: "", home: "/home/guest" }],
      ports: [
        { port: 22, service: "ssh", banner: "OpenSSH 7.4" },
        { port: 80, service: "http", banner: "nginx 1.12.2" }
      ],
      files: {
        "/var/log/README": {
          content: "Logs rotate weekly. The previous week lives in numbered files (auth.log.1).\nAsk ops before deleting anything."
        },
        "/var/log/auth.log.1": {
          content: [
            "Feb 02 02:58:11 harbor-web sshd[790]: Connection closed by 10.13.37.9 port 51200",
            "Feb 02 03:11:04 harbor-web sshd[811]: Failed password for root from 45.19.2.8 port 40122 ssh2",
            "Feb 02 03:11:09 harbor-web sshd[811]: Failed password for root from 45.19.2.8 port 40122 ssh2",
            "Feb 02 03:14:52 harbor-web sshd[833]: Accepted password for svc_backup from 203.0.113.44 port 50311 ssh2",
            "Feb 02 03:15:01 harbor-web sudo: svc_backup : TTY=pts/0 ; COMMAND=/bin/bash",
            "Feb 02 03:20:17 harbor-web sshd[840]: Failed password for deploy from 45.19.2.8 port 40170 ssh2",
            "Feb 02 09:02:44 harbor-web sshd[901]: Accepted publickey for ops from 10.13.37.9 port 51977 ssh2"
          ].join("\n")
        },
        "/var/log/auth.log": {
          content: [
            "Feb 09 14:20:03 harbor-web sshd[1204]: Accepted password for webdev from 10.13.37.9 port 52001 ssh2",
            "Feb 09 14:31:45 harbor-web sshd[1210]: Failed password for admin from 198.51.100.7 port 60012 ssh2",
            "Mar 01 22:48:09 harbor-web sshd[1288]: Accepted password for admin from 198.51.100.7 port 60990 ssh2",
            "Mar 01 22:49:30 harbor-web sshd[1290]: Accepted password for ops from 10.13.37.9 port 52200 ssh2"
          ].join("\n")
        },
        "/var/log/syslog": {
          content: "Feb 02 03:15:02 harbor-web kernel: [eth0] link up\nFeb 02 03:15:02 harbor-web cron[477]: (root) CMD (backup.sh)"
        },
        "/var/log/nginx/access.log": {
          content: '203.0.113.44 - - "GET /admin HTTP/1.1" 404\n198.51.100.7 - - "GET /login HTTP/1.1" 200'
        }
      }
    }
  ],
  hashes: [],
  inbox: [
    {
      from: "QUILL",
      date: "Thu 11:30",
      subject: "Who was first",
      body: `Harbor Web lives at ${HARBOR_IP}. Start with the logs. I need the first successful login from outside the 10.13.37 range.
Do not trust my memory of dates. Trust the files.`
    }
  ],
  flag: "BREACH{svc_backup}",
  hints: [
    "The first break-in is the earliest successful login from outside. Failed attempts are noise, not entry.",
    "Logs rotate into numbered files. Read /var/log/README before you assume the current auth.log is the whole story.",
    'grep -r Accepted /var/log, then find the oldest "Accepted password" line from an address outside 10.13.37. The username is the flag.'
  ],
  tierOverrides: {
    hard: {
      machines: {
        harbor: {
          files: {
            "/var/log/auth.log.2": { content: "Jan 26 04:01:12 harbor-web sshd[640]: Failed password for root from 45.19.2.8 port 40011 ssh2\nJan 26 04:01:19 harbor-web sshd[640]: Connection closed by 45.19.2.8 port 40011" },
            "/var/log/cron.log": { content: "Feb 02 03:00:01 harbor-web CRON[477]: (root) CMD (logrotate)\nFeb 09 03:00:01 harbor-web CRON[512]: (root) CMD (logrotate)" }
          }
        }
      }
    }
  },
  kaliSolution: [
    "nmap",
    `ssh ${HARBOR_IP}`,
    "ls /var/log",
    "cat /var/log/README",
    "grep -r Accepted /var/log",
    "submit BREACH{svc_backup}"
  ],
  solution: [
    "scan",
    `connect ${HARBOR_IP}`,
    "ls /var/log",
    "cat /var/log/README",
    "grep -r Accepted /var/log",
    "submit BREACH{svc_backup}"
  ]
};
var m04_blue_lines_default = mission4;

// src/missions/m05-personal-files.ts
var PORTAL_IP = "10.13.37.90";
var MIRROR_IP = "10.13.37.91";
var RFOSTER_PASSWORD = "Xk!29pQ-bunny";
var mission5 = {
  id: "m05-personal-files",
  number: 5,
  codename: "PERSONAL FILES",
  title: "Brightwater Credit Union: member account",
  client: "QUILL",
  briefing: [
    'QUILL: "The target is a person, not a company. Rhea Foster. She banks at Brightwater. I do not need her password. I need her."',
    "The member portal has a recovery flow. It asks questions a stranger should not know the answers to. Strangers do anyway.",
    { text: "Your trace counter ticks up while you read her life. It feels very quiet in here.", glitch: true }
  ],
  debrief: [
    "Rhea never used a password manager. She used her dog, her hometown and her mother, and she posted all three online.",
    "Security questions are a password with a public answer. Treat them like a password, or better, use random answers nobody could guess.",
    "Social engineering rarely needs malware. It needs patience and a search bar."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([PORTAL_IP, MIRROR_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Rhea Foster, Brightwater member account (${PORTAL_IP})
Goal: into her account, flag in her home directory.
Public records are on the social mirror (${MIRROR_IP}).`
      }
    }),
    {
      id: "portal",
      hostname: "brightwater-portal",
      ip: PORTAL_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "rfoster", password: RFOSTER_PASSWORD, home: "/home/rfoster" }
      ],
      ports: [
        { port: 443, service: "https", banner: "nginx 1.18.0" },
        { port: 22, service: "ssh", banner: "OpenSSH 8.9p1" }
      ],
      files: {
        "/srv/portal/README": {
          content: "Brightwater Credit Union member portal (staging).\nMembers: log in with your password.\nLocked out? Recovery questions were set at enrollment."
        },
        "/srv/portal/logs/access.log": {
          content: "GET /statement 200 rfoster\nGET /login 401 unknown\nGET /login 200 rfoster"
        },
        "/home/guest/readme.txt": { content: "Guest access is read-only." },
        "/home/rfoster/statement.txt": {
          owner: "rfoster",
          private: true,
          content: "Checking      4,812.07\nSavings      19,200.00"
        },
        "/home/rfoster/flag.txt": {
          owner: "rfoster",
          private: true,
          content: "BREACH{the_answers_were_public}"
        }
      },
      dirs: { "/home/rfoster": { owner: "rfoster", private: true } },
      recovery: {
        rfoster: [
          { question: "First pet's name?", answer: "biscuit" },
          { question: "City you grew up in?", answer: "lakeport" },
          { question: "Mother's maiden name?", answer: "vance" }
        ]
      }
    },
    {
      id: "mirror",
      hostname: "social-mirror",
      ip: MIRROR_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [{ name: "guest", password: "", home: "/home/guest" }],
      ports: [{ port: 80, service: "http", banner: "Apache 2.4.41 (mirror)" }],
      files: {
        "/srv/mirror/posts/2022-07-14.txt": {
          content: "Pepper (the neighbour cat) has declared war on my recycling bin."
        },
        "/srv/mirror/posts/2023-11-30.txt": {
          content: "Throwback: grew up in Lakeport, and yes the lake is still cold. #hometown"
        },
        "/srv/mirror/posts/2024-03-02.txt": {
          content: "Walked Biscuit before the rain. My beagle is the greatest good boy in Lakeport. Fight me."
        },
        "/srv/archive/family-tree.txt": {
          content: "Vance family tree (shared with cousins)\n\nMarisol Vance (later Foster), b. 1961, Lakeport\n  -> Gerald Foster, b. 1985\n  -> Rhea Foster, b. 1988"
        },
        "/home/guest/readme.txt": { content: "Mirror of public posts. Read-only." }
      }
    }
  ],
  hashes: [],
  inbox: [
    {
      from: "QUILL",
      date: "Fri 20:05",
      subject: "The target",
      body: `Rhea Foster. Brightwater Credit Union member. The portal is at ${PORTAL_IP}.
She is careful with passwords. She is not careful with her life, which is public.`
    },
    {
      from: "QUILL",
      date: "Fri 20:09",
      subject: "Where the facts are",
      body: `Her public posts and the family archive are on ${MIRROR_IP}. Use only what is already out there. It is the same information she gave the bank.`
    },
    {
      from: "QUILL",
      date: "Fri 20:14",
      subject: "Locked out, on purpose",
      body: "The portal has a forgot-password route, the usual one. It asks the usual questions. Strangers can answer those from public records, and so can anyone who knows her."
    }
  ],
  flag: "BREACH{the_answers_were_public}",
  hints: [
    "Passwords are hard to guess. People are easy to research. Read the mail, then the client packet.",
    `The social mirror (${MIRROR_IP}) has her posts and the family archive. Look for her pet, her hometown and her mother.`,
    `login rfoster, then type ? at the password prompt to start recovery. Answer: biscuit, lakeport, vance. Then cat /home/rfoster/flag.txt.`
  ],
  // Easy plays the base inbox, which has the direct recovery mail. Medium swaps it for a subtler one. Hard has no nudge.
  tierOverrides: {
    medium: {
      hideInbox: ["Locked out, on purpose"],
      inbox: [
        {
          from: "QUILL",
          date: "Fri 20:14",
          subject: "Re: the portal",
          body: "Forget the password. Banks have a second door for members who lose theirs. It asks questions only the member should know, and the member is not always the only one who knows them."
        }
      ]
    },
    hard: {
      hideInbox: ["Locked out, on purpose"],
      machines: {
        portal: {
          files: {
            "/srv/portal/logs/access.old": { content: "GET /login 401 rfoster\nGET /login 401 rfoster\nGET /statement 200 rfoster" }
          }
        },
        mirror: {
          files: {
            "/srv/mirror/posts/2021-02-09.txt": { content: "Pepper got her shots today. Wish me luck." },
            "/srv/archive/recipes.txt": { content: "Grandma Vance's pie: flour, butter, apples from the lakeport orchard." }
          }
        }
      }
    }
  },
  kaliSolution: [
    "nmap",
    `ssh ${MIRROR_IP}`,
    "cat /srv/mirror/posts/2024-03-02.txt",
    "cat /srv/mirror/posts/2023-11-30.txt",
    "cat /srv/archive/family-tree.txt",
    "exit",
    `ssh rfoster@${PORTAL_IP}`,
    "?",
    "biscuit",
    "lakeport",
    "vance",
    "cat /home/rfoster/flag.txt",
    "submit BREACH{the_answers_were_public}"
  ],
  solution: [
    "scan",
    `connect ${MIRROR_IP}`,
    "cat /srv/mirror/posts/2024-03-02.txt",
    "cat /srv/mirror/posts/2023-11-30.txt",
    "cat /srv/archive/family-tree.txt",
    "exit",
    `connect ${PORTAL_IP}`,
    "login rfoster",
    "?",
    "biscuit",
    "lakeport",
    "vance",
    "cat /home/rfoster/flag.txt",
    "submit BREACH{the_answers_were_public}"
  ]
};
var m05_personal_files_default = mission5;

// src/missions/m06-pivot.ts
var GATEWAY_IP = "10.13.37.100";
var VAULT_IP = "10.13.37.120";
var DEPLOY_PASSWORD = "depl0y-2026!";
var DBADMIN_PASSWORD = "Vault!sync-77";
var SENTRY_PID = 412;
var mission6 = {
  id: "m06-pivot",
  number: 6,
  codename: "PIVOT",
  title: "Harlan Crest DMZ: the way through",
  client: "QUILL",
  briefing: [
    "The DMZ gateway is the front door of Harlan Crest Holdings. Behind it is a database nobody outside the company should be able to reach.",
    'QUILL: "The gateway is only the bridge. The vault behind it has dossiers on people who asked the wrong questions. Get through. Then get into the vault."',
    { text: "A sentry process is running on the gateway. It has not noticed you yet.", glitch: true }
  ],
  debrief: [
    "You never touched the vault from outside. You went through the gateway, which is how real attacks work: one foothold, then the next.",
    "The sentry mattered. Security tooling that runs on a box you control is a problem you solve with the account that owns it.",
    "Reading the dossier index was a bad feeling. You will think about it later."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([GATEWAY_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Harlan Crest DMZ (${GATEWAY_IP})
Goal: reach the internal vault (not directly reachable from the rig).
Flag is in /srv/vault on the vault host.`
      }
    }),
    {
      id: "gateway",
      hostname: "dmz-gateway",
      ip: GATEWAY_IP,
      neighbors: [VAULT_IP],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "deploy", password: DEPLOY_PASSWORD, home: "/home/deploy" },
        { name: "root", password: "unused-root-x9", home: "/root" }
      ],
      ports: [
        { port: 22, service: "ssh", banner: "OpenSSH 8.2p1" },
        { port: 443, service: "https", banner: "nginx 1.18.0" }
      ],
      processes: [
        { pid: 1, user: "root", name: "init" },
        { pid: SENTRY_PID, user: "deploy", name: "ids-sentry --watch all", security: true },
        { pid: 501, user: "www-data", name: "nginx: worker" }
      ],
      files: {
        "/opt/deploy/deploy.env": {
          content: `DEPLOY_USER=deploy
DEPLOY_PASS=${DEPLOY_PASSWORD}
# TODO: move this into the vault. (it is public, I know)`
        },
        "/opt/deploy/scripts/backup.sh": {
          owner: "deploy",
          private: true,
          executable: true,
          content: `#!/bin/sh
# nightly dump of the vault database
DBHOST=${VAULT_IP}
DBUSER=dbadmin
DBPASS=${DBADMIN_PASSWORD}
mysqldump -h $DBHOST -u $DBUSER -p$DBPASS vault > /srv/backups/vault.sql
`
        },
        "/home/deploy/.bash_history": {
          owner: "deploy",
          private: true,
          content: `ssh dbadmin@${VAULT_IP}
systemctl status ids-sentry
exit`
        },
        "/home/guest/readme.txt": { content: "DMZ gateway. Authorized staff only." }
      },
      dirs: {
        "/home/deploy": { owner: "deploy", private: true },
        "/opt/deploy/scripts": { owner: "deploy", private: true }
      }
    },
    {
      id: "vault",
      hostname: "vault-db",
      ip: VAULT_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "dbadmin", password: DBADMIN_PASSWORD, home: "/home/dbadmin" }
      ],
      ports: [{ port: 3306, service: "mysql", banner: "MySQL 5.7.42" }],
      files: {
        "/srv/vault/README": { content: "Vault database. Dumps nightly. Do not query from the DMZ." },
        "/srv/vault/dossiers/teo-vance.txt": {
          owner: "dbadmin",
          private: true,
          content: "SUBJECT: Teo Vance (freelance journalist)\nHome: 14 Mill St, Lakeport\nStatus: packet drafted, awaiting QUILL sign-off"
        },
        "/srv/vault/flag.txt": {
          owner: "dbadmin",
          private: true,
          content: "BREACH{pivot_complete_ids_ignored}"
        }
      },
      dirs: { "/srv/vault": { owner: "dbadmin", private: true } }
    }
  ],
  hashes: [],
  inbox: [
    {
      from: "QUILL",
      date: "Sat 14:12",
      subject: "Front door",
      body: `The gateway is at ${GATEWAY_IP}. It is the only host you can see from the rig.
Once you are inside, you will see what is behind it. The vault is the prize.`
    }
  ],
  flag: "BREACH{pivot_complete_ids_ignored}",
  hints: [
    "The gateway is a bridge. Look for credentials sitting in plain sight in /opt before you try anything clever.",
    "A security process is watching this host (ps). Its trace multiplier is why your numbers climb. Kill it from the account that owns it.",
    `login deploy, read backup.sh for the database password, scan from the gateway to find the vault, connect ${VAULT_IP}, login dbadmin, cat /srv/vault/flag.txt.`
  ],
  tierOverrides: {
    hard: {
      machines: {
        gateway: {
          files: {
            "/opt/deploy/CHANGELOG": { content: "v2.4: rotated ids-sentry config\nv2.5: TODO remove deploy password from deploy.env" }
          },
          users: [{ name: "backup", password: "backup", home: "/home/backup" }],
          processes: [{ pid: 777, user: "root", name: "crond" }]
        },
        vault: {
          files: {
            "/srv/vault/dossiers/index.txt": { owner: "dbadmin", private: true, content: "teo-vance.txt\nmarcus-hale.txt\nilse-lund.txt" }
          }
        }
      }
    }
  },
  kaliSolution: [
    "nmap",
    `ssh ${GATEWAY_IP}`,
    "cat /opt/deploy/deploy.env",
    "su deploy",
    DEPLOY_PASSWORD,
    "ps",
    `kill ${SENTRY_PID}`,
    "cat /opt/deploy/scripts/backup.sh",
    "nmap",
    `ssh ${VAULT_IP}`,
    "su dbadmin",
    DBADMIN_PASSWORD,
    "cat /srv/vault/flag.txt",
    "submit BREACH{pivot_complete_ids_ignored}"
  ],
  solution: [
    "scan",
    `connect ${GATEWAY_IP}`,
    "cat /opt/deploy/deploy.env",
    "login deploy",
    DEPLOY_PASSWORD,
    "ps",
    `kill ${SENTRY_PID}`,
    "cat /opt/deploy/scripts/backup.sh",
    "scan",
    `connect ${VAULT_IP}`,
    "login dbadmin",
    DBADMIN_PASSWORD,
    "cat /srv/vault/flag.txt",
    "submit BREACH{pivot_complete_ids_ignored}"
  ]
};
var m06_pivot_default = mission6;

// src/missions/m07-ledger.ts
var LEDGER_IP = "10.13.37.150";
var ADMIN_PASSWORD = "Cr3st-Ledger!9";
var FLAG2 = "BREACH{tautology_beats_password}";
var LOGIN_PHP = `<?php
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
var mission7 = {
  id: "m07-ledger",
  number: 7,
  codename: "LEDGER",
  title: "Crest Payroll Ledger: staff login",
  client: "QUILL",
  briefing: [
    "Harlan Crest Holdings runs payroll through a web form that was written in a hurry. QUILL wants the admin panel.",
    'QUILL: "Ask it nicely. Then stop asking." The rig can reach the ledger host. Nothing else.',
    { text: "The staff form is a text box that talks to a database. Text boxes have opinions about quotation marks.", glitch: true }
  ],
  debrief: [
    "The form pasted your username into a SQL string. A single quote closed the string early, and OR made the whole WHERE clause true.",
    "This is SQL injection in its simplest form. The fix is prepared statements: the database should never parse your input as code.",
    "The ledger had the flag in its admin export. Payroll data, unlocked by a text box. That is the business model of most breaches."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([LEDGER_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Crest Payroll Ledger (${LEDGER_IP})
Goal: admin panel of the staff login. Flag is in the admin export token.
Tip: the login form is a web form. Read the source before you type.`
      }
    }),
    {
      id: "ledger",
      hostname: "ledger-web",
      ip: LEDGER_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "admin", password: ADMIN_PASSWORD, home: "/home/admin" },
        { name: "clerk", password: "payday2024", home: "/home/clerk" }
      ],
      ports: [
        { port: 80, service: "http", banner: "Apache 2.4.41" },
        { port: 443, service: "https", banner: "Apache 2.4.41 (TLS)" }
      ],
      webForm: {
        title: "CREST PAYROLL LEDGER :: STAFF LOGIN",
        rows: [
          { username: "admin", password: ADMIN_PASSWORD },
          { username: "clerk", password: "payday2024" }
        ],
        query: "SELECT id, username FROM users WHERE username = '{username}' AND password = '{password}'",
        success: ["--- PAYROLL ADMIN ---", `Export token: ${FLAG2}`, "Use the export token to close ticket LED-212."]
      },
      files: {
        "/var/www/ledger/login.php": { content: LOGIN_PHP },
        "/var/www/ledger/README": {
          content: "CREST PAYROLL LEDGER (internal)\nStaff only. The staff form is the login.\nTODO: prepared statements, ticket LED-212."
        },
        "/var/www/ledger/db-notes.txt": {
          content: "users(id, username, password)  -- plaintext, migration pending"
        },
        "/var/www/ledger/admin/payroll.csv": {
          owner: "admin",
          private: true,
          content: "name,salary\nhalvorsen,212000\nmarrow,198000"
        },
        "/home/guest/readme.txt": { content: "Guests cannot read payroll." }
      },
      dirs: { "/var/www/ledger/admin": { owner: "admin", private: true } }
    }
  ],
  hashes: [],
  inbox: [
    {
      from: "QUILL",
      date: "Mon 22:17",
      subject: "Payroll",
      body: `The ledger host is ${LEDGER_IP}. Its staff form is the only way in. I want the admin export.
If you read the source, you will see what the form expects you to be.`
    }
  ],
  flag: FLAG2,
  hints: [
    "The staff form builds its database query by pasting in whatever you type. Read login.php to see exactly where your input lands.",
    "Put a single quote in the username. If the form breaks, the SQL error shows you where your input ended up.",
    "Close the username string with a quote, make the WHERE clause always true with OR, then comment out the rest with --. Any password works after that."
  ],
  tierOverrides: {
    hard: {
      machines: {
        ledger: {
          files: {
            "/var/www/ledger/login.php.bak": { content: "<?php\n// old version, before ticket LED-212\n// password check was moved into the query\n?>" },
            "/var/www/ledger/CHANGELOG": { content: "LED-212 open: switch to prepared statements." }
          }
        }
      }
    }
  },
  // The login form is a web page with no command-line equivalent in this simulation, so it keeps the form command.
  kaliSolution: [
    "nmap",
    `ssh ${LEDGER_IP}`,
    "cat /var/www/ledger/login.php",
    "login",
    "' OR '1'='1' --",
    "anything",
    `submit ${FLAG2}`
  ],
  solution: [
    "scan",
    `connect ${LEDGER_IP}`,
    "cat /var/www/ledger/login.php",
    "login",
    "' OR '1'='1' --",
    "anything",
    `submit ${FLAG2}`
  ]
};
var m07_ledger_default = mission7;

// src/missions/m08-ghost-protocol.ts
var ARCHIVE_IP = "10.13.37.240";
var MARROW_PASSWORD = "M4rr0w-Keys-88";
var FLAG3 = "BREACH{the_client_was_the_crime}";
var mission8 = {
  id: "m08-ghost-protocol",
  number: 8,
  codename: "GHOST PROTOCOL",
  title: "Harlan Crest Archive: the last job",
  client: "QUILL",
  briefing: [
    "QUILL's final posting arrives with the same signature as always. The timestamp is a few minutes wrong. You notice. You decide not to mention it.",
    'QUILL: "One last archive. Pull the staff directory and whatever the incident team left lying around. Then you are clear. Do not ask why I need a directory."',
    { text: "The dossiers you built for the last seven jobs are sitting in a folder somewhere. Your handwriting is on all of them.", glitch: true }
  ],
  debrief: [
    "The directory lists QUILL's real name. It is the head of internal security at the company the client claimed to be exposing.",
    "The incident brief names the journalist, Teo Vance, as the story. The dossiers you built were the evidence. You were the contractor the plan did not need to trust.",
    "Whatever you do next, you can no longer pretend the job was only data."
  ],
  start: { machine: "rig", cwd: "/home/ghost" },
  machines: [
    makeRig([ARCHIVE_IP], {
      "/home/ghost/job.txt": {
        owner: "ghost",
        content: `JOB: Harlan Crest Archive (${ARCHIVE_IP})
Goal: the staff directory and the incident folder, then the flag in marrow's home.
Payment: on delivery of the flag.`
      }
    }),
    {
      id: "archive",
      hostname: "crest-archive",
      ip: ARCHIVE_IP,
      neighbors: [],
      defaultUser: "guest",
      users: [
        { name: "guest", password: "", home: "/home/guest" },
        { name: "marrow", password: MARROW_PASSWORD, home: "/home/marrow" }
      ],
      ports: [
        { port: 22, service: "ssh", banner: "OpenSSH 9.2p1" },
        { port: 443, service: "https", banner: "nginx 1.22.1" }
      ],
      files: {
        "/srv/hr/directory.txt": {
          content: `HARLAN CREST HOLDINGS :: STAFF DIRECTORY (internal, do not forward)

Marrow, Ilse      Director, Internal Security      ext 4417
Halvorsen, Dana   CFO                               ext 4100
Vance, Teo        (former employee, flagged)        n/a

Note: the exchange handle "QUILL" is listed under Marrow, Ilse. Do not repeat.`
        },
        "/srv/hr/.provision": {
          content: `# provisioning note (auto-generated)
user: marrow
pass_b64: ${toBase64(MARROW_PASSWORD)}
# remove after first login`
        },
        "/srv/incident/brief-0412.txt": {
          content: `SUBJECT: Vance packet
1. Dossiers from the Brightwater, Corvid, Harbor and Lighthouse jobs go into the packet.
2. The packet goes to the Ledger Post as an anonymous tip from QUILL.
3. Teo Vance is the named source. Make him the story.
4. Contractor "ghost" does not need the full plan. Keep it that way.`
        },
        "/srv/incident/ledger-post-packet.txt": {
          content: "attachments:\n  dossier_vance.pdf   (from job 5)\n  ledger_export.csv   (from job 7)\n  harbor_logs.txt     (from job 4)"
        },
        "/home/marrow/flag.txt": {
          owner: "marrow",
          private: true,
          content: FLAG3
        },
        "/home/marrow/quill-drafts.txt": {
          owner: "marrow",
          private: true,
          content: 'draft 3: "an anonymous source inside Harlan Crest confirms Vance took payments..."'
        }
      },
      dirs: { "/home/marrow": { owner: "marrow", private: true } }
    }
  ],
  hashes: [],
  inbox: [
    {
      from: "QUILL",
      date: "Sun 03:58",
      subject: "Last one",
      body: `Crest Archive at ${ARCHIVE_IP}. Pull the staff directory and the incident folder.
You have been very reliable. Nothing personal. Keep your head down.`
    }
  ],
  flag: FLAG3,
  hints: [
    "Before you finish, ask who the client really is. The staff directory answers that more honestly than the mail does.",
    "A hidden provisioning file sits in /srv/hr. ls -a shows hidden files. Its password is base64 encoded.",
    "decode base64 on the pass_b64 value, login marrow with the result, cat /home/marrow/flag.txt, submit it, then choose an ending."
  ],
  endings: [
    {
      id: "burn",
      label: "Burn the packet. Wipe the drop, keep the money, vanish.",
      text: [
        "You wipe the drop and the exchange board. The payment lands in an account nobody can trace back to you.",
        "Somewhere inside Harlan Crest a director sleeps well. You will never know whether that was a mistake."
      ]
    },
    {
      id: "expose",
      label: "Send the packet to Teo Vance, with the frame attached.",
      text: [
        "You send the packet to Teo Vance with no name and no fee. He calls back within the hour. He has been expecting a tip for months.",
        "The Ledger Post runs the story with the frame exposed. Ilse Marrow resigns on a Tuesday. You stop being a ghost and become a witness."
      ]
    },
    {
      id: "sell",
      label: "Sell the packet back to Harlan Crest. Handles can be passed on.",
      text: [
        "Harlan Crest pays triple and asks for a new handle. You give them one. It is not QUILL. It is GHOST.",
        "A week later a new client posts a job with no company name. You recognise the phrasing, because it is yours."
      ]
    }
  ],
  tierOverrides: {
    hard: {
      machines: {
        archive: {
          files: {
            "/srv/hr/.provision.old": { content: "# superseded provisioning note\nuser: marrow\npass_b64: " + toBase64("changeme") + "\n" },
            "/srv/hr/payroll-2019.csv": { content: "name,salary\nVance Teo,0\nHalvorsen Dana,240000" }
          }
        }
      }
    }
  },
  kaliSolution: [
    `ssh ${ARCHIVE_IP}`,
    "cat /srv/hr/directory.txt",
    "cat /srv/incident/brief-0412.txt",
    "ls -la /srv/hr",
    "cat /srv/hr/.provision",
    `echo ${toBase64(MARROW_PASSWORD)} | base64 -d`,
    "su marrow",
    MARROW_PASSWORD,
    "cat /home/marrow/flag.txt",
    `submit ${FLAG3}`,
    "2"
  ],
  solution: [
    `connect ${ARCHIVE_IP}`,
    "cat /srv/hr/directory.txt",
    "cat /srv/incident/brief-0412.txt",
    "ls -a /srv/hr",
    "cat /srv/hr/.provision",
    `decode base64 ${toBase64(MARROW_PASSWORD)}`,
    "login marrow",
    MARROW_PASSWORD,
    "cat /home/marrow/flag.txt",
    `submit ${FLAG3}`,
    "2"
  ]
};
var m08_ghost_protocol_default = mission8;

// src/missions/index.ts
var MISSIONS = [m01_dead_drop_default, m02_soft_target_default, m03_lighthouse_default, m04_blue_lines_default, m05_personal_files_default, m06_pivot_default, m07_ledger_default, m08_ghost_protocol_default];

// src/lib/daily.ts
function utcDate(now = /* @__PURE__ */ new Date()) {
  return now.toISOString().slice(0, 10);
}
function shiftDate(date, days) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function dailyNumber(date) {
  const start = Date.UTC(2026, 0, 1);
  const day = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((day - start) / 864e5) + 1;
}
function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var HOSTS = ["ledger-02", "relay-7", "ops-box", "hangar-db", "sat-uplink", "cafe-wifi-3", "meridian-web", "quarry-nas"];
var PEOPLE = ["maya", "sol", "tobi", "vera", "kenji", "ines", "omar", "lena", "bram", "noor"];
var WORDS = ["copper", "lantern", "harbor", "velvet", "orbit", "cedar", "falcon", "quartz", "juniper", "meadow"];
var FLAG_WORDS = ["tin", "salt", "ember", "glass", "static", "lamp", "river", "signal", "drift", "anchor"];
var DECOYS = {
  "/srv/share/old-menu.txt": "Canteen menu, week 41: soup, bread, the usual. No substitutions on Fridays.",
  "/var/log/cron.log": "CRON[2231]: nightly backup finished in 4m12s\nCRON[2240]: rotated 3 logs",
  "/srv/share/welcome.txt": "Welcome to the shared drive. Keep it tidy. Delete your old drafts."
};
function pick(rand, items) {
  return items[Math.floor(rand() * items.length)];
}
function hex(rand, length) {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(rand() * 16).toString(16);
  return out;
}
function targetIp(rand) {
  let second = 0;
  do {
    second = 1 + Math.floor(rand() * 200);
  } while (second === 66);
  return `10.${second}.${Math.floor(rand() * 250) + 1}.${Math.floor(rand() * 200) + 20}`;
}
var REAL_WORLD_KEYS = ["shared-note", "encoded-secret", "weak-hash"];
function dailyMission(date) {
  const rand = seededRandom(hashSeed(`breach-daily:${date}`));
  const ip = targetIp(rand);
  const host = pick(rand, HOSTS);
  const user = pick(rand, PEOPLE);
  const pw = `${pick(rand, WORDS)}${10 + Math.floor(rand() * 89)}`;
  const flag = `BREACH{${pick(rand, FLAG_WORDS)}_${pick(rand, FLAG_WORDS)}_${Math.floor(rand() * 900 + 100)}}`;
  const template = Math.floor(rand() * 3);
  const home = `/home/${user}`;
  const flagPath = `${home}/flag.txt`;
  const files = {};
  const decoyPaths = Object.keys(DECOYS).filter(() => rand() < 0.6);
  for (const p of decoyPaths) files[p] = { content: DECOYS[p] };
  let solution;
  let kaliSolution;
  let hashes = [];
  let concept;
  let mail = [];
  if (template === 0) {
    concept = "credentials left in a shared note";
    files["/srv/share/handover.txt"] = { content: `Handover: ${user} is on call. Login is ${user}, password ${pw}. Rotate it when the audit ends.` };
    kaliSolution = ["nmap", `ssh ${ip}`, "ls /srv/share", "cat /srv/share/handover.txt", `su ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
    solution = ["scan", `connect ${ip}`, "ls /srv/share", "cat /srv/share/handover.txt", `login ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
  } else if (template === 1) {
    concept = "a password hidden behind base64";
    const b64 = toBase64(pw);
    files["/etc/app/settings.env"] = { content: `APP_ENV=prod
DB_USER=${user}
DB_PASS_B64=${b64}
LOG_LEVEL=warn` };
    kaliSolution = ["nmap", `ssh ${ip}`, "cat /etc/app/settings.env", `echo ${b64} | base64 -d`, `su ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
    solution = ["scan", `connect ${ip}`, "cat /etc/app/settings.env", `decode base64 ${b64}`, `login ${user}`, pw, `cat ${flagPath}`, `submit ${flag}`];
  } else {
    concept = "a weak hash of a common password";
    const plain = pick(rand, WORDLIST);
    const hash = hex(rand, 32);
    hashes = [{ hash, plaintext: plain, algo: "md5" }];
    files["/opt/auth/users.db"] = { content: `${user}:${hash}:admin
guest:${hex(rand, 32)}:user` };
    kaliSolution = ["nmap", `ssh ${ip}`, "cat /opt/auth/users.db", `john ${hash}`, `su ${user}`, plain, `cat ${flagPath}`, `submit ${flag}`];
    solution = ["scan", `connect ${ip}`, "cat /opt/auth/users.db", `crack ${hash}`, `login ${user}`, plain, `cat ${flagPath}`, `submit ${flag}`];
    mail = [];
  }
  const accountPassword = template === 2 ? hashes[0].plaintext : pw;
  const target = {
    id: "target",
    hostname: host,
    ip,
    neighbors: [],
    defaultUser: "guest",
    users: [
      { name: "guest", password: "", home: "/home/guest" },
      { name: user, password: accountPassword, home }
    ],
    ports: [
      { port: 22, service: "ssh", banner: "OpenSSH 8.9p1" },
      { port: 443, service: "https", banner: "nginx 1.18.0" }
    ],
    files: {
      ...files,
      [flagPath]: { owner: user, private: true, content: flag },
      "/home/guest/readme.txt": { content: "Guest access. Look around, touch nothing." }
    },
    dirs: { [home]: { owner: user, private: true } }
  };
  const rig = makeRig([ip]);
  const dayNo = dailyNumber(date);
  return {
    id: `daily-${date}`,
    number: dayNo,
    codename: `DAILY ${dayNo}`,
    title: `${host}: ${concept}`,
    client: "OPEN BOARD",
    briefing: [
      `Today's job is open to everyone, on the same network, the same day. Target: ${host} (${ip}).`,
      `Find the account, get in, read the flag at ${flagPath}.`
    ],
    debrief: [
      `The weak point was ${concept}. It is one of the oldest mistakes in the book, and it still shows up in the field.`
    ],
    start: { machine: "rig", cwd: "/home/ghost" },
    machines: [rig, target],
    hashes,
    inbox: mail,
    flag,
    hints: [
      `Start with what the box shares. Look for notes, config files and anything a team left lying about.`,
      `The account is ${user}. Find out how its password is stored.`,
      `${concept[0].toUpperCase()}${concept.slice(1)} is the weak point. Use the matching decode or cracking tool, then su ${user}.`
    ],
    solution,
    kaliSolution,
    realWorldKey: REAL_WORLD_KEYS[template]
  };
}

// src/lib/nickname.ts
var NICK_PATTERN = /^[A-Za-z0-9_-]{3,16}$/;
var BLOCKED = ["fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "retard", "kike", "rapist", "nazi", "porn"];
var LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };
function foldForFilter(text) {
  return [...text.toLowerCase()].map((ch) => LEET[ch] ?? ch).join("").replace(/[^a-z]/g, "");
}
function containsProfanity(text) {
  const folded = foldForFilter(text);
  return BLOCKED.some((word) => folded.includes(word));
}
function nicknameProblem(nick) {
  if (!NICK_PATTERN.test(nick)) return "Use 3 to 16 letters, numbers, _ or -.";
  if (containsProfanity(nick)) return "That nickname is not allowed.";
  return null;
}

// src/lib/recoverykey.ts
var KEY_WORDS = [
  "AMBER",
  "ANCHOR",
  "ARROW",
  "ASH",
  "BASALT",
  "BEACON",
  "BISHOP",
  "BLAZE",
  "BRASS",
  "CANYON",
  "CEDAR",
  "CIPHER",
  "CLOUD",
  "COBALT",
  "COMET",
  "COPPER",
  "CORVID",
  "CRATER",
  "DELTA",
  "DRIFT",
  "EMBER",
  "ENIGMA",
  "FALCON",
  "FERN",
  "FJORD",
  "FLINT",
  "FORGE",
  "FROST",
  "GHOST",
  "GLACIER",
  "GLASS",
  "GRANITE",
  "HARBOR",
  "HAZEL",
  "HELIX",
  "HOLLOW",
  "INDIGO",
  "IRON",
  "JADE",
  "JUNIPER",
  "KESTREL",
  "LANTERN",
  "LATCH",
  "LOTUS",
  "MERIDIAN",
  "MERCURY",
  "MIRROR",
  "MOSS",
  "NEEDLE",
  "NEON",
  "ONYX",
  "ORBIT",
  "OSPREY",
  "PARADOX",
  "PINE",
  "PRISM",
  "QUARTZ",
  "RAVEN",
  "RIVER",
  "SABLE",
  "SIGNAL",
  "SILVER",
  "SLATE",
  "STATIC",
  "SUMMIT",
  "TIDE",
  "TUNDRA",
  "VAULT",
  "VELVET",
  "WILLOW"
];
var KEY_PATTERN = /^[A-Z]+-[A-Z]+-[A-Z]+-[A-Z]+-\d{4}$/;
function generateRecoveryKey(random) {
  const pick2 = () => KEY_WORDS[Math.floor(random() * KEY_WORDS.length)];
  const digits = String(Math.floor(random() * 1e4)).padStart(4, "0");
  return [pick2(), pick2(), pick2(), pick2(), digits].join("-");
}
function normalizeRecoveryKey(input) {
  return input.trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function isWellFormedKey(input) {
  return KEY_PATTERN.test(normalizeRecoveryKey(input));
}
function admit(bucket, now, opts) {
  const fresh = !bucket || now - bucket.windowStart >= opts.windowMs;
  const base = fresh ? { windowStart: now, hits: 0 } : bucket;
  const next = { windowStart: base.windowStart, hits: base.hits + 1 };
  return { allowed: next.hits <= opts.max, next };
}
var RESTORE_LIMIT = { windowMs: 60 * 60 * 1e3, max: 10 };

// src/lib/history.ts
var HISTORY_LIMIT = 200;
function mergeHistory(a, b) {
  const byId = /* @__PURE__ */ new Map();
  for (const r of [...a, ...b]) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => x.at < y.at ? 1 : x.at > y.at ? -1 : 0).slice(0, HISTORY_LIMIT);
}

// src/lib/merge.ts
var TIERS2 = ["easy", "medium", "hard"];
function betterResult(a, b) {
  if (!a) return b;
  if (!b) return a;
  return b.points > a.points ? b : a;
}
function mergeCompleted(a, b) {
  const out = { easy: {}, medium: {}, hard: {} };
  for (const t of TIERS2) {
    const ids = /* @__PURE__ */ new Set([...Object.keys(a[t]), ...Object.keys(b[t])]);
    for (const id of ids) {
      const best = betterResult(a[t][id], b[t][id]);
      if (best) out[t][id] = best;
    }
  }
  return out;
}
function mergeAttempts(a, b) {
  const out = { easy: {}, medium: {}, hard: {} };
  for (const t of TIERS2) {
    for (const id of /* @__PURE__ */ new Set([...Object.keys(a[t]), ...Object.keys(b[t])])) {
      out[t][id] = Math.max(a[t][id] ?? 0, b[t][id] ?? 0);
    }
  }
  return out;
}
function mergeDailies(a, b) {
  const out = {};
  for (const date of /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])) {
    const row = {};
    for (const t of TIERS2) {
      const best = betterResult(a[date]?.[t], b[date]?.[t]);
      if (best) row[t] = best;
    }
    out[date] = row;
  }
  return out;
}
function mergeSaves(local, remote) {
  return {
    ...local,
    completed: mergeCompleted(local.completed, remote.completed),
    attempts: mergeAttempts(local.attempts, remote.attempts),
    achievements: [.../* @__PURE__ */ new Set([...local.achievements, ...remote.achievements])],
    history: mergeHistory(local.history, remote.history).slice(0, HISTORY_LIMIT),
    dailies: mergeDailies(local.dailies, remote.dailies),
    counters: { sudoTries: Math.max(local.counters.sudoTries, remote.counters.sudoTries) },
    nickname: local.nickname ?? remote.nickname
  };
}
export {
  MISSIONS,
  RESTORE_LIMIT,
  RUN_LIMITS,
  admit,
  dailyMission,
  generateRecoveryKey,
  isWellFormedKey,
  mergeSaves,
  nicknameProblem,
  normalizeRecoveryKey,
  shiftDate,
  utcDate,
  validateRun
};
