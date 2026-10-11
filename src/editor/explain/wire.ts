import { nodeIdOf } from '../../core/breadboard/naming';
import { groupInfo, groupOfPoint, indexCircuit, type CircuitIndex } from '../../core/circuit/circuitIndex';
import { compareIds } from '../../core/circuit/nets';
import type { RailLabel } from '../../types/board';
import type { Circuit, Net, PinRef, Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { analyzeCircuit, holeLabel } from '../analysis';
import { straightWireProblem, type StraightProblem } from '../manualWire';
import { freeHolesInGroup, RAIL_TEXT } from './helpers';

export interface WireExplanation {
  net: Net | undefined;
  summary: string;
  chain: Array<{ wireId: string; text: string }>;
  why: string | null;
}

/** 中文與英數字之間留一個空白（「把 U1 第 3 腳 接到 R1」、「接到上方的」）。 */
const spaced = (a: string, b: string) => (/[A-Za-z0-9]$/.test(a) || /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : a + b);

const NET_KIND: Record<Net['kind'], string> = { power: '電源', ground: '地', signal: '訊號' };
const POST_TEXT: Record<string, string> = { red: '紅色接線柱（+5 V）', black: '黑色接線柱（GND）', yellow: '黃色接線柱', green: '綠色接線柱' };

/** 一排（導通群組）上的東西：元件腳、電源軌、接線柱、接在這排的導線。 */
interface Row {
  id: string;
  pins: PinRef[];
  rail: RailLabel | null;
  post: string | null;
  wires: Wire[];
}

function rowsOf(circuit: Circuit, index: CircuitIndex): (p: GridPoint) => Row | null {
  const cache = new Map<string, Row>();
  const wiresAt = new Map<string, Wire[]>();
  for (const w of circuit.wires) {
    for (const g of new Set([groupOfPoint(index, w.start), groupOfPoint(index, w.end)])) if (g) wiresAt.set(g, [...(wiresAt.get(g) ?? []), w]);
  }
  return (p) => {
    const id = groupOfPoint(index, p);
    if (!id) return null;
    let row = cache.get(id);
    if (!row) {
      const info = groupInfo(index, id);
      const local = id.slice(id.indexOf(':') + 1);
      const pins = (info?.nodeIds ?? []).flatMap((n) => index.pinsAt.get(n) ?? []);
      pins.sort((a, b) => compareIds(a.componentId, b.componentId) || a.pinNumber - b.pinNumber);
      row = {
        id,
        pins,
        rail: local.startsWith('rail-') ? (local.slice(5) as RailLabel) : null,
        post: local.startsWith('post-') ? local.slice(5) : null,
        wires: wiresAt.get(id) ?? [],
      };
      cache.set(id, row);
    }
    return row;
  };
}

function pinText(index: CircuitIndex, ref: PinRef): string {
  const name = index.placedById.get(ref.componentId)?.def.pins.find((p) => p.number === ref.pinNumber)?.name;
  // 腳名就是腳號（電阻的 1、2）時不重複寫。
  return `${ref.componentId} 第 ${ref.pinNumber} 腳${name && name !== String(ref.pinNumber) ? `（${name}）` : ''}`;
}

/** 轉接排：沒有腳、不是電源軌或接線柱、剛好接兩條線。 */
const isHop = (row: Row) => row.pins.length === 0 && !row.rail && !row.post && row.wires.length === 2;
const connected = (row: Row) => row.pins.length > 0 || row.rail !== null || row.post !== null;

/** 一段連線的一端怎麼說（規格 3.1 的表）。 */
function endText(circuit: Circuit, index: CircuitIndex, row: Row, at: GridPoint): string {
  // 電源軌與接線柱優先：軌上放的 VCC / GND 符號也是插在軌上。
  if (row.rail) return RAIL_TEXT[row.rail];
  if (row.post) return POST_TEXT[row.post] ?? '接線柱';
  if (row.pins.length > 0) return row.pins.map((r) => pinText(index, r)).join('、');
  if (row.wires.length >= 3) return `${holeLabel(circuit, at)} 那一排（從這裡分成 ${row.wires.length} 條線）`;
  return `${holeLabel(circuit, at)} 那一排（沒有接到別的東西）`;
}

/** 一條線的某一端那一排是什麼（chain 每一行用）。 */
function endNote(circuit: Circuit, index: CircuitIndex, row: Row, at: GridPoint): string {
  const label = holeLabel(circuit, at);
  if (row.rail) return `${label} 插在${RAIL_TEXT[row.rail]}`;
  if (row.post) return `${label} 是${POST_TEXT[row.post] ?? '接線柱'}`;
  if (row.pins.length > 0) return `${label} 和 ${spaced(row.pins.map((r) => pinText(index, r)).join('、'), '同一排')}`;
  if (isHop(row)) return `${label} 那一排是空的，當成轉接排`;
  if (row.wires.length >= 3) return `${label} 那一排是分岔點（接 ${row.wires.length} 條線）`;
  return `${label} 那一排沒有接到別的東西`;
}

function problemText(circuit: Circuit, index: CircuitIndex, problem: StraightProblem): string {
  switch (problem.kind) {
    case 'obstacle':
    case 'pin': {
      const id = nodeIdOf(problem.point);
      const label = holeLabel(circuit, problem.point);
      const pin = index.pinsAt.get(id)?.[0];
      if (pin) return `會經過 ${pin.componentId} 的腳（${label}）`;
      const body = index.bodiesAt.get(id)?.[0];
      if (body) return `會經過 ${body} 的本體（${label}）`;
      return `會經過別條線的端點（${label}）`;
    }
    case 'overlap':
      return `會和導線 ${problem.wireId} 重疊`;
    case 'covered':
      return `端點 ${holeLabel(circuit, problem.point)} 上有導線 ${problem.wireId} 經過`;
    default:
      return '不能直接接';
  }
}

/** 規格 3.2：拿掉這段連線後，兩端能不能用一條直線接。 */
function whyText(circuit: Circuit, index: CircuitIndex, chainIds: Set<string>, a: GridPoint, b: GridPoint): string {
  const without: Circuit = { ...circuit, wires: circuit.wires.filter((w) => !chainIds.has(w.id)) };
  const pairs: Array<[GridPoint, GridPoint]> = [];
  for (const p of freeHolesInGroup(without, a)) {
    for (const q of freeHolesInGroup(without, b)) if (p.boardId === q.boardId && (p.x === q.x || p.y === q.y)) pairs.push([p, q]);
  }
  if (pairs.length === 0) return '兩端不在同一列、也不在同一欄，一條直線接不到，所以經過轉接排轉彎。';
  const name = ([p, q]: [GridPoint, GridPoint]) => `${holeLabel(circuit, p)} → ${holeLabel(circuit, q)}`;
  const ok = pairs.find(([p, q]) => straightWireProblem(without, p, q) === null);
  if (ok) return `其實也可以一條線直接接（例如 ${name(ok)}）。AI 標準佈線為了少和別的線交叉、讓出位置給其他連線，選了經過轉接排的走法。`;
  const problem = straightWireProblem(without, pairs[0][0], pairs[0][1])!;
  return `兩端雖然可以排成一直線（例如 ${name(pairs[0])}），但中間${problemText(circuit, index, problem)}，所以改走轉接排。`;
}

/** 規格第 3 節：這條線在做什麼（不用網路）。 */
export function explainWire(circuit: Circuit, wireId: string): WireExplanation | null {
  const wire = circuit.wires.find((w) => w.id === wireId);
  if (!wire) return null;
  const index = indexCircuit(circuit);
  const rowAt = rowsOf(circuit, index);

  // 往一個方向走：經過轉接排就接到下一條線，直到碰到有東西的排或分岔。
  const seen = new Set([wire.id]);
  const walk = (from: GridPoint): { wires: Wire[]; end: GridPoint } => {
    const wires: Wire[] = [];
    let at = from;
    let current = wire;
    for (;;) {
      const row = rowAt(at);
      if (!row || !isHop(row)) return { wires, end: at };
      const next = row.wires.find((w) => w.id !== current.id);
      if (!next || seen.has(next.id)) return { wires, end: at };
      seen.add(next.id);
      wires.push(next);
      at = groupOfPoint(index, next.start) === row.id ? next.end : next.start;
      current = next;
    }
  };
  const left = walk(wire.start);
  const right = walk(wire.end);
  const chainWires = [...left.wires.reverse(), wire, ...right.wires];
  const [a, b] = [left.end, right.end];
  const rowA = rowAt(a)!;
  const rowB = rowAt(b)!;

  const net = analyzeCircuit(circuit).netByWire.get(wire.id);
  const from = endText(circuit, index, rowA, a);
  const to = endText(circuit, index, rowB, b);
  const netText = net ? `${net.name}（${NET_KIND[net.kind]}）` : null;
  let summary: string;
  if (!connected(rowA) && !connected(rowB)) summary = '這條線兩端都沒有接到元件或電源。';
  else if (chainWires.length === 1) summary = `這條線把 ${spaced(spaced(from, '接到'), to)}${netText ? `，屬於 ${netText}` : ''}。`;
  else summary = `${netText ? `這條線屬於 ${netText}，` : '這條線'}負責把 ${spaced(spaced(from, '接到'), to)}。`;

  const chain = chainWires.map((w) => ({
    wireId: w.id,
    text: `${holeLabel(circuit, w.start)} → ${holeLabel(circuit, w.end)}：${endNote(circuit, index, rowAt(w.start)!, w.start)}；${endNote(circuit, index, rowAt(w.end)!, w.end)}。`,
  }));
  const why = wire.source === 'auto' && chainWires.length > 1 ? whyText(circuit, index, new Set(chainWires.map((w) => w.id)), a, b) : null;
  return { net, summary, chain, why };
}
