import { inputCountOf, overlaps } from './shapes';
import { isGate, type GateKind, type LogicDiagram, type LogicNode, type NodeKind } from './types';

export type EditResult = { ok: true; diagram: LogicDiagram; id?: string } | { ok: false; diagram: LogicDiagram; reason: string };

const fail = (diagram: LogicDiagram, reason: string): EditResult => ({ ok: false, diagram, reason });
const PREFIX: Record<'gate' | 'INPUT' | 'OUTPUT', string> = { gate: 'g', INPUT: 'i', OUTPUT: 'o' };
const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
const OUTPUT_NAMES = ['X', 'Y', 'Z', 'W', 'V', 'U', 'T', 'S', 'R', 'Q', 'P'];
const INPUT_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function nextNodeId(d: LogicDiagram, kind: NodeKind): string {
  const prefix = PREFIX[isGate(kind) ? 'gate' : kind];
  const used = new Set(d.nodes.map((n) => n.id));
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

function nextWireId(d: LogicDiagram): string {
  const used = new Set(d.wires.map((w) => w.id));
  for (let i = 1; ; i++) if (!used.has(`w${i}`)) return `w${i}`;
}

export function defaultName(d: LogicDiagram, kind: 'INPUT' | 'OUTPUT'): string {
  const used = new Set(d.nodes.map((n) => n.name));
  const pool = kind === 'INPUT' ? INPUT_NAMES : [...OUTPUT_NAMES, ...INPUT_NAMES];
  const free = pool.find((n) => !used.has(n));
  if (free) return free;
  for (let i = 1; ; i++) if (!used.has(`${pool[0]}${i}`)) return `${pool[0]}${i}`;
}

export function canPlace(d: LogicDiagram, node: LogicNode, ignoreId?: string): boolean {
  return d.nodes.every((n) => n.id === ignoreId || n.id === node.id || !overlaps(n, node));
}

function defaultInputs(kind: GateKind): number {
  return kind === 'NOT' ? 1 : 2;
}

export function addNode(d: LogicDiagram, kind: NodeKind, x: number, y: number): EditResult {
  const id = nextNodeId(d, kind);
  const node: LogicNode =
    kind === 'INPUT'
      ? { id, kind, x, y, name: defaultName(d, 'INPUT'), value: 0 }
      : kind === 'OUTPUT'
        ? { id, kind, x, y, name: defaultName(d, 'OUTPUT') }
        : { id, kind, x, y, inputs: defaultInputs(kind) };
  if (!canPlace(d, node)) return fail(d, '這裡已經有元件了');
  return { ok: true, diagram: { ...d, nodes: [...d.nodes, node] }, id };
}

function replaceNode(d: LogicDiagram, node: LogicNode): LogicDiagram {
  return { ...d, nodes: d.nodes.map((n) => (n.id === node.id ? node : n)) };
}

export function moveNode(d: LogicDiagram, id: string, x: number, y: number): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node) return fail(d, '找不到元件');
  if (node.x === x && node.y === y) return { ok: true, diagram: d };
  const moved = { ...node, x, y };
  if (!canPlace(d, moved)) return fail(d, '這裡已經有元件了');
  return { ok: true, diagram: replaceNode(d, moved) };
}

export function removeNodes(d: LogicDiagram, ids: string[]): LogicDiagram {
  const gone = new Set(ids);
  return { ...d, nodes: d.nodes.filter((n) => !gone.has(n.id)), wires: d.wires.filter((w) => !gone.has(w.from) && !gone.has(w.to.node)) };
}

export function removeWire(d: LogicDiagram, id: string): LogicDiagram {
  return { ...d, wires: d.wires.filter((w) => w.id !== id) };
}

export function connect(d: LogicDiagram, from: string, to: { node: string; pin: number }): EditResult {
  const source = d.nodes.find((n) => n.id === from);
  const target = d.nodes.find((n) => n.id === to.node);
  if (!source || !target) return fail(d, '找不到元件');
  if (source.kind === 'OUTPUT') return fail(d, '輸出端沒有可以接出去的腳');
  if (target.kind === 'INPUT') return fail(d, '輸入端沒有可以接進來的腳');
  if (source.id === target.id) return fail(d, '不能把自己的輸出接回自己的輸入');
  if (!Number.isInteger(to.pin) || to.pin < 0 || to.pin >= inputCountOf(target)) return fail(d, '沒有這個輸入腳');
  const kept = d.wires.filter((w) => !(w.to.node === to.node && w.to.pin === to.pin));
  if (kept.length !== d.wires.length && d.wires.some((w) => w.to.node === to.node && w.to.pin === to.pin && w.from === from)) return { ok: true, diagram: d };
  const wire = { id: nextWireId({ ...d, wires: kept }), from, to: { node: to.node, pin: to.pin } };
  return { ok: true, diagram: { ...d, wires: [...kept, wire] }, id: wire.id };
}

function withInputs(d: LogicDiagram, node: LogicNode, n: number, reason: string): EditResult {
  const changed = { ...node, inputs: n };
  if (!canPlace(d, changed)) return fail(d, reason);
  const next = replaceNode(d, changed);
  return { ok: true, diagram: { ...next, wires: next.wires.filter((w) => w.to.node !== node.id || w.to.pin < n) } };
}

export function setGateKind(d: LogicDiagram, id: string, kind: GateKind): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node || !isGate(node.kind)) return fail(d, '只有邏輯閘可以換種類');
  const n = kind === 'NOT' ? 1 : kind === 'XOR' ? 2 : node.kind === 'NOT' || node.kind === 'XOR' ? 2 : (node.inputs ?? 2);
  return withInputs(d, { ...node, kind }, n, `改成 ${kind} 會和旁邊的元件重疊`);
}

export function setInputCount(d: LogicDiagram, id: string, n: number): EditResult {
  const node = d.nodes.find((x) => x.id === id);
  if (!node || !isGate(node.kind) || node.kind === 'NOT' || node.kind === 'XOR') return fail(d, '這個元件不能改輸入數');
  if (!Number.isInteger(n) || n < 2 || n > 4) return fail(d, '輸入數只能是 2、3、4');
  return withInputs(d, node, n, `改成 ${n} 個輸入會和旁邊的元件重疊`);
}

export function renameNode(d: LogicDiagram, id: string, raw: string): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node || isGate(node.kind)) return fail(d, '只有輸入端、輸出端有名稱');
  const name = raw.trim();
  if (!NAME_RULE.test(name)) return fail(d, '名稱要用英文字母開頭，只能有英文字母、數字、底線，最多 8 個字');
  if (d.nodes.some((n) => n.id !== id && n.name === name)) return fail(d, `名稱 ${name} 已經用過了`);
  return { ok: true, diagram: replaceNode(d, { ...node, name }) };
}

export function setInputValue(d: LogicDiagram, id: string, value: 0 | 1): LogicDiagram {
  const node = d.nodes.find((n) => n.id === id);
  return node && node.kind === 'INPUT' && node.value !== value ? replaceNode(d, { ...node, value }) : d;
}
