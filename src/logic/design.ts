import { literalsOf, minimize, type Term } from './minimize';
import { nodeSize, outputPin } from './shapes';
import { rowsWith, type TruthTask } from './task';
import type { LogicDiagram, LogicNode, LogicWire, NodeKind } from './types';

/** 閘最多幾個輸入（編輯器的限制）。 */
const MAX_GATE_INPUTS = 4;

/**
 * 規格（2026-10-17 task-to-diagram）第 3 節：照每個輸出化簡後的積項和，畫出兩層 AND–OR 邏輯圖。
 * NOT 與相同的積項在各輸出之間共用；超過 4 個輸入的閘改用好幾個閘串起來；常數輸出接 5V / GND。
 */
export function designFromTask(task: TruthTask): { diagram: LogicDiagram; terms: Term[][] } {
  const n = task.inputs.length;
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
  /** 很多個訊號合成一個（AND 或 OR）：每次拿前 4 個做一個閘、輸出排到最後，直到剩 4 個以內。 */
  const combine = (kind: 'AND' | 'OR', sources: string[]): string => {
    const queue = [...sources];
    while (queue.length > MAX_GATE_INPUTS) queue.push(gate(kind, queue.splice(0, MAX_GATE_INPUTS)));
    return queue.length === 1 ? queue[0] : gate(kind, queue);
  };

  const inputs = task.inputs.map((name) => add('i', { kind: 'INPUT', name, value: 0 }));
  const nots = new Map<number, string>();
  const literal = (name: string, negated: boolean): string => {
    const i = task.inputs.indexOf(name);
    if (!negated) return inputs[i];
    if (!nots.has(i)) nots.set(i, gate('NOT', [inputs[i]]));
    return nots.get(i)!;
  };
  const products = new Map<string, string>();
  const product = (t: Term): string => {
    const key = `${t.mask}:${t.value}`;
    if (!products.has(key)) products.set(key, combine('AND', literalsOf(t, task.inputs).map((l) => literal(l.name, l.negated))));
    return products.get(key)!;
  };
  const constants = new Map<'HIGH' | 'LOW', string>();
  const constant = (kind: 'HIGH' | 'LOW') => {
    if (!constants.has(kind)) constants.set(kind, add('k', { kind }));
    return constants.get(kind)!;
  };

  const terms = task.outputs.map((_, k) => minimize(n, rowsWith(task, k, 1), rowsWith(task, k, 'X')));
  task.outputs.forEach((name, k) => {
    const ts = terms[k];
    const source = ts.length === 0 ? constant('LOW') : ts.some((t) => literalsOf(t, task.inputs).length === 0) ? constant('HIGH') : combine('OR', ts.map(product));
    connect(source, add('o', { kind: 'OUTPUT', name }), 0);
  });

  return { diagram: { version: 1, nodes: layout(nodes, wires), wires, task }, terms };
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
    const d = kind === 'INPUT' || kind === 'HIGH' || kind === 'LOW' ? 0 : kind === 'NOT' ? 1 : Math.max(2, 1 + Math.max(...driversOf(id).map(depthOf)));
    depth.set(id, d);
    return d;
  };
  const inner = nodes.filter((nd) => nd.kind !== 'OUTPUT').map((nd) => depthOf(nd.id));
  const last = Math.max(...inner) + 1;
  for (const nd of nodes) if (nd.kind === 'OUTPUT') depth.set(nd.id, last);
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
        // 輸出腳（輸出端是輸入腳）在元件裡的高度：閘在中間，其他在最上面。
        const offset = nd.kind === 'OUTPUT' ? 0 : outputPin({ ...nd, x: 0, y: 0 })!.y;
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
