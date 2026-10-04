// A deliberately small SQL evaluator for the staff login form.
// It exists so the injection puzzle behaves like a real database: quotes break strings, AND binds tighter
// than OR, and -- or # comments out the rest of the statement. It is not a general SQL engine.

type TokType = 'str' | 'num' | 'id' | 'kw' | 'op' | 'lp' | 'rp';

interface Tok {
  type: TokType;
  value: string;
  pos: number;
}

export class SqlError extends Error {}

const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'AND', 'OR']);

function syntaxError(sql: string, pos: number): SqlError {
  const near = sql.slice(pos).split('\n')[0];
  return new SqlError(`You have an error in your SQL syntax; check the manual for the right syntax near '${near}' at line 1`);
}

export function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '#' || (c === '-' && sql[i + 1] === '-')) break;

    if (c === "'") {
      let j = i + 1;
      let value = '';
      for (;;) {
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
      toks.push({ type: 'str', value, pos: i });
      i = j + 1;
      continue;
    }

    if (c === '(') {
      toks.push({ type: 'lp', value: c, pos: i++ });
      continue;
    }
    if (c === ')') {
      toks.push({ type: 'rp', value: c, pos: i++ });
      continue;
    }
    if (c === '=' || c === ',' || c === '*' || c === ';') {
      toks.push({ type: 'op', value: c, pos: i++ });
      continue;
    }
    if (/\d/.test(c)) {
      let j = i;
      while (j < sql.length && /\d/.test(sql[j])) j++;
      toks.push({ type: 'num', value: sql.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
      const word = sql.slice(i, j);
      const upper = word.toUpperCase();
      toks.push(KEYWORDS.has(upper) ? { type: 'kw', value: upper, pos: i } : { type: 'id', value: word.toLowerCase(), pos: i });
      i = j;
      continue;
    }
    throw syntaxError(sql, i);
  }
  return toks;
}

/** Recursive-descent evaluator for a WHERE expression against one row. */
class WhereParser {
  private i = 0;

  constructor(
    private readonly toks: Tok[],
    private readonly sql: string,
    private readonly row: Record<string, string>,
  ) {}

  parse(): boolean {
    const result = this.or();
    if (this.i < this.toks.length) throw syntaxError(this.sql, this.toks[this.i].pos);
    return result;
  }

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  private isKw(word: string): boolean {
    const t = this.peek();
    return t?.type === 'kw' && t.value === word;
  }

  private or(): boolean {
    let value = this.and();
    while (this.isKw('OR')) {
      this.i++;
      const right = this.and();
      value = value || right;
    }
    return value;
  }

  private and(): boolean {
    let value = this.cmp();
    while (this.isKw('AND')) {
      this.i++;
      const right = this.cmp();
      value = value && right;
    }
    return value;
  }

  private cmp(): boolean {
    const t = this.peek();
    if (t?.type === 'lp') {
      this.i++;
      const inner = this.or();
      const close = this.peek();
      if (close?.type !== 'rp') throw syntaxError(this.sql, close?.pos ?? this.sql.length);
      this.i++;
      return inner;
    }
    const left = this.value();
    const op = this.peek();
    if (op?.type !== 'op' || op.value !== '=') throw syntaxError(this.sql, op?.pos ?? this.sql.length);
    this.i++;
    const right = this.value();
    return left === right;
  }

  private value(): string {
    const t = this.peek();
    if (!t) throw syntaxError(this.sql, this.sql.length);
    this.i++;
    if (t.type === 'str' || t.type === 'num') return t.value;
    if (t.type === 'id') {
      if (!(t.value in this.row)) throw new SqlError(`Unknown column '${t.value}' in 'where clause'`);
      return this.row[t.value];
    }
    throw syntaxError(this.sql, t.pos);
  }
}

export interface LoginRow {
  username: string;
  password: string;
}

export type LoginResult = { ok: true; user: string; query: string } | { ok: false; query: string; error?: string };

/**
 * Builds the query the way a naive app would (raw string substitution), then returns the first row whose WHERE clause is true.
 * Syntax errors come back as `error` so the UI can show the database message, which often leaks the injection point.
 */
export function runLoginQuery(template: string, username: string, password: string, rows: LoginRow[]): LoginResult {
  const query = template.split('{username}').join(username).split('{password}').join(password);
  try {
    const toks = tokenize(query);
    const whereAt = toks.findIndex((t) => t.type === 'kw' && t.value === 'WHERE');
    if (whereAt < 0) throw syntaxError(query, 0);
    const body = toks.slice(whereAt + 1);
    const hit = rows.map((r, i) => ({ id: String(i + 1), ...r })).find((row) => new WhereParser(body, query, row).parse());
    return hit ? { ok: true, user: hit.username, query } : { ok: false, query };
  } catch (err) {
    if (err instanceof SqlError) return { ok: false, query, error: err.message };
    throw err;
  }
}
