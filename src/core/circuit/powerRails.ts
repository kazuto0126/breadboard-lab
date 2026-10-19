import { nodeIdOf } from '../breadboard/naming';
import type { Breadboard, BreadboardNode } from '../../types/board';
import type { Circuit, Wire } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { groupOfPoint, indexCircuit, pinPoint } from './circuitIndex';
import { compareIds, extractNets, terminalClusters } from './nets';

/**
 * 子專案 34（規格 2026-10-19 nearest-power-rails）：「轉成麵包板」的電源接法。
 * 每個要接 5V（GND）的腳的導通群組直接接到最近的 + 軌（− 軌）；用到的軌各插一個 5V / GND 符號，軌和軌之間不拉線。
 * 只給轉換用（一般的 AI 佈線保留使用者自己拉的軌對軌的線）；電源只認 vcc / gnd 符號。
 */

export type Polarity = '+' | '-';

const POWER_COLORS: Record<Polarity, string> = { '+': '#d32f2f', '-': '#212121' };
const SYMBOL_OF: Record<Polarity, 'vcc' | 'gnd'> = { '+': 'vcc', '-': 'gnd' };
/** 新補的符號從第幾欄開始找空孔（和轉換原本放的位置一樣靠左）。 */
const SYMBOL_FROM_X = 3;

/** 電源軌的極性看群組 ID 最後一個字（例如 b1:rail-T+）。 */
const railPolarity = (board: Breadboard, groupId: string): Polarity | null =>
  board.groups[groupId]?.kind !== 'rail' ? null : groupId.endsWith('+') ? '+' : groupId.endsWith('-') ? '-' : null;

/** 每個群組裡的孔。 */
function holesByGroup(board: Breadboard): Map<string, BreadboardNode[]> {
  const out = new Map<string, BreadboardNode[]>();
  for (const n of board.nodes) {
    if (!n.groupId) continue;
    const list = out.get(n.groupId);
    if (list) list.push(n);
    else out.set(n.groupId, [n]);
  }
  return out;
}

function nearestIn(board: Breadboard, holes: Map<string, BreadboardNode[]>, groupId: string, polarity: Polarity): { id: string; distance: number } | null {
  const ys = (holes.get(groupId) ?? []).map((n) => n.y);
  if (ys.length === 0) return null;
  let best: { id: string; distance: number; y: number } | null = null;
  for (const id of Object.keys(board.groups).sort(compareIds)) {
    if (railPolarity(board, id) !== polarity) continue;
    const railYs = (holes.get(id) ?? []).map((n) => n.y);
    if (railYs.length === 0) continue;
    const distance = Math.min(...ys.flatMap((y) => railYs.map((ry) => Math.abs(y - ry))));
    const y = Math.min(...railYs);
    if (!best || distance < best.distance || (distance === best.distance && y < best.y)) best = { id, distance, y };
  }
  return best ? { id: best.id, distance: best.distance } : null;
}

/** 離這個群組最近（上下距離）的該極性電源軌；同樣近時取上面的。只看同一塊板。 */
export function nearestRailGroup(board: Breadboard, groupId: string, polarity: Polarity): string | null {
  return nearestIn(board, holesByGroup(board), groupId, polarity)?.id ?? null;
}

export interface PowerRebind {
  circuit: Circuit;
  /** 補上的 5V / GND 符號。 */
  added: ComponentInstance[];
  /** 拿掉的 5V / GND 符號 ID（它的軌沒有腳用到）。 */
  removed: string[];
}

const nextId = (used: Set<string>, prefix: string) => {
  let n = 1;
  for (const id of used) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  used.add(`${prefix}${n}`);
  return `${prefix}${n}`;
};

/**
 * 把電源（power / ground）Net 重新接成「每個腳的群組 → 最近的同極性軌」：拿掉這些 Net 原本的導線，
 * 每個群組拉一條直線到最近的軌（群組裡離軌最近的空孔 → 軌上 x 最接近的空孔）；用到的軌沒有符號就補一個，
 * 沒有用到的軌上的 vcc / gnd 符號拿掉。訊號 Net 的導線與其他元件不動。
 */
export function connectPowerToNearestRails(circuit: Circuit): PowerRebind {
  const index = indexCircuit(circuit);
  const nets = extractNets(circuit).filter((n) => n.kind === 'power' || n.kind === 'ground');
  if (nets.length === 0) return { circuit, added: [], removed: [] };

  const holes = new Map<string, Map<string, BreadboardNode[]>>();
  const holesOf = (boardId: string) => {
    if (!holes.has(boardId)) holes.set(boardId, holesByGroup(index.boards.get(boardId)!));
    return holes.get(boardId)!;
  };
  const boardOfGroup = (groupId: string) => groupId.slice(0, groupId.indexOf(':'));

  // 每一簇要接電源的群組 → 最近的軌。元件裡相通的群組（例如顯示器的兩隻共同腳、按鈕跨凹槽的兩腳）算同一簇，
  // 只從離軌最近的那個群組拉一條線，免得兩條軌經過元件連在一起。
  const links: Array<{ group: string; rail: string; polarity: Polarity }> = [];
  for (const net of nets) {
    const polarity: Polarity = net.kind === 'power' ? '+' : '-';
    for (const cluster of terminalClusters(net, index)) {
      let best: { group: string; rail: string; distance: number } | null = null;
      for (const group of cluster) {
        const boardId = boardOfGroup(group);
        const board = index.boards.get(boardId)!;
        if (board.groups[group]?.kind === 'rail') {
          best = null;
          break;
        }
        const rail = nearestIn(board, holesOf(boardId), group, polarity);
        if (rail && (!best || rail.distance < best.distance)) best = { group, rail: rail.id, distance: rail.distance };
      }
      if (best) links.push({ group: best.group, rail: best.rail, polarity });
    }
  }

  // 電源 Net 的導線全部重接；其他導線不動。
  const powerGroups = new Set(nets.flatMap((n) => n.groupIds));
  const touchesPower = (w: Wire) => [w.start, w.end].some((p) => {
    const g = groupOfPoint(index, p);
    return g !== null && powerGroups.has(g);
  });
  const kept = circuit.wires.filter((w) => !touchesPower(w));

  // 符號：用到的軌各留（或補）一個，沒用到的拿掉。
  const usedRails = new Map(links.map((l) => [l.rail, l.polarity]));
  // 子專案 36：直接插在電源軌上的元件腳（例如直立的上 / 下拉電阻）：那條軌也要有符號。
  for (const net of nets) {
    const polarity: Polarity = net.kind === 'power' ? '+' : '-';
    for (const ref of net.pins) {
      const owner = circuit.components.find((c) => c.id === ref.componentId);
      if (!owner || owner.defId === 'vcc' || owner.defId === 'gnd') continue;
      const p = pinPoint(index, ref);
      const g = p ? groupOfPoint(index, p) : null;
      if (g && index.boards.get(boardOfGroup(g))?.groups[g]?.kind === 'rail') usedRails.set(g, polarity);
    }
  }
  const symbolRail = (c: ComponentInstance) => {
    const p = pinPoint(index, { componentId: c.id, pinNumber: 1 });
    return p ? groupOfPoint(index, p) : null;
  };
  const symbols = circuit.components.filter((c) => c.defId === 'vcc' || c.defId === 'gnd');
  const removed = symbols
    .filter((c) => {
      const rail = symbolRail(c);
      return rail !== null && rail.includes(':rail-') && usedRails.get(rail) !== (c.defId === 'vcc' ? '+' : '-');
    })
    .map((c) => c.id);

  const occupied = new Set<string>([...index.pinsAt.keys(), ...index.bodiesAt.keys()]);
  for (const id of removed) {
    const c = symbols.find((s) => s.id === id)!;
    const p = pinPoint(index, { componentId: c.id, pinNumber: 1 });
    if (p) occupied.delete(nodeIdOf(p));
  }
  for (const w of kept) for (const p of [w.start, w.end]) occupied.add(nodeIdOf(p));
  const take = (n: BreadboardNode, boardId: string): GridPoint => {
    const p = { boardId, x: n.x, y: n.y };
    occupied.add(nodeIdOf(p));
    return p;
  };
  const free = (boardId: string, n: BreadboardNode) => !occupied.has(nodeIdOf({ boardId, x: n.x, y: n.y }));

  const ids = new Set(circuit.components.map((c) => c.id));
  const added: ComponentInstance[] = [];
  for (const [rail, polarity] of [...usedRails].sort((a, b) => compareIds(a[0], b[0]))) {
    const defId = SYMBOL_OF[polarity];
    if (symbols.some((c) => c.defId === defId && symbolRail(c) === rail && !removed.includes(c.id))) continue;
    const boardId = boardOfGroup(rail);
    const spot = (holesOf(boardId).get(rail) ?? []).filter((n) => n.x >= SYMBOL_FROM_X && free(boardId, n)).sort((a, b) => a.x - b.x)[0];
    if (!spot) continue;
    const at = take(spot, boardId);
    added.push({ id: nextId(ids, defId === 'vcc' ? 'V' : 'G'), defId, boardId, anchor: { x: at.x, y: at.y }, rotation: 0, props: {} });
  }

  // 每個群組一條直線到它的軌。
  const wireIds = new Set(kept.map((w) => w.id));
  let n = 0;
  const wireId = () => {
    let id: string;
    do id = `pw${++n}`;
    while (wireIds.has(id));
    wireIds.add(id);
    return id;
  };
  const wires: Wire[] = [];
  for (const { group, rail, polarity } of links) {
    const boardId = boardOfGroup(group);
    const railHoles = holesOf(boardId).get(rail) ?? [];
    const railY = railHoles[0]?.y ?? 0;
    const groupHoles = [...(holesOf(boardId).get(group) ?? [])].sort((a, b) => Math.abs(a.y - railY) - Math.abs(b.y - railY) || a.x - b.x);
    const from = groupHoles.find((h) => free(boardId, h)) ?? groupHoles[0];
    if (!from) continue;
    const start = take(from, boardId);
    const to = [...railHoles].filter((h) => free(boardId, h)).sort((a, b) => Math.abs(a.x - start.x) - Math.abs(b.x - start.x) || a.x - b.x)[0];
    if (!to) continue;
    const end = take(to, boardId);
    wires.push({ id: wireId(), color: POWER_COLORS[polarity], source: 'manual', straight: true, start, end, path: [{ ...start }, { ...end }] });
  }

  return {
    circuit: { ...circuit, components: [...circuit.components.filter((c) => !removed.includes(c.id)), ...added], wires: [...kept, ...wires] },
    added,
    removed,
  };
}
