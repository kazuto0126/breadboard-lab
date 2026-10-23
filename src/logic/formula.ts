import { sortedIo, topoOrder, truthTable } from './evaluate';
import type { Expr } from './expression';
import { literalsOf, minimize } from './minimize';
import { inputCountOf } from './shapes';
import { isGate, signalOf, type LogicDiagram, type LogicNode } from './types';

/**
 * 子專案 40（規格 2026-10-23 diagram-formulas）：自己畫的邏輯圖每個輸出的布林式。
 * 「照圖寫出來」照著閘一層一層寫、不化簡；「化簡後」從真值表化簡成積項和。寫法和「輸入布林式」一樣，可以複製貼回去。
 */

/** 沒接的地方寫成 `?`。 */
type Formula = Expr | { kind: 'missing' };

export interface OutputFormula {
  id: string;
  name: string;
  /** 照圖寫出來的式子；寫不出來時是 null，原因在 readProblem。 */
  read: string | null;
  readProblem?: string;
  /** 化簡後的積項和；寫不出來時是 null，原因在 simplifiedProblem。 */
  simplified: string | null;
  simplifiedProblem?: string;
}

class ThroughBlock extends Error {}

/** 照圖寫出來超過這麼多個字母就不列（同一個閘接到很多地方時，展開後可能非常長）。 */
export const MAX_FORMULA_LETTERS = 200;

/** 展開後有幾個字母（共用的部分記下來，不會真的展開）。 */
function letterCount(e: Formula, memo: Map<Formula, number>): number {
  const known = memo.get(e);
  if (known !== undefined) return known;
  const n = e.kind === 'not' ? letterCount(e.arg, memo) : e.kind === 'and' || e.kind === 'or' || e.kind === 'xor' ? e.args.reduce((sum, a) => sum + letterCount(a, memo), 0) : 1;
  memo.set(e, n);
  return n;
}

/** 優先順序：OR < XOR < AND < 反相、字母、常數。 */
const level = (e: Formula) => (e.kind === 'or' ? 1 : e.kind === 'xor' ? 2 : e.kind === 'and' ? 3 : 4);

/** 「輸入布林式」能讀的名稱是一個英文字母加數字；其他名稱（例如 Cin）連寫會看不出是哪幾個字，AND 改用 `·`。 */
export const needsDot = (names: string[]) => names.some((n) => !/^[A-Za-z][0-9]*$/.test(n));

/** 式子的文字，只在需要時加括號。 */
export function exprText(e: Formula, dot: boolean): string {
  switch (e.kind) {
    case 'var':
      return e.name;
    case 'const':
      return String(e.value);
    case 'missing':
      return '?';
    case 'not':
      return level(e.arg) === 4 ? `${exprText(e.arg, dot)}'` : `(${exprText(e.arg, dot)})'`;
    case 'and':
      return e.args
        .map((a) => (level(a) < 3 ? `(${exprText(a, dot)})` : exprText(a, dot)))
        .reduce((text, part) => (text === '' ? part : dot || (/[A-Za-z0-9]$/.test(text) && /^[0-9]/.test(part)) ? `${text}·${part}` : text + part), '');
    case 'xor':
      return e.args.map((a) => (level(a) < 2 ? `(${exprText(a, dot)})` : exprText(a, dot))).join(' ⊕ ');
    case 'or':
      return e.args.map((a) => exprText(a, dot)).join(' + ');
  }
}

/** 照圖從輸出往回寫；經過 IC 方塊就丟出 ThroughBlock。 */
function reader(d: LogicDiagram) {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w]));
  const pin = (node: LogicNode, i: number): Formula => {
    const w = driver.get(`${node.id}#${i}`);
    return w ? source(w.from, w.fromPin) : { kind: 'missing' };
  };
  // 同一個訊號只建一次（共用的閘是同一個物件，算長度時不用展開）。
  const memo = new Map<string, Formula>();
  const source = (id: string, fromPin?: number): Formula => {
    const key = signalOf(id, fromPin);
    let f = memo.get(key);
    if (!f) memo.set(key, (f = build(id, fromPin)));
    return f;
  };
  const build = (id: string, fromPin?: number): Formula => {
    const node = byId.get(id);
    if (!node) return { kind: 'missing' };
    if (node.kind === 'INPUT') return { kind: 'var', name: node.name ?? node.id };
    if (node.kind === 'HIGH') return { kind: 'const', value: 1 };
    if (node.kind === 'LOW') return { kind: 'const', value: 0 };
    if (node.kind === 'BLOCK') throw new ThroughBlock(`${node.chip ?? 'IC'}（${signalOf(id, fromPin)}）`);
    if (!isGate(node.kind)) return { kind: 'missing' };
    const args = Array.from({ length: inputCountOf(node) }, (_, i) => pin(node, i));
    switch (node.kind) {
      case 'NOT':
        return { kind: 'not', arg: args[0] as Expr };
      case 'AND':
      case 'OR':
      case 'XOR':
        return { kind: node.kind === 'AND' ? 'and' : node.kind === 'OR' ? 'or' : 'xor', args: args as Expr[] };
      case 'NAND':
        return { kind: 'not', arg: { kind: 'and', args: args as Expr[] } };
      case 'NOR':
        return { kind: 'not', arg: { kind: 'or', args: args as Expr[] } };
    }
  };
  return (output: LogicNode) => pin(output, 0);
}

/** 化簡結果寫成式子：沒有項是 0，有一項沒有字母是 1。 */
function sumOfProducts(n: number, ones: number[], names: string[]): Formula {
  const terms = minimize(n, ones, []);
  if (terms.length === 0) return { kind: 'const', value: 0 };
  const products = terms.map((t) => literalsOf(t, names));
  if (products.some((p) => p.length === 0)) return { kind: 'const', value: 1 };
  const factor = (l: { name: string; negated: boolean }): Expr => (l.negated ? { kind: 'not', arg: { kind: 'var', name: l.name } } : { kind: 'var', name: l.name });
  const sum = products.map((p): Expr => (p.length === 1 ? factor(p[0]) : { kind: 'and', args: p.map(factor) }));
  return sum.length === 1 ? sum[0] : { kind: 'or', args: sum };
}

/** 每個輸出端（依名稱排序）的兩種式子；displays：圖上有 7 段顯示器（不列式子）。 */
export function diagramFormulas(d: LogicDiagram): { outputs: OutputFormula[]; displays: boolean } {
  const { inputs, outputs: sinks } = sortedIo(d);
  const displays = sinks.some((n) => n.kind === 'DISPLAY');
  const outputs = sinks.filter((n) => n.kind === 'OUTPUT');
  const base = (n: LogicNode) => ({ id: n.id, name: n.name ?? n.id });
  if (topoOrder(d).loop) {
    const problem = '邏輯圖有迴圈，寫不出布林式';
    return { outputs: outputs.map((n) => ({ ...base(n), read: null, readProblem: problem, simplified: null, simplifiedProblem: problem })), displays };
  }
  const dot = needsDot(inputs.map((n) => n.name ?? n.id));
  const read = reader(d);
  const counted = new Map<Formula, number>();
  const table = truthTable(d);
  return {
    displays,
    outputs: outputs.map((n): OutputFormula => {
      const f: OutputFormula = { ...base(n), read: null, simplified: null };
      try {
        const e = read(n);
        if (letterCount(e, counted) > MAX_FORMULA_LETTERS) f.readProblem = `照圖寫出來超過 ${MAX_FORMULA_LETTERS} 個字母，太長不列出`;
        else f.read = exprText(e, dot);
      } catch (err) {
        if (!(err instanceof ThroughBlock)) throw err;
        f.readProblem = `經過 IC 方塊 ${err.message}，照圖寫不出布林式`;
      }
      if (!table.ok) {
        f.simplifiedProblem = table.reason === 'too-many' ? '輸入超過 8 個，真值表太長，不化簡' : '算不出真值表';
        return f;
      }
      const k = sinks.indexOf(n);
      const column = table.rows.map((r) => r.out[k]);
      if (column.some((v) => v !== 0 && v !== 1)) {
        f.simplifiedProblem = '有輸入沒接，化簡不出來';
        return f;
      }
      const ones = column.flatMap((v, r) => (v === 1 ? [r] : []));
      f.simplified = exprText(sumOfProducts(table.inputs.length, ones, table.inputs), dot);
      return f;
    }),
  };
}
