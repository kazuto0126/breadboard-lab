import { literalsOf, minimize, minimizePos, sumLiteralsOf, termKey, type Term } from './minimize';
import { inputPins, nodeSize, outputPin } from './shapes';
import { isDisplayOutput, type TaskValue, type TruthTask } from './task';
import type { LogicDiagram, LogicNode, LogicWire, NodeKind } from './types';

/** 閘最多幾個輸入（編輯器的限制）。 */
const MAX_GATE_INPUTS = 4;

/**
 * 子專案 31：產生的形式。積項和（AND–OR，預設）、和積（OR–AND）、只用 NAND（積項和改成 NAND–NAND）、
 * 只用 NOR（和積改成 NOR–NOR）。
 */
export type DesignForm = 'sop' | 'pos' | 'nand' | 'nor';

/** 這種形式用的是和積（化簡 0 的列）嗎。 */
export const usesPos = (form: DesignForm) => form === 'pos' || form === 'nor';

/** 化簡的一欄：一般輸出是一欄；子專案 32：顯示器拆成 A（最低位元）、B、C、D 四欄，名稱寫成「S1.A」。 */
export interface TaskColumn {
  label: string;
  /** 第幾個輸出。 */
  output: number;
  /** 顯示器的第幾個位元（A 是 0）；一般輸出沒有。 */
  bit?: number;
  terms: Term[];
}

const BITS = ['A', 'B', 'C', 'D'];

/** 這一欄在每一列的值（0 / 1 / X）。 */
function columnValues(task: TruthTask, k: number, bit: number | undefined): TaskValue[] {
  return task.rows.map((r) => (r[k] === 'X' || bit === undefined ? r[k] : (r[k] >> bit) & 1));
}

const rowsOf = (values: TaskValue[], value: TaskValue) => values.flatMap((v, i) => (v === value ? [i] : []));

/** 每一欄化簡後的項；和積時是 F' 的積項（見 `minimizePos`）。依序化簡，後面的欄優先用前面用過的項。 */
export function termsOfTask(task: TruthTask, form: DesignForm = 'sop'): TaskColumn[] {
  const n = task.inputs.length;
  const used = new Set<string>();
  const columns = task.outputs.flatMap((name, k): Array<Omit<TaskColumn, 'terms'>> =>
    isDisplayOutput(task, k) ? BITS.map((b, bit) => ({ label: `${name}.${b}`, output: k, bit })) : [{ label: name, output: k }],
  );
  return columns.map((c) => {
    const values = columnValues(task, c.output, c.bit);
    const dc = rowsOf(values, 'X');
    const terms = usesPos(form) ? minimizePos(n, rowsOf(values, 0), dc, used) : minimize(n, rowsOf(values, 1), dc, used);
    for (const t of terms) used.add(termKey(t));
    return { ...c, terms };
  });
}

/**
 * 規格（2026-10-17 task-to-diagram）第 3 節：照每個輸出化簡後的結果畫出兩層的邏輯圖。
 * 反相（NOT）與相同的項在各輸出之間共用；超過 4 個輸入的閘改用好幾個閘串起來；常數輸出接 5V / GND。
 * 子專案 31：可以選形式；只用 NAND / NOR 時，反相也用那種閘（兩個輸入接同一個訊號）。
 * 子專案 32：顯示器的四個位元各自化簡，接到 7 段顯示器的 A–D。
 */
export function designFromTask(task: TruthTask, form: DesignForm = 'sop'): { diagram: LogicDiagram; columns: TaskColumn[] } {
  const nodes: LogicNode[] = [];
  const wires: LogicWire[] = [];
  const counters: Record<string, number> = {};
  const add = (prefix: string, node: Omit<LogicNode, 'id' | 'x' | 'y'>): string => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const id = `${prefix}${counters[prefix]}`;
    nodes.push({ id, x: 0, y: 0, ...node });
    return id;
  };
  const connect = (from: string, to: string, pin: number) => wires.push({ id: `w${wires.length + 1}`, from, to: { node: to, pin } });
  const gate = (kind: NodeKind, sources: string[]): string => {
    const id = add('g', { kind, inputs: sources.length });
    sources.forEach((s, pin) => connect(s, id, pin));
    return id;
  };
  /** 反相：只用 NAND / NOR 時是兩個輸入接在一起的 NAND / NOR，否則是 NOT。 */
  const invert = (s: string) => (form === 'nand' ? gate('NAND', [s, s]) : form === 'nor' ? gate('NOR', [s, s]) : gate('NOT', [s]));
  /** 很多個訊號合成一個（AND 或 OR）：每次拿前 4 個做一個閘、輸出排到最後，直到剩 4 個以內。 */
  const combine = (kind: 'AND' | 'OR', sources: string[]): string => {
    const queue = [...sources];
    while (queue.length > MAX_GATE_INPUTS) queue.push(gate(kind, queue.splice(0, MAX_GATE_INPUTS)));
    return queue.length === 1 ? queue[0] : gate(kind, queue);
  };
  /**
   * 很多個訊號的 NAND（或 NOR）：超過 4 個時，每 4 個先做一個 NAND 再反相（= 那 4 個的 AND），排到最後再一起 NAND
   * （NOR 時是先做 OR）。至少要有 2 個訊號。
   */
  const negated = (kind: 'NAND' | 'NOR', sources: string[]): string => {
    const queue = [...sources];
    while (queue.length > MAX_GATE_INPUTS) queue.push(invert(gate(kind, queue.splice(0, MAX_GATE_INPUTS))));
    return gate(kind, queue);
  };

  const inputs = task.inputs.map((name) => add('i', { kind: 'INPUT', name, value: 0 }));
  const inverted = new Map<number, string>();
  const literal = (name: string, neg: boolean): string => {
    const i = task.inputs.indexOf(name);
    if (!neg) return inputs[i];
    if (!inverted.has(i)) inverted.set(i, invert(inputs[i]));
    return inverted.get(i)!;
  };
  const made = new Map<string, string>();
  const once = (t: Term, build: () => string) => {
    const key = termKey(t);
    if (!made.has(key)) made.set(key, build());
    return made.get(key)!;
  };
  const constants = new Map<'HIGH' | 'LOW', string>();
  const constant = (kind: 'HIGH' | 'LOW') => {
    if (!constants.has(kind)) constants.set(kind, add('k', { kind }));
    return constants.get(kind)!;
  };

  const names = task.inputs;
  const pos = usesPos(form);
  // 每一項的字母：積項和是積項的字母；和積是「和」的字母（F' 的積項反過來）。
  const letters = (t: Term) => (pos ? sumLiteralsOf(t, names) : literalsOf(t, names));
  const columns = termsOfTask(task, form);
  const sourceOf = (ts: Term[]): string => {
    let source: string;
    if (ts.length === 0) source = constant(pos ? 'HIGH' : 'LOW');
    else if (ts.some((t) => letters(t).length === 0)) source = constant(pos ? 'LOW' : 'HIGH');
    else if (form === 'sop' || form === 'pos') {
      const inner = form === 'sop' ? 'AND' : 'OR';
      source = combine(form === 'sop' ? 'OR' : 'AND', ts.map((t) => once(t, () => combine(inner, letters(t).map((l) => literal(l.name, l.negated))))));
    } else {
      // NAND–NAND（NOR–NOR）：每一項做成 NAND（NOR），只有一個字母的項直接用反過來的字母；最後再 NAND（NOR）一次。
      const kind = form === 'nand' ? 'NAND' : 'NOR';
      const inverse = (t: Term) =>
        once(t, () => {
          const ls = letters(t);
          return ls.length === 1 ? literal(ls[0].name, !ls[0].negated) : negated(kind, ls.map((l) => literal(l.name, l.negated)));
        });
      if (ts.length > 1) source = negated(kind, ts.map(inverse));
      else {
        const ls = letters(ts[0]);
        source = ls.length === 1 ? literal(ls[0].name, ls[0].negated) : invert(inverse(ts[0]));
      }
    }
    return source;
  };
  task.outputs.forEach((name, k) => {
    const mine = columns.filter((c) => c.output === k);
    if (!isDisplayOutput(task, k)) {
      connect(sourceOf(mine[0].terms), add('o', { kind: 'OUTPUT', name }), 0);
      return;
    }
    // 先算出四個位元，再放顯示器（A 接第 0 腳 … D 接第 3 腳）。
    const sources = mine.map((c) => sourceOf(c.terms));
    const display = add('o', { kind: 'DISPLAY', name, inputs: 5 });
    sources.forEach((s, bit) => connect(s, display, bit));
  });

  return { diagram: { version: 1, nodes: layout(nodes, wires), wires, task }, columns };
}

/**
 * 規格第 1 節的版面：依層分欄（輸入端與常數、NOT、各層的閘、輸出端），欄與欄之間留出匯流線的位置；
 * 每欄依前面接過來的線的位置排序並對齊，元件之間空一格。
 */
function layout(nodes: LogicNode[], wires: LogicWire[]): LogicNode[] {
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const driversOf = (id: string) => wires.filter((w) => w.to.node === id).map((w) => w.from);
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const kind = byId.get(id)!.kind;
    const from = driversOf(id);
    // 子專案 31：兩個輸入接同一個輸入端的 NAND / NOR 是反相器，和 NOT 放在同一欄。
    const inverter = kind === 'NOT' || ((kind === 'NAND' || kind === 'NOR') && from.length === 2 && from[0] === from[1] && byId.get(from[0])?.kind === 'INPUT');
    const d = kind === 'INPUT' || kind === 'HIGH' || kind === 'LOW' ? 0 : inverter ? 1 : Math.max(2, 1 + Math.max(...from.map(depthOf)));
    depth.set(id, d);
    return d;
  };
  const sink = (nd: LogicNode) => nd.kind === 'OUTPUT' || nd.kind === 'DISPLAY';
  const inner = nodes.filter((nd) => !sink(nd)).map((nd) => depthOf(nd.id));
  const last = Math.max(...inner) + 1;
  for (const nd of nodes) if (sink(nd)) depth.set(nd.id, last);
  // 空的層（例如沒有 NOT）不佔一欄。
  const levels = [...new Set(depth.values())].sort((a, b) => a - b);
  const columns = levels.map((level) => nodes.filter((nd) => depth.get(nd.id) === level));

  const placed = new Map<string, LogicNode>();
  let x = 0;
  columns.forEach((column, c) => {
    let order = column;
    if (c > 0) {
      // 依前面接過來的線（輸出腳）的平均高度排序，再盡量對齊。
      const bary = (nd: LogicNode) => {
        const ys = driversOf(nd.id).map((from) => outputPin(placed.get(from)!)!.y);
        return ys.reduce((s, y) => s + y, 0) / ys.length;
      };
      order = column.map((nd, i) => ({ nd, i, b: bary(nd) })).sort((a, b) => a.b - b.b || a.i - b.i).map((e) => e.nd);
    }
    let cursor = 0;
    for (const nd of order) {
      const { h } = nodeSize(nd);
      let y: number;
      if (c === 0) y = cursor;
      else {
        // 輸出腳（輸出端是輸入腳）在元件裡的高度：閘在中間，其他在最上面；顯示器是 A–D 腳的中間。
        const pins = inputPins({ ...nd, x: 0, y: 0 });
        const offset = nd.kind === 'OUTPUT' ? 0 : nd.kind === 'DISPLAY' ? (pins[0].y + pins[3].y) / 2 : outputPin({ ...nd, x: 0, y: 0 })!.y;
        const ys = driversOf(nd.id).map((from) => outputPin(placed.get(from)!)!.y);
        y = Math.max(cursor, Math.round(ys.reduce((s, v) => s + v, 0) / ys.length - offset));
      }
      placed.set(nd.id, { ...nd, x, y });
      cursor = y + h + 1;
    }
    // 下一欄：這欄最寬的元件 + 1 格 + 每個用到的輸出各一條匯流線 + 2 格空隙。
    const width = Math.max(...column.map((nd) => nodeSize(nd).w));
    const sources = column.filter((nd) => wires.some((w) => w.from === nd.id)).length;
    x += width + 1 + sources + 2;
  });
  return nodes.map((nd) => placed.get(nd.id)!);
}
