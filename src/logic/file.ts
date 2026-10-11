import { inputCountOf, overlaps } from './shapes';
import { isGate, type LogicDiagram, type LogicNode, type LogicWire, type NodeKind } from './types';

const KINDS: NodeKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'INPUT', 'OUTPUT'];
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
  } else {
    if (typeof n.name !== 'string' || !NAME_RULE.test(n.name)) fail(`元件 ${node.id} 的名稱 ${String(n.name)} 不合法`);
    node.name = n.name as string;
    if (node.kind === 'INPUT') node.value = n.value === 1 ? 1 : 0;
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
  if (source!.kind === 'OUTPUT' || target!.kind === 'INPUT' || source === target) fail(`線 ${String(w.id)} 的方向不對`);
  if ((to.pin as number) < 0 || (to.pin as number) >= inputCountOf(target!)) fail(`線 ${String(w.id)} 接到不存在的輸入腳`);
  return { id: w.id as string, from: w.from as string, to: { node: to.node as string, pin: to.pin as number } };
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
    return { ok: true, diagram: { version: 1, nodes, wires } };
  } catch (err) {
    if (err instanceof LogicFormatError) return { ok: false, error: err.message };
    throw err;
  }
}
