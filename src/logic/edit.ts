import { isBlockChip } from './blocks';
import { inputCountOf, nodeSize, outputCountOf, overlaps } from './shapes';
import { isGate, isSink, type BlockChip, type GateKind, type LogicDiagram, type LogicNode, type LogicWire, type NodeKind } from './types';

export type EditResult = { ok: true; diagram: LogicDiagram; id?: string } | { ok: false; diagram: LogicDiagram; reason: string };

const fail = (diagram: LogicDiagram, reason: string): EditResult => ({ ok: false, diagram, reason });
const PREFIX: Record<'gate' | 'INPUT' | 'OUTPUT' | 'DISPLAY' | 'HIGH' | 'LOW' | 'BLOCK', string> = { gate: 'g', INPUT: 'i', OUTPUT: 'o', DISPLAY: 'd', HIGH: 'k', LOW: 'k', BLOCK: 'b' };
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

export function defaultName(d: LogicDiagram, kind: 'INPUT' | 'OUTPUT' | 'DISPLAY'): string {
  const used = new Set(d.nodes.map((n) => n.name));
  if (kind === 'DISPLAY') for (let i = 1; ; i++) if (!used.has(`S${i}`)) return `S${i}`;
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

export function addNode(d: LogicDiagram, kind: NodeKind, x: number, y: number, chip?: BlockChip): EditResult {
  const id = nextNodeId(d, kind);
  if (kind === 'BLOCK' && !isBlockChip(chip)) return fail(d, '要指定哪一顆 IC');
  const node: LogicNode =
    kind === 'BLOCK'
      ? { id, kind, x, y, chip }
      : kind === 'HIGH' || kind === 'LOW'
        ? { id, kind, x, y }
        : kind === 'INPUT'
      ? { id, kind, x, y, name: defaultName(d, 'INPUT'), value: 0 }
      : kind === 'OUTPUT' || kind === 'DISPLAY'
        ? { id, kind, x, y, name: defaultName(d, kind) }
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

export function connect(d: LogicDiagram, from: string, to: { node: string; pin: number }, fromPin = 0): EditResult {
  const source = d.nodes.find((n) => n.id === from);
  const target = d.nodes.find((n) => n.id === to.node);
  if (!source || !target) return fail(d, '找不到元件');
  if (source.kind === 'OUTPUT') return fail(d, '輸出端沒有可以接出去的腳');
  if (source.kind === 'DISPLAY') return fail(d, '顯示器沒有可以接出去的腳');
  if (!Number.isInteger(fromPin) || fromPin < 0 || fromPin >= outputCountOf(source)) return fail(d, '沒有這個輸出腳');
  if (target.kind === 'INPUT') return fail(d, '輸入端沒有可以接進來的腳');
  if (source.id === target.id) return fail(d, '不能把自己的輸出接回自己的輸入');
  if (!Number.isInteger(to.pin) || to.pin < 0 || to.pin >= inputCountOf(target)) return fail(d, '沒有這個輸入腳');
  const kept = d.wires.filter((w) => !(w.to.node === to.node && w.to.pin === to.pin));
  if (kept.length !== d.wires.length && d.wires.some((w) => w.to.node === to.node && w.to.pin === to.pin && w.from === from && (w.fromPin ?? 0) === fromPin)) return { ok: true, diagram: d };
  const wire: LogicWire = { id: nextWireId({ ...d, wires: kept }), from, ...(fromPin > 0 ? { fromPin } : {}), to: { node: to.node, pin: to.pin } };
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
  if (!node || isGate(node.kind)) return fail(d, '只有輸入端、輸出端、顯示器有名稱');
  const name = raw.trim();
  if (!NAME_RULE.test(name)) return fail(d, '名稱要用英文字母開頭，只能有英文字母、數字、底線，最多 8 個字');
  if (d.nodes.some((n) => n.id !== id && n.name === name)) return fail(d, `名稱 ${name} 已經用過了`);
  return { ok: true, diagram: replaceNode(d, { ...node, name }) };
}

/** 子專案 21：5V 與 GND 互換。 */
export function setConstant(d: LogicDiagram, id: string, kind: 'HIGH' | 'LOW'): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node || (node.kind !== 'HIGH' && node.kind !== 'LOW')) return fail(d, '只有 5V、GND 可以切換');
  return { ok: true, diagram: node.kind === kind ? d : replaceNode(d, { ...node, kind }) };
}

export function setInputValue(d: LogicDiagram, id: string, value: 0 | 1): LogicDiagram {
  const node = d.nodes.find((n) => n.id === id);
  return node && node.kind === 'INPUT' && node.value !== value ? replaceNode(d, { ...node, value }) : d;
}

// ---------- 子專案 15：多個元件一起移動、框選、複製貼上 ----------

/** 一起移動 ids 這些元件；任何一個會和其他（沒有一起移動的）元件重疊時整組不動。 */
export function moveNodes(d: LogicDiagram, ids: string[], dx: number, dy: number): EditResult {
  if (dx === 0 && dy === 0) return { ok: true, diagram: d };
  const moving = new Set(ids);
  const moved = d.nodes.map((n) => (moving.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
  const still = moved.filter((n) => !moving.has(n.id));
  for (const n of moved) {
    if (moving.has(n.id) && still.some((o) => overlaps(n, o))) return fail(d, '這裡已經有元件了');
  }
  return { ok: true, diagram: { ...d, nodes: moved } };
}

/** 框（格子座標）裡的元件：元件的方框和框有重疊就算。依圖上的順序。 */
export function nodesInRect(d: LogicDiagram, r: { x: number; y: number; w: number; h: number }): string[] {
  return d.nodes
    .filter((n) => {
      const s = nodeSize(n);
      return n.x < r.x + r.w && r.x < n.x + s.w && n.y < r.y + r.h && r.y < n.y + s.h;
    })
    .map((n) => n.id);
}

export interface LogicClipboard {
  nodes: LogicNode[];
  wires: LogicWire[];
}

/** 複製選取的元件，以及兩端都在選取範圍裡的線。 */
export function copyNodes(d: LogicDiagram, ids: string[]): LogicClipboard {
  const picked = new Set(ids);
  return {
    nodes: d.nodes.filter((n) => picked.has(n.id)).map((n) => ({ ...n })),
    wires: d.wires.filter((w) => picked.has(w.from) && picked.has(w.to.node)).map((w) => ({ ...w, to: { ...w.to } })),
  };
}

/** 貼上：新的 ID、名稱重複時換成還沒用過的；往右下偏移 2 格，放不下就再偏移（最多 20 次）。ids 是新貼上的元件。 */
export function pasteNodes(d: LogicDiagram, clip: LogicClipboard): { ok: true; diagram: LogicDiagram; ids: string[] } | { ok: false; diagram: LogicDiagram; reason: string } {
  if (clip.nodes.length === 0) return { ok: false, diagram: d, reason: '沒有複製任何元件' };
  for (let k = 1; k <= 20; k++) {
    const shifted = clip.nodes.map((n) => ({ ...n, x: n.x + 2 * k, y: n.y + 2 * k }));
    if (!shifted.every((n) => d.nodes.every((o) => !overlaps(n, o)))) continue;
    let next = d;
    const idMap = new Map<string, string>();
    for (const n of shifted) {
      const id = nextNodeId(next, n.kind);
      idMap.set(n.id, id);
      const node: LogicNode = { ...n, id };
      if (n.kind === 'INPUT' || n.kind === 'OUTPUT' || n.kind === 'DISPLAY') {
        const taken = next.nodes.some((o) => o.name === n.name);
        node.name = taken || !n.name ? defaultName(next, n.kind) : n.name;
      }
      next = { ...next, nodes: [...next.nodes, node] };
    }
    for (const w of clip.wires) {
      const r = connect(next, idMap.get(w.from)!, { node: idMap.get(w.to.node)!, pin: w.to.pin }, w.fromPin ?? 0);
      if (r.ok) next = r.diagram;
    }
    return { ok: true, diagram: next, ids: [...idMap.values()] };
  }
  return { ok: false, diagram: d, reason: '附近沒有空位可以貼上' };
}
