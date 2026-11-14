import { canPlace, NAME_RULE, nextNodeId, nextWireId, type EditResult, type Turn } from './edit';
import { blockPins, usesItself } from './flatten';
import { blockPinGroups } from './pins';
import { dropLogicNoteTargets } from './notes';
import { boxOf } from './shapes';
import { signalOf, type CustomBlock, type LogicDiagram, type LogicNode, type LogicWire } from './types';

/** 子專案 65（規格 2026-11-14 custom-blocks）：自訂方塊的編輯（純函式，網頁與 MCP 共用）。 */

const fail = (diagram: LogicDiagram, reason: string): EditResult => ({ ok: false, diagram, reason });

/** 方塊裡不能放的元件。 */
const NOT_INSIDE = new Set(['CLOCK', 'DISPLAY']);

export const blockOf = (d: LogicDiagram, id: string | undefined): CustomBlock | undefined => (id === undefined ? undefined : d.blocks?.find((b) => b.id === id));

/** 下一個方塊名稱 B1、B2…。 */
export function nextBlockName(d: LogicDiagram): string {
  const used = new Set((d.blocks ?? []).map((b) => b.name));
  for (let i = 1; ; i++) if (!used.has(`B${i}`)) return `B${i}`;
}

function nextBlockId(blocks: CustomBlock[]): string {
  const used = new Set(blocks.map((b) => b.id));
  for (let i = 1; ; i++) if (!used.has(`blk${i}`)) return `blk${i}`;
}

/** 名稱規則和輸入端一樣；同一個檔案不能重複。 */
export function blockNameProblem(d: LogicDiagram, name: string, ignoreId?: string): string | null {
  if (!NAME_RULE.test(name)) return '方塊名稱要用英文字母開頭，只能有英文字母、數字、底線，最多 8 個字';
  if ((d.blocks ?? []).some((b) => b.name === name && b.id !== ignoreId)) return `已經有叫 ${name} 的方塊了`;
  return null;
}

/** 從 (x, y) 開始往右、往下找放得下的位置（找不到時回傳 null）。 */
function freeSpot(d: LogicDiagram, node: LogicNode): LogicNode | null {
  for (let r = 0; r < 40; r++)
    for (let dy = 0; dy <= r; dy++) {
      const n = { ...node, x: node.x + r - dy, y: node.y + dy };
      if (canPlace(d, n)) return n;
    }
  return null;
}

/** 畫方塊用的字：名稱與腳名（找不到定義時寫 ?）。 */
export function customLabels(d: LogicDiagram, node: LogicNode): { title: string; subtitle: string; inputs: string[]; outputs: string[] } {
  const b = blockOf(d, node.block);
  if (!b) return { title: '?', subtitle: '找不到方塊', inputs: Array(node.inputs ?? 0).fill('?'), outputs: Array(node.outputs ?? 0).fill('?') };
  const p = blockPins(b);
  return { title: b.name, subtitle: '自訂方塊', inputs: p.inputs.map((n) => n.name ?? '?'), outputs: p.outputs.map((n) => n.name ?? '?') };
}

/** 放一個自訂方塊。 */
export function addCustomNode(d: LogicDiagram, blockId: string, x: number, y: number, turn: Turn = {}): EditResult {
  const b = blockOf(d, blockId);
  if (!b) return fail(d, '找不到這個自訂方塊');
  const pins = blockPins(b);
  const id = nextNodeId(d, 'CUSTOM');
  const node: LogicNode = { id, kind: 'CUSTOM', x, y, block: blockId, inputs: pins.inputs.length, outputs: pins.outputs.length, ...(turn.rotation ? { rotation: turn.rotation } : {}), ...(turn.flip ? { flip: true as const } : {}) };
  if (!canPlace(d, node)) return fail(d, '這裡已經有元件了');
  return { ok: true, diagram: { ...d, nodes: [...d.nodes, node] }, id };
}

/** 名稱不重複：重複時加 2、3…。 */
function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    let name = n;
    for (let k = 2; used.has(name); k++) name = `${n.slice(0, 7)}${k}`;
    used.add(name);
    return name;
  });
}

/**
 * 規格第 3 節：把選取的元件包成一個方塊。從外面接進來的同一個訊號是一個輸入腳（腳名用來源輸入端的名稱，不然是 I1…），
 * 從裡面接出去的同一個訊號是一個輸出腳（腳名用接到的輸出端名稱，不然是 O1…）；腳的順序照圖上的位置由上到下。
 */
export function wrapAsBlock(d: LogicDiagram, ids: string[], name = nextBlockName(d)): EditResult {
  const picked = new Set(ids);
  const inside = d.nodes.filter((n) => picked.has(n.id));
  if (inside.length === 0) return fail(d, '先選取要包起來的元件');
  const io = inside.find((n) => n.kind === 'INPUT' || n.kind === 'OUTPUT');
  if (io) return fail(d, '輸入端、輸出端留在外面（會自動變成方塊的腳），只選閘與方塊');
  const bad = inside.find((n) => NOT_INSIDE.has(n.kind));
  if (bad) return fail(d, bad.kind === 'CLOCK' ? '時脈不能包進方塊（時脈從方塊的輸入腳接進來）' : '7 段顯示器不能包進方塊');
  const problem = blockNameProblem(d, name);
  if (problem) return fail(d, problem);

  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const place = (id: string) => byId.get(id)!;
  const byPlace = (a: LogicNode, b: LogicNode) => a.y - b.y || a.x - b.x;
  const incoming = d.wires.filter((w) => picked.has(w.to.node) && !picked.has(w.from));
  const outgoing = d.wires.filter((w) => picked.has(w.from) && !picked.has(w.to.node));
  const internal = d.wires.filter((w) => picked.has(w.from) && picked.has(w.to.node));

  // 輸入腳：每個外面的訊號一個，照來源的位置排。
  const inSignals = [...new Map(incoming.map((w) => [signalOf(w.from, w.fromPin), w])).values()].sort((a, b) => byPlace(place(a.from), place(b.from)) || (a.fromPin ?? 0) - (b.fromPin ?? 0));
  // 輸出腳：每個裡面的訊號一個，照最上面那個目的的位置排。
  const outGroups = new Map<string, LogicWire[]>();
  for (const w of outgoing) outGroups.set(signalOf(w.from, w.fromPin), [...(outGroups.get(signalOf(w.from, w.fromPin)) ?? []), w]);
  const top = (ws: LogicWire[]) => ws.map((w) => place(w.to.node)).sort(byPlace)[0];
  const outSignals = [...outGroups.entries()].sort((a, b) => byPlace(top(a[1]), top(b[1])));

  const inNames = uniqueNames(inSignals.map((w, k) => (place(w.from).kind === 'INPUT' && place(w.from).name ? place(w.from).name! : `I${k + 1}`)));
  const outNames = uniqueNames(outSignals.map(([, ws], k) => ws.map((w) => place(w.to.node)).find((n) => n.kind === 'OUTPUT')?.name ?? `O${k + 1}`));

  // 方塊裡面：選取的元件往右移，左邊放輸入端、右邊放輸出端（由上到下就是腳的順序）。
  const x0 = Math.min(...inside.map((n) => n.x));
  const y0 = Math.min(...inside.map((n) => n.y));
  const x1 = Math.max(...inside.map((n) => n.x + boxOf(n).w));
  const dx = 4 - x0;
  const dy = 1 - y0;
  const inner: LogicNode[] = inside.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
  const inNodes: LogicNode[] = inNames.map((nm, k) => ({ id: `pi${k + 1}`, kind: 'INPUT', x: 0, y: 1 + 2 * k, name: nm, value: 0 }));
  const outNodes: LogicNode[] = outNames.map((nm, k) => ({ id: `po${k + 1}`, kind: 'OUTPUT', x: x1 + dx + 2, y: 1 + 2 * k, name: nm }));
  let wireNo = 0;
  const wid = () => `w${++wireNo}`;
  const innerWires: LogicWire[] = [
    ...internal.map((w) => ({ ...w, id: wid() })),
    ...incoming.map((w) => {
      const k = inSignals.findIndex((s) => signalOf(s.from, s.fromPin) === signalOf(w.from, w.fromPin));
      return { id: wid(), from: inNodes[k].id, to: { ...w.to } };
    }),
    ...outSignals.map(([, ws], k) => ({ id: wid(), from: ws[0].from, ...(ws[0].fromPin ? { fromPin: ws[0].fromPin } : {}), to: { node: outNodes[k].id, pin: 0 } })),
  ];
  const blocks = d.blocks ?? [];
  // 子專案 66：新做的方塊 A0–A3 這種腳合成一個多位元腳。
  const def: CustomBlock = { id: nextBlockId(blocks), name, busPins: true, nodes: [...inNodes, ...inner, ...outNodes], wires: innerWires };
  const groups = blockPinGroups(def);

  // 外面：選取的元件換成一個方塊。
  const notes = dropLogicNoteTargets(d.notes, picked);
  let outer: LogicDiagram = { ...d, nodes: d.nodes.filter((n) => !picked.has(n.id)), wires: d.wires.filter((w) => !picked.has(w.from) && !picked.has(w.to.node)), blocks: [...blocks, def], ...(notes ? { notes } : {}) };
  const id = nextNodeId(d, 'CUSTOM');
  const node = freeSpot(outer, { id, kind: 'CUSTOM', x: x0, y: y0, block: def.id, inputs: groups.inputs.length, outputs: groups.outputs.length });
  if (!node) return fail(d, '附近沒有空位放方塊');
  outer = { ...outer, nodes: [...outer.nodes, node] };
  const add = (w: Omit<LogicWire, 'id'>) => (outer = { ...outer, wires: [...outer.wires, { id: nextWireId(outer), ...w }] });
  /** 放一個合起來 / 拆開在方塊旁邊（左邊或右邊，放不下就往下找）。 */
  const busNode = (kind: 'MERGE' | 'SPLIT', width: number, row: number): string | null => {
    const bid = nextNodeId(outer, kind);
    const spot = freeSpot(outer, { id: bid, kind, width, x: kind === 'MERGE' ? node.x - 4 : node.x + boxOf(node).w + 2, y: node.y + row });
    if (!spot) return null;
    outer = { ...outer, nodes: [...outer.nodes, spot] };
    return bid;
  };
  const inIndex = (n: LogicNode) => inNodes.indexOf(n);
  for (const [p, g] of groups.inputs.entries()) {
    const sources = g.nodes.map((n) => inSignals[inIndex(n)]);
    if (g.nodes.length === 1) {
      const s = sources[0];
      add({ from: s.from, ...(s.fromPin ? { fromPin: s.fromPin } : {}), to: { node: id, pin: p } });
      continue;
    }
    // 外面一個一個的訊號先用「合起來」合成匯流排，再接到方塊的多位元腳。
    const m = busNode('MERGE', g.nodes.length, p);
    if (!m) return fail(d, '附近沒有空位放「合起來」');
    sources.forEach((s, bit) => add({ from: s.from, ...(s.fromPin ? { fromPin: s.fromPin } : {}), to: { node: m, pin: bit } }));
    add({ from: m, to: { node: id, pin: p } });
  }
  for (const [p, g] of groups.outputs.entries()) {
    const sets = g.nodes.map((n) => outSignals[outNodes.indexOf(n)][1]);
    if (g.nodes.length === 1) {
      for (const w of sets[0]) add({ from: id, ...(p > 0 ? { fromPin: p } : {}), to: { ...w.to } });
      continue;
    }
    // 方塊的多位元輸出先接到「拆開」，再一位一位接到原本的地方。
    const sp = busNode('SPLIT', g.nodes.length, p);
    if (!sp) return fail(d, '附近沒有空位放「拆開」');
    add({ from: id, ...(p > 0 ? { fromPin: p } : {}), to: { node: sp, pin: 0 } });
    sets.forEach((ws, bit) => ws.forEach((w) => add({ from: sp, ...(bit > 0 ? { fromPin: bit } : {}), to: { ...w.to } })));
  }
  return { ok: true, diagram: outer, id };
}

/** 把 nodes / wires 裡用到 blockId 的方塊照新的腳更新（腳名還在的線照名稱接回去，不見的或位元數變了的拿掉）。 */
function refit(nodes: LogicNode[], wires: LogicWire[], blockId: string, oldPins: PinKeys, newPins: PinKeys) {
  const users = new Set(nodes.filter((n) => n.kind === 'CUSTOM' && n.block === blockId).map((n) => n.id));
  if (users.size === 0) return { nodes, wires };
  const nextNodes = nodes.map((n) => (users.has(n.id) ? { ...n, inputs: newPins.inputs.length, outputs: newPins.outputs.length } : n));
  const nextWires: LogicWire[] = [];
  for (const w of wires) {
    let wire = w;
    if (users.has(w.to.node)) {
      const k = newPins.inputs.indexOf(oldPins.inputs[w.to.pin]);
      if (k < 0 || newPins.inWidth[k] !== oldPins.inWidth[w.to.pin]) continue;
      wire = { ...wire, to: { node: w.to.node, pin: k } };
    }
    if (users.has(w.from)) {
      const k = newPins.outputs.indexOf(oldPins.outputs[w.fromPin ?? 0]);
      if (k < 0 || newPins.outWidth[k] !== oldPins.outWidth[w.fromPin ?? 0]) continue;
      const { fromPin: _old, ...rest } = wire;
      wire = { ...rest, ...(k > 0 ? { fromPin: k } : {}) };
    }
    nextWires.push(wire);
  }
  return { nodes: nextNodes, wires: nextWires };
}

type PinKeys = { inputs: string[]; outputs: string[]; inWidth: number[]; outWidth: number[] };
const pinNames = (b: Pick<CustomBlock, 'nodes' | 'busPins'>): PinKeys => {
  const p = blockPins(b);
  return { inputs: p.inputs.map((n) => n.key), outputs: p.outputs.map((n) => n.key), inWidth: p.inputs.map((n) => n.width), outWidth: p.outputs.map((n) => n.width) };
};

/**
 * 規格第 4 節：在方塊裡改完回到上一層：inner 是改好的方塊內容（它的 blocks 是最新的方塊清單）。
 * 方塊的定義換成新的內容，上一層與其他方塊裡每個用到它的地方照新的腳更新；變大後和別的元件重疊時往旁邊挪。
 */
export function applyBlockEdit(parent: LogicDiagram, blockId: string, inner: LogicDiagram): LogicDiagram {
  const blocks = inner.blocks ?? parent.blocks ?? [];
  const old = blocks.find((b) => b.id === blockId) ?? blockOf(parent, blockId);
  if (!old) return parent;
  // 沒有改任何東西：上一層原封不動（不算修改）。
  if (inner.nodes === old.nodes && inner.wires === old.wires && blocks === parent.blocks) return parent;
  const updated: CustomBlock = { ...old, nodes: inner.nodes, wires: inner.wires };
  const oldPins = pinNames(old);
  const newPins = pinNames(updated);
  const nextBlocks = blocks.map((b) => {
    const self = b.id === blockId ? updated : b;
    const r = refit(self.nodes, self.wires, blockId, oldPins, newPins);
    return { ...self, nodes: r.nodes, wires: r.wires };
  });
  const r = refit(parent.nodes, parent.wires, blockId, oldPins, newPins);
  let next: LogicDiagram = { ...parent, nodes: r.nodes, wires: r.wires, blocks: nextBlocks };
  // 變大後重疊的方塊往旁邊挪（線是邏輯上的連接，挪了不會斷）。
  for (const n of next.nodes) {
    if (n.kind !== 'CUSTOM' || n.block !== blockId || canPlace(next, n)) continue;
    const spot = freeSpot({ ...next, nodes: next.nodes.filter((o) => o.id !== n.id) }, n);
    if (spot) next = { ...next, nodes: next.nodes.map((o) => (o.id === n.id ? spot : o)) };
  }
  return next;
}

/** 進到方塊裡編輯時的圖：方塊的內容，加上整個檔案的方塊清單（裡面可以放其他方塊）。 */
export function blockDiagram(d: LogicDiagram, blockId: string): LogicDiagram | null {
  const b = blockOf(d, blockId);
  if (!b) return null;
  return { version: 1, nodes: b.nodes, wires: b.wires, blocks: d.blocks };
}

/** 方塊裡可以放這個方塊嗎（不能直接或間接用到自己）。 */
export function canUseInside(blocks: CustomBlock[], inside: string, candidate: string): boolean {
  if (inside === candidate) return false;
  // 把 candidate 放進 inside 之後，candidate 會不會繞回 inside。
  const trial = blocks.map((b) => (b.id === inside ? { ...b, nodes: [...b.nodes, { id: '__trial', kind: 'CUSTOM' as const, x: 0, y: 0, block: candidate }] } : b));
  return !usesItself(trial, inside);
}

/** 刪除沒有用到的方塊（主圖與其他方塊都沒用到）。 */
export function deleteBlock(d: LogicDiagram, blockId: string): EditResult {
  const used = d.nodes.some((n) => n.kind === 'CUSTOM' && n.block === blockId) || (d.blocks ?? []).some((b) => b.nodes.some((n) => n.kind === 'CUSTOM' && n.block === blockId));
  if (used) return fail(d, '這個方塊還有地方在用，先刪掉用到它的方塊');
  const blocks = (d.blocks ?? []).filter((b) => b.id !== blockId);
  const { blocks: _old, ...rest } = d;
  return { ok: true, diagram: blocks.length > 0 ? { ...rest, blocks } : rest };
}

/** 改方塊名稱。 */
export function renameBlock(d: LogicDiagram, blockId: string, raw: string): EditResult {
  const name = raw.trim();
  const problem = blockNameProblem(d, name, blockId);
  if (problem) return fail(d, problem);
  return { ok: true, diagram: { ...d, blocks: (d.blocks ?? []).map((b) => (b.id === blockId ? { ...b, name } : b)) } };
}
