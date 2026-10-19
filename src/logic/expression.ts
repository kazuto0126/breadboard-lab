import { createTask, rowBits, type TaskResult, type TaskValue } from './task';

/**
 * 子專案 35（規格 2026-10-19 boolean-expressions）：讀布林式（例如 `X = AB + A'C`），算出真值表建立題目。
 * 每行 `輸出名稱 = 式子`；變數是一個英文字母加可有可無的數字；優先順序 反相 > AND > XOR > OR。
 */

export type Expr =
  | { kind: 'var'; name: string }
  | { kind: 'const'; value: 0 | 1 }
  | { kind: 'not'; arg: Expr }
  | { kind: 'and' | 'or' | 'xor'; args: Expr[] };

type Op = 'and' | 'or' | 'xor' | 'pre-not' | 'post-not' | '(' | ')';
type Token = { col: number; text: string } & ({ kind: 'var'; name: string } | { kind: 'const'; value: 0 | 1 } | { kind: 'op'; op: Op });

/** 從文件複製來的全形字先換成一般的字（一個字換一個字，位置不變）。 */
const FULL_WIDTH: Record<string, string> = { '＝': '=', '（': '(', '）': ')', '＋': '+', '　': ' ' };
const OPS: Record<string, Op> = {
  "'": 'post-not', '’': 'post-not', '′': 'post-not',
  '!': 'pre-not', '~': 'pre-not', '¬': 'pre-not',
  '*': 'and', '·': 'and', '⋅': 'and', '&': 'and', '∧': 'and', '.': 'and',
  '+': 'or', '|': 'or', '∨': 'or',
  '⊕': 'xor', '^': 'xor',
  '(': '(', ')': ')',
};

class ExpressionError extends Error {}

/** 把一行的式子（從 offset 開始）切成記號；col 是這一行的第幾個字（從 1 開始）。 */
function tokenize(text: string, offset: number, line: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const col = offset + i + 1;
    if (/\s/.test(c)) {
      i++;
    } else if (/[A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      tokens.push({ kind: 'var', name: text.slice(i, j), col, text: text.slice(i, j) });
      i = j;
    } else if (c === '0' || c === '1') {
      tokens.push({ kind: 'const', value: c === '1' ? 1 : 0, col, text: c });
      i++;
    } else if (OPS[c]) {
      tokens.push({ kind: 'op', op: OPS[c], col, text: c });
      i++;
    } else {
      throw new ExpressionError(`第 ${line} 行第 ${col} 個字：看不懂「${c}」`);
    }
  }
  return tokens;
}

/** 遞迴下降：or → xor → and（含連寫）→ 反相 → 變數、常數、括號。 */
function parseLine(tokens: Token[], line: number): Expr {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (t: Token | undefined, op: Op): boolean => t?.kind === 'op' && t.op === op;
  const missingAfter = () => {
    const prev = tokens[pos - 1];
    return new ExpressionError(prev ? `第 ${line} 行：${prev.text} 後面少了東西` : `第 ${line} 行：= 後面少了式子`);
  };

  const binary = (kind: 'or' | 'xor', next: () => Expr): Expr => {
    const args = [next()];
    while (isOp(peek(), kind)) {
      pos++;
      args.push(next());
    }
    return args.length === 1 ? args[0] : { kind, args };
  };
  /** 下一個記號可以開始一個因子（連寫的 AND）。 */
  const startsFactor = (t: Token | undefined) => t !== undefined && (t.kind !== 'op' || t.op === '(' || t.op === 'pre-not');
  const andExpr = (): Expr => {
    const args = [unary()];
    for (;;) {
      if (isOp(peek(), 'and')) {
        pos++;
        args.push(unary());
      } else if (startsFactor(peek())) args.push(unary());
      else break;
    }
    return args.length === 1 ? args[0] : { kind: 'and', args };
  };
  const unary = (): Expr => {
    if (isOp(peek(), 'pre-not')) {
      pos++;
      return { kind: 'not', arg: unary() };
    }
    let e = primary();
    while (isOp(peek(), 'post-not')) {
      pos++;
      e = { kind: 'not', arg: e };
    }
    return e;
  };
  const primary = (): Expr => {
    const t = peek();
    if (!t) throw missingAfter();
    if (t.kind === 'var') {
      pos++;
      return { kind: 'var', name: t.name };
    }
    if (t.kind === 'const') {
      pos++;
      return { kind: 'const', value: t.value };
    }
    if (t.op === '(') {
      pos++;
      const inner = orExpr();
      if (!isOp(peek(), ')')) {
        if (peek()) throw new ExpressionError(`第 ${line} 行第 ${peek()!.col} 個字：看不懂「${peek()!.text}」`);
        throw new ExpressionError(`第 ${line} 行第 ${t.col} 個字：括號沒有關起來`);
      }
      pos++;
      return inner;
    }
    if (t.op === ')') throw new ExpressionError(`第 ${line} 行第 ${t.col} 個字：多了一個「)」`);
    throw new ExpressionError(`第 ${line} 行第 ${t.col} 個字：「${t.text}」前面少了東西`);
  };
  const orExpr = (): Expr => binary('or', () => binary('xor', andExpr));

  if (tokens.length === 0) throw new ExpressionError(`第 ${line} 行：= 後面少了式子`);
  const e = orExpr();
  const extra = peek();
  if (extra) throw new ExpressionError(isOp(extra, ')') ? `第 ${line} 行第 ${extra.col} 個字：多了一個「)」` : `第 ${line} 行第 ${extra.col} 個字：看不懂「${extra.text}」`);
  return e;
}

function variablesOf(e: Expr, out: Set<string>): Set<string> {
  if (e.kind === 'var') out.add(e.name);
  else if (e.kind === 'not') variablesOf(e.arg, out);
  else if (e.kind !== 'const') for (const a of e.args) variablesOf(a, out);
  return out;
}

const collator = new Intl.Collator('en', { numeric: true });

/** 讀好幾行布林式；輸入是所有變數依字母排序（A2 在 A10 前面）。 */
export function parseExpressions(text: string): { ok: true; outputs: Array<{ name: string; expr: Expr }>; inputs: string[] } | { ok: false; reason: string } {
  const lines = [...text].map((c) => FULL_WIDTH[c] ?? c).join('').split(/\r?\n/);
  const filled = lines.map((l, i) => ({ text: l, line: i + 1 })).filter((l) => l.text.trim() !== '');
  if (filled.length === 0) return { ok: false, reason: "先輸入布林式，例如 X = AB + A'C" };
  try {
    let unnamed = 0;
    const outputs = filled.map(({ text: l, line }) => {
      const eq = l.indexOf('=');
      if (eq >= 0 && l.indexOf('=', eq + 1) >= 0) throw new ExpressionError(`第 ${line} 行：只能有一個 =`);
      const name = eq >= 0 ? l.slice(0, eq).trim() : filled.length === 1 ? 'F' : `F${++unnamed}`;
      if (eq >= 0 && name === '') throw new ExpressionError(`第 ${line} 行：要寫成「輸出名稱 = 式子」`);
      const offset = eq >= 0 ? eq + 1 : 0;
      return { name, expr: parseLine(tokenize(l.slice(offset), offset, line), line) };
    });
    const vars = new Set<string>();
    for (const o of outputs) variablesOf(o.expr, vars);
    return { ok: true, outputs, inputs: [...vars].sort(collator.compare) };
  } catch (err) {
    if (err instanceof ExpressionError) return { ok: false, reason: err.message };
    throw err;
  }
}

function evaluate(e: Expr, env: Map<string, 0 | 1>): 0 | 1 {
  switch (e.kind) {
    case 'var':
      return env.get(e.name) ?? 0;
    case 'const':
      return e.value;
    case 'not':
      return evaluate(e.arg, env) === 1 ? 0 : 1;
    case 'and':
      return e.args.every((a) => evaluate(a, env) === 1) ? 1 : 0;
    case 'or':
      return e.args.some((a) => evaluate(a, env) === 1) ? 1 : 0;
    case 'xor':
      return (e.args.reduce<number>((n, a) => n + evaluate(a, env), 0) % 2) as 0 | 1;
  }
}

/** 用布林式建立題目：每個輸出逐列算出 0 / 1。名稱、個數的檢查和建立題目一樣。 */
export function taskFromExpressions(text: string): TaskResult {
  const parsed = parseExpressions(text);
  if (!parsed.ok) return parsed;
  const made = createTask(parsed.inputs, parsed.outputs.map((o) => o.name));
  if (!made.ok) return made;
  const task = made.task;
  const rows = task.rows.map((_, r) => {
    const bits = rowBits(task, r);
    const env = new Map(task.inputs.map((name, i) => [name, bits[i]]));
    return parsed.outputs.map((o): TaskValue => evaluate(o.expr, env));
  });
  return { ok: true, task: { ...task, rows } };
}
