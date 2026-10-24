import { isBlockChip, isSequentialChip } from './blocks';
import { inputCountOf, outputCountOf, overlaps } from './shapes';
import { parseLogicNotes } from './notes';
import { parseTask } from './task';
import { canRotate, isGate, isSink, type LogicDiagram, type LogicNode, type LogicWire, type NodeKind, type Rotation } from './types';

const KINDS: NodeKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'INPUT', 'OUTPUT', 'DISPLAY', 'HIGH', 'LOW', 'BLOCK', 'CLOCK'];
const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

class LogicFormatError extends Error {}
const fail = (msg: string): never => {
  throw new LogicFormatError(msg);
};

function parseNode(raw: unknown, i: number): LogicNode {
  if (!isObj(raw)) fail(`第 ${i + 1} 個元件格式不對`);
  const n = raw as Obj;
  if (typeof n.id !== 'string' || !n.id) fail(`第 ${i + 1} 個元件沒有 id`);
  if (!KINDS.includes(n.kind as NodeKind)) fail(`元件 ${String(n.id)} 的種類 ${String(n.kind)} 不認得`);
  if (!isInt(n.x) || !isInt(n.y)) fail(`元件 ${String(n.id)} 的位置要是整數`);
  const node: LogicNode = { id: n.id as string, kind: n.kind as NodeKind, x: n.x as number, y: n.y as number };
  if (isGate(node.kind)) {
    const expected = node.kind === 'NOT' ? [1] : node.kind === 'XOR' ? [2] : [2, 3, 4];
    if (!expected.includes(n.inputs as number)) fail(`元件 ${node.id}（${node.kind}）的輸入數 ${String(n.inputs)} 不合法`);
    node.inputs = n.inputs as number;
  } else if (node.kind === 'BLOCK') {
    if (!isBlockChip(n.chip)) fail(`元件 ${node.id} 的 IC ${String(n.chip)} 不認得`);
    node.chip = n.chip as LogicNode['chip'];
  } else if (node.kind !== 'HIGH' && node.kind !== 'LOW') {
    if (typeof n.name !== 'string' || !NAME_RULE.test(n.name)) fail(`元件 ${node.id} 的名稱 ${String(n.name)} 不合法`);
    node.name = n.name as string;
    if (node.kind === 'INPUT') node.value = n.value === 1 ? 1 : 0;
    // 子專案 46：時脈存檔時一定是 0（脈衝送完就回到 0）。
    if (node.kind === 'CLOCK') node.value = 0;
  }
  // 子專案 26：轉向（0 不寫）；子專案 28：鏡射（不鏡射不寫）。
  if (n.rotation !== undefined && n.rotation !== 0) {
    if (![90, 180, 270].includes(n.rotation as number)) fail(`元件 ${node.id} 的方向 ${String(n.rotation)} 不合法（只能是 0、90、180、270）`);
    if (!canRotate(node.kind)) fail(`元件 ${node.id}（${node.kind}）不能轉向`);
    node.rotation = n.rotation as Rotation;
  }
  // 子專案 32：每段直接控制的顯示器。
  if (n.segments === true) {
    if (node.kind !== 'DISPLAY') fail(`元件 ${node.id} 不是顯示器，不能每段直接控制`);
    node.segments = true;
  }
  // 子專案 37：低態致動的輸出端。
  if (n.activeLow !== undefined && n.activeLow !== false) {
    if (n.activeLow !== true) fail(`元件 ${node.id} 的低態致動要是 true 或不寫`);
    if (node.kind !== 'OUTPUT') fail(`元件 ${node.id} 不是輸出端，不能設成低態致動`);
    node.activeLow = true;
  }
  if (n.flip !== undefined && n.flip !== false) {
    if (n.flip !== true) fail(`元件 ${node.id} 的鏡射要是 true 或不寫`);
    if (!canRotate(node.kind)) fail(`元件 ${node.id}（${node.kind}）不能轉向`);
    node.flip = true;
  }
  return node;
}

function parseWire(raw: unknown, i: number, nodes: Map<string, LogicNode>): LogicWire {
  if (!isObj(raw) || !isObj((raw as Obj).to)) fail(`第 ${i + 1} 條線格式不對`);
  const w = raw as Obj;
  const to = w.to as Obj;
  if (typeof w.id !== 'string' || typeof w.from !== 'string' || typeof to.node !== 'string' || !isInt(to.pin)) fail(`第 ${i + 1} 條線格式不對`);
  const source = nodes.get(w.from as string);
  const target = nodes.get(to.node as string);
  if (!source || !target) fail(`線 ${String(w.id)} 接到不存在的元件`);
  // 子專案 46：正反器、計數器可以接回自己（例如 74LS93 的 QA 接 CKB）；時脈不能當終點。
  const selfOk = source === target && target!.kind === 'BLOCK' && isSequentialChip(target!.chip);
  if (isSink(source!.kind) || target!.kind === 'INPUT' || target!.kind === 'CLOCK' || (source === target && !selfOk)) fail(`線 ${String(w.id)} 的方向不對`);
  if ((to.pin as number) < 0 || (to.pin as number) >= inputCountOf(target!)) fail(`線 ${String(w.id)} 接到不存在的輸入腳`);
  const fromPin = w.fromPin === undefined ? 0 : (w.fromPin as number);
  if (!isInt(fromPin) || fromPin < 0 || fromPin >= outputCountOf(source!)) fail(`線 ${String(w.id)} 從不存在的輸出腳接出`);
  return { id: w.id as string, from: w.from as string, ...(fromPin > 0 ? { fromPin } : {}), to: { node: to.node as string, pin: to.pin as number } };
}

/** 規格第 6 節：讀檔時檢查邏輯圖；不合法就整個拒絕並說明原因。 */
export function parseLogicDiagram(raw: unknown): { ok: true; diagram: LogicDiagram } | { ok: false; error: string } {
  try {
    if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.wires)) fail('格式不對');
    const r = raw as Obj;
    const nodes = (r.nodes as unknown[]).map(parseNode);
    const byId = new Map<string, LogicNode>();
    const names = new Set<string>();
    for (const n of nodes) {
      if (byId.has(n.id)) fail(`元件 id ${n.id} 重複`);
      byId.set(n.id, n);
      if (n.name !== undefined) {
        if (names.has(n.name)) fail(`名稱 ${n.name} 重複`);
        names.add(n.name);
      }
    }
    nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => overlaps(a, b) && fail(`元件 ${a.id} 和 ${b.id} 重疊`)));
    if (nodes.filter((n) => n.kind === 'CLOCK').length > 1) fail('一張圖只能有一個時脈');
    const wires = (r.wires as unknown[]).map((w, i) => parseWire(w, i, byId));
    const ids = new Set<string>();
    const pins = new Set<string>();
    for (const w of wires) {
      if (ids.has(w.id)) fail(`線 id ${w.id} 重複`);
      ids.add(w.id);
      const key = `${w.to.node}#${w.to.pin}`;
      if (pins.has(key)) fail(`${w.to.node} 的第 ${w.to.pin + 1} 個輸入接了兩條線`);
      pins.add(key);
    }
    const diagram: LogicDiagram = { version: 1, nodes, wires };
    if (r.task !== undefined) {
      const task = parseTask(r.task);
      if (!task.ok) return { ok: false, error: task.reason };
      diagram.task = task.task;
    }
    // 子專案 29：便條。
    if (r.notes !== undefined) {
      const notes = parseLogicNotes(r.notes, new Set(nodes.map((n) => n.id)));
      if (!notes.ok) return { ok: false, error: notes.reason };
      if (notes.notes.length > 0) diagram.notes = notes.notes;
    }
    return { ok: true, diagram };
  } catch (err) {
    if (err instanceof LogicFormatError) return { ok: false, error: err.message };
    throw err;
  }
}
