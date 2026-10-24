import { isBlockChip } from './blocks';
import { dropLogicNoteTargets } from './notes';
import { boxOf, inputCountOf, nodeSize, outputCountOf, overlaps } from './shapes';
import { canRotate, isGate, isSink, type BlockChip, type GateKind, type LogicDiagram, type LogicNode, type LogicWire, type NodeKind, type Rotation } from './types';

export type EditResult = { ok: true; diagram: LogicDiagram; id?: string } | { ok: false; diagram: LogicDiagram; reason: string };

const fail = (diagram: LogicDiagram, reason: string): EditResult => ({ ok: false, diagram, reason });
const PREFIX: Record<'gate' | 'INPUT' | 'OUTPUT' | 'DISPLAY' | 'HIGH' | 'LOW' | 'BLOCK' | 'CLOCK', string> = { gate: 'g', INPUT: 'i', OUTPUT: 'o', DISPLAY: 'd', HIGH: 'k', LOW: 'k', BLOCK: 'b', CLOCK: 'c' };
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

/** 子專案 28：元件的方向（放置前先轉好、鏡射）。 */
export interface Turn {
  rotation?: Rotation;
  flip?: true;
}

export function addNode(d: LogicDiagram, kind: NodeKind, x: number, y: number, chip?: BlockChip, turn: Turn = {}): EditResult {
  const id = nextNodeId(d, kind);
  if (kind === 'BLOCK' && !isBlockChip(chip)) return fail(d, '要指定哪一顆 IC');
  // 子專案 46：一張圖只能有一個時脈（時序表一次看一個時脈）。
  if (kind === 'CLOCK' && d.nodes.some((n) => n.kind === 'CLOCK')) return fail(d, '一張圖只能有一個時脈');
  const plain: LogicNode =
    kind === 'BLOCK'
      ? { id, kind, x, y, chip }
      : kind === 'HIGH' || kind === 'LOW'
        ? { id, kind, x, y }
        : kind === 'CLOCK'
          ? { id, kind, x, y, name: 'CLK', value: 0 }
          : kind === 'INPUT'
      ? { id, kind, x, y, name: defaultName(d, 'INPUT'), value: 0 }
      : kind === 'OUTPUT' || kind === 'DISPLAY'
        ? { id, kind, x, y, name: defaultName(d, kind) }
        : { id, kind, x, y, inputs: defaultInputs(kind) };
  const node: LogicNode = canRotate(kind) ? { ...plain, ...(turn.rotation ? { rotation: turn.rotation } : {}), ...(turn.flip ? { flip: true as const } : {}) } : plain;
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
  // 子專案 29：指向被刪掉的元件的便條拿掉指向。
  const notes = dropLogicNoteTargets(d.notes, gone);
  return { ...d, nodes: d.nodes.filter((n) => !gone.has(n.id)), wires: d.wires.filter((w) => !gone.has(w.from) && !gone.has(w.to.node)), ...(notes ? { notes } : {}) };
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
      const s = boxOf(n);
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

/**
 * 子專案 26：把元件轉到 to(node) 的角度；每個元件盡量繞自己的中心轉（位移往 0 取整，轉四次一定回到原位）。
 * 只轉邏輯閘與 IC 方塊；轉了會和別的元件重疊就整批不轉。
 */
function turnNodes(d: LogicDiagram, ids: string[], to: (n: LogicNode) => number): EditResult {
  const chosen = new Set(ids);
  const turning = d.nodes.filter((n) => chosen.has(n.id) && canRotate(n.kind));
  if (turning.length === 0) return fail(d, '7 段顯示器不能轉向');
  const moved = new Set(turning.map((n) => n.id));
  const nodes = d.nodes.map((n) => {
    if (!moved.has(n.id)) return n;
    const angle = ((to(n) % 360) + 360) % 360;
    const { rotation: _old, ...rest } = n;
    const next: LogicNode = angle === 0 ? rest : { ...rest, rotation: angle as Rotation };
    const a = boxOf(n);
    const b = boxOf(next);
    return { ...next, x: n.x + Math.trunc((a.w - b.w) / 2), y: n.y + Math.trunc((a.h - b.h) / 2) };
  });
  for (const n of nodes) {
    if (!moved.has(n.id)) continue;
    if (nodes.some((o) => o.id !== n.id && overlaps(n, o))) return fail(d, '轉向後會和別的元件重疊');
  }
  return { ok: true, diagram: { ...d, nodes } };
}

/** 順時針轉 90°（快捷鍵 R）。 */
export function rotateNodes(d: LogicDiagram, ids: string[]): EditResult {
  return turnNodes(d, ids, (n) => (n.rotation ?? 0) + 90);
}

/** 直接設定方向（屬性面板的方向按鈕）。 */
export function setRotation(d: LogicDiagram, id: string, angle: 0 | Rotation): EditResult {
  return turnNodes(d, [id], () => angle);
}

/** 子專案 28：左右鏡射（方框不變，位置不動）；把 flip 設成 to(node)。 */
function mirrorNodes(d: LogicDiagram, ids: string[], to: (n: LogicNode) => boolean): EditResult {
  const chosen = new Set(ids);
  if (!d.nodes.some((n) => chosen.has(n.id) && canRotate(n.kind))) return fail(d, '7 段顯示器不能轉向');
  const nodes = d.nodes.map((n) => {
    if (!chosen.has(n.id) || !canRotate(n.kind)) return n;
    const { flip: _old, ...rest } = n;
    return to(n) ? { ...rest, flip: true as const } : rest;
  });
  return { ok: true, diagram: { ...d, nodes } };
}

/** 鏡射（快捷鍵 M）：鏡射過的再按一次就翻回來。 */
export function flipNodes(d: LogicDiagram, ids: string[]): EditResult {
  return mirrorNodes(d, ids, (n) => !n.flip);
}

export function setFlip(d: LogicDiagram, id: string, flip: boolean): EditResult {
  return mirrorNodes(d, [id], () => flip);
}

/**
 * 子專案 32：顯示器切換成每段直接控制（8 個輸入 a–g、dp）或 BCD（A–D、DP）。腳的意思換了，接到這個顯示器的線全部拿掉；
 * 變高後會重疊就不換。
 */
export function setDisplayMode(d: LogicDiagram, id: string, segments: boolean): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node || node.kind !== 'DISPLAY') return fail(d, '找不到顯示器');
  if (!!node.segments === segments) return { ok: true, diagram: d };
  const { segments: _old, ...rest } = node;
  const next: LogicNode = segments ? { ...rest, segments: true } : rest;
  if (d.nodes.some((n) => n.id !== id && overlaps(n, next))) return fail(d, '顯示器變高後會和別的元件重疊');
  return { ok: true, diagram: { ...replaceNode(d, next), wires: d.wires.filter((w) => w.to.node !== id) } };
}

/** 子專案 37：輸出端切換成低態致動（0 時亮）或一般（1 時亮）；線不動。 */
export function setActiveLow(d: LogicDiagram, id: string, on: boolean): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node || node.kind !== 'OUTPUT') return fail(d, '找不到輸出端');
  if (!!node.activeLow === on) return { ok: true, diagram: d };
  const { activeLow: _old, ...rest } = node;
  return { ok: true, diagram: replaceNode(d, on ? { ...rest, activeLow: true } : rest) };
}
