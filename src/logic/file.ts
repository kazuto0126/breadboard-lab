import { isBlockChip, isSequentialChip } from './blocks';
import { inputCountOf, outputCountOf, overlaps } from './shapes';
import { parseLogicNotes } from './notes';
import { parseStateTask } from './stateTask';
import { parseTask } from './task';
import { usesItself } from './flatten';
import { MAX_CLOCKS, canRotate, type CustomBlock, isGate, isSink, type LogicDiagram, type LogicNode, type LogicWire, type NodeKind, type Rotation } from './types';

const KINDS: NodeKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'INPUT', 'OUTPUT', 'DISPLAY', 'HIGH', 'LOW', 'BLOCK', 'CLOCK', 'CUSTOM'];
/** 子專案 65：方塊 id → 腳數。 */
type BlockPins = Map<string, { inputs: number; outputs: number }>;
const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

class LogicFormatError extends Error {}
const fail = (msg: string): never => {
  throw new LogicFormatError(msg);
};

function parseNode(raw: unknown, i: number, blocks: BlockPins): LogicNode {
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
  } else if (node.kind === 'CUSTOM') {
    // 子專案 65：自訂方塊；腳數照定義（不看檔案裡寫的）。
    const pins = typeof n.block === 'string' ? blocks.get(n.block) : undefined;
    if (!pins) fail(`元件 ${node.id} 用到不存在的自訂方塊 ${String(n.block)}`);
    node.block = n.block as string;
    node.inputs = pins!.inputs;
    node.outputs = pins!.outputs;
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
  const selfOk = source === target && ((target!.kind === 'BLOCK' && isSequentialChip(target!.chip)) || target!.kind === 'CUSTOM');
  if (isSink(source!.kind) || target!.kind === 'INPUT' || target!.kind === 'CLOCK' || (source === target && !selfOk)) fail(`線 ${String(w.id)} 的方向不對`);
  if ((to.pin as number) < 0 || (to.pin as number) >= inputCountOf(target!)) fail(`線 ${String(w.id)} 接到不存在的輸入腳`);
  const fromPin = w.fromPin === undefined ? 0 : (w.fromPin as number);
  if (!isInt(fromPin) || fromPin < 0 || fromPin >= outputCountOf(source!)) fail(`線 ${String(w.id)} 從不存在的輸出腳接出`);
  return { id: w.id as string, from: w.from as string, ...(fromPin > 0 ? { fromPin } : {}), to: { node: to.node as string, pin: to.pin as number } };
}

/** 一張圖（主圖或方塊裡面）的元件與線；where 加在錯誤說明前面。 */
function parseGraph(rawNodes: unknown[], rawWires: unknown[], blocks: BlockPins, where = ''): { nodes: LogicNode[]; wires: LogicWire[] } {
  try {
    const r = { wires: rawWires };
    const nodes = rawNodes.map((n, i) => parseNode(n, i, blocks));
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
      if (nodes.filter((n) => n.kind === 'CLOCK').length > MAX_CLOCKS) fail(`一張圖最多 ${MAX_CLOCKS} 個時脈`);
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
    return { nodes, wires };
  } catch (err) {
    if (err instanceof LogicFormatError && where) fail(where + err.message);
    throw err;
  }
}

/** 子專案 65：自訂方塊的定義（id、名稱不重複，名稱照輸入端的規則）；內容在 parseGraph 檢查。 */
function parseBlocks(raw: unknown): Array<{ id: string; name: string; nodes: unknown[]; wires: unknown[] }> {
  if (!Array.isArray(raw)) fail('blocks 要是陣列');
  const ids = new Set<string>();
  const names = new Set<string>();
  return (raw as unknown[]).map((b, i) => {
    if (!isObj(b) || typeof b.id !== 'string' || !b.id || !Array.isArray(b.nodes) || !Array.isArray(b.wires)) fail(`第 ${i + 1} 個自訂方塊格式不對`);
    const o = b as Obj;
    if (typeof o.name !== 'string' || !NAME_RULE.test(o.name)) fail(`自訂方塊 ${String(o.id)} 的名稱 ${String(o.name)} 不合法`);
    if (ids.has(o.id as string)) fail(`自訂方塊 id ${String(o.id)} 重複`);
    if (names.has(o.name as string)) fail(`自訂方塊名稱 ${String(o.name)} 重複`);
    ids.add(o.id as string);
    names.add(o.name as string);
    return { id: o.id as string, name: o.name as string, nodes: o.nodes as unknown[], wires: o.wires as unknown[] };
  });
}

/** 規格第 6 節：讀檔時檢查邏輯圖；不合法就整個拒絕並說明原因。 */
export function parseLogicDiagram(raw: unknown): { ok: true; diagram: LogicDiagram } | { ok: false; error: string } {
  try {
    if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.wires)) fail('格式不對');
    const r = raw as Obj;
    // 子專案 65：自訂方塊的定義（先算每個方塊的腳數；裡面可以用其他方塊）。
    const blocks = r.blocks === undefined ? [] : parseBlocks(r.blocks);
    const pins: BlockPins = new Map(blocks.map((b) => [b.id, { inputs: b.nodes.filter((n) => isObj(n) && n.kind === 'INPUT').length, outputs: b.nodes.filter((n) => isObj(n) && n.kind === 'OUTPUT').length }]));
    const { nodes, wires } = parseGraph(r.nodes as unknown[], r.wires as unknown[], pins);
    const parsed: CustomBlock[] = blocks.map((b) => {
      const inner = parseGraph(b.nodes, b.wires, pins, `方塊 ${b.name}：`);
      if (inner.nodes.some((n) => n.kind === 'CLOCK' || n.kind === 'DISPLAY')) fail(`方塊 ${b.name}：裡面不能放時脈或 7 段顯示器`);
      return { id: b.id, name: b.name, nodes: inner.nodes, wires: inner.wires };
    });
    for (const b of parsed) if (usesItself(parsed, b.id)) fail(`方塊 ${b.name} 直接或間接用到自己`);
    const diagram: LogicDiagram = { version: 1, nodes, wires, ...(parsed.length > 0 ? { blocks: parsed } : {}) };
    if (r.task !== undefined) {
      const task = parseTask(r.task);
      if (!task.ok) return { ok: false, error: task.reason };
      diagram.task = task.task;
    }
    // 子專案 52：狀態表題目。
    if (r.stateTask !== undefined) {
      const task = parseStateTask(r.stateTask);
      if (!task.ok) return { ok: false, error: task.reason };
      diagram.stateTask = task.task;
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
