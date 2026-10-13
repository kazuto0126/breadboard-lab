import { getLayout } from '../core/breadboard/registry';
import { resolveFootprint } from '../core/circuit/footprint';
import { getComponentDefinition } from '../core/circuit/library';
import { validateCircuit } from '../core/circuit/validate';
import { groupIdAt } from '../editor/analysis';
import { board, comp, holeOn } from '../editor/builder';
import { freeHolesInGroup } from '../editor/explain/helpers';
import type { LayoutId } from '../types/board';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentInstance } from '../types/component';
import type { GridPoint } from '../types/geometry';
import { sortedIo } from './evaluate';
import { assignIcs, convertProblem, decompose, gateSlots } from './synth';
import type { LogicDiagram } from './types';

export interface ConvertOptions {
  /** 開關的另一側接 +5 V（撥 ON = 1，330 Ω 下拉）或 GND（撥 ON = 0，1 kΩ 上拉）。 */
  switchTo: 'vcc' | 'gnd';
  board: 'auto' | LayoutId;
}

export interface Bom {
  ics: Record<string, number>;
  switch: 'dipsw-4' | 'dipsw-8';
  resistors: number;
  leds: number;
  layout: LayoutId;
}

export type ConvertResult =
  | {
      ok: true;
      circuit: Circuit;
      bom: Bom;
      switchId: 'SW1';
      /** 依名稱排序的輸入端 id：第 k 個用開關的第 k 位。 */
      inputs: string[];
      /** 輸出端 id → LED 元件 id。 */
      leds: Record<string, string>;
      /** 元件腳（`U1#3`）→ 預定的訊號名稱（測試用）。 */
      netOf: Record<string, string>;
    }
  | { ok: false; reason: string };

const VCC = 'VCC';
const GND = 'GND';
const BOARD_ID = 'b1';
const RESISTOR_SPAN = 3;
const LAST_COLUMN = 63;

/** 一個預定的連接點：元件的某隻腳，或接線柱的孔。 */
type Terminal = { pin: string } | { point: GridPoint };

/** 兩腳元件（電阻、LED）要放的位置與它的兩隻腳接到哪。 */
interface TwoLead {
  id: string;
  defId: 'resistor' | 'led';
  props: Record<string, unknown>;
  span: number;
  nets: [string, string];
  /** EIC-1106：放在第幾區。 */
  area: 1 | 3;
}

class NoRoom extends Error {}

/** 規格（2026-10-13 logic-to-breadboard）第 4、5 節。 */
export function toBreadboard(d: LogicDiagram, options: ConvertOptions): ConvertResult {
  const problem = convertProblem(d);
  if (problem) return { ok: false, reason: problem };
  const layouts: LayoutId[] = options.board === 'auto' ? ['MB102', 'EIC1106'] : [options.board];
  for (const layout of layouts) {
    try {
      return build(d, options, layout);
    } catch (err) {
      if (!(err instanceof NoRoom)) throw err;
    }
  }
  if (options.board === 'MB102') return { ok: false, reason: 'MB-102 放不下，請改用 EIC-1106' };
  const chips = assignIcs(decompose(d)).length;
  return { ok: false, reason: `零件太多，一塊 EIC-1106 放不下（需要 ${chips} 片 IC）` };
}

function build(d: LogicDiagram, options: ConvertOptions, layout: LayoutId): ConvertResult {
  const eic = layout === 'EIC1106';
  const hole = (name: string, area?: number) => holeOn(BOARD_ID, eic ? `${area}-${name}` : name, layout);
  const { inputs, outputs } = sortedIo(d);
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w.from]));
  const plans = assignIcs(decompose(d));
  const swDef = inputs.length <= 4 ? 'dipsw-4' : 'dipsw-8';
  const swPins = swDef === 'dipsw-4' ? 8 : 16;

  const components: ComponentInstance[] = [];
  const netOf: Record<string, string> = {};
  const tie = (pin: string, net: string) => (netOf[pin] = net);
  const extra = new Map<string, GridPoint[]>(); // 接線柱等非元件腳的終端

  // ---- 放置：開關、IC 跨凹槽排一列；兩腳元件兩個一組放在 A 列與 J 列 ----
  const cursor: Record<number, number> = { 1: 2, 2: 2, 3: 2 };
  const take = (area: number, width: number) => {
    const x = cursor[area];
    if (x + width - 1 > LAST_COLUMN) throw new NoRoom();
    cursor[area] = x + width;
    return x;
  };
  const icArea = eic ? 2 : 1;

  const swX = take(1, swPins / 2 + 2);
  components.push(comp('SW1', swDef, hole(`F${swX}`, 1), { board: BOARD_ID, props: { switchStates: Array(swPins / 2).fill(false) } }));
  inputs.forEach((node, k) => {
    tie(`SW1#${k + 1}`, node.id);
    tie(`SW1#${swPins - k}`, options.switchTo === 'vcc' ? VCC : GND);
  });

  for (const plan of plans) {
    const x = take(icArea, 9);
    components.push(comp(plan.id, plan.defId, hole(`F${x}`, icArea), { board: BOARD_ID }));
    const def = getComponentDefinition(plan.defId)!;
    for (const p of def.pins) {
      if (p.role === 'power') tie(`${plan.id}#${p.number}`, VCC);
      if (p.role === 'ground') tie(`${plan.id}#${p.number}`, GND);
    }
    gateSlots(plan.defId).forEach((slot, i) => {
      const unit = plan.slots[i];
      slot.inputs.forEach((pin, j) => tie(`${plan.id}#${pin}`, unit ? unit.inputs[j] : GND));
      if (unit) tie(`${plan.id}#${slot.output}`, unit.output);
    });
  }

  const twoLeads: TwoLead[] = [];
  let r = 0;
  inputs.forEach((node) => {
    const vcc = options.switchTo === 'vcc';
    twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: vcc ? 330 : 1000 }, span: RESISTOR_SPAN, nets: [node.id, vcc ? GND : VCC], area: 1 });
  });
  const leds: Record<string, string> = {};
  outputs.forEach((node, k) => {
    const source = driver.get(`${node.id}#0`)!;
    const mid = `led:${node.id}`;
    twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: 220 }, span: RESISTOR_SPAN, nets: [source, mid], area: 3 });
    twoLeads.push({ id: `D${k + 1}`, defId: 'led', props: { color: 'red' }, span: 1, nets: [mid, GND], area: 3 });
    leds[node.id] = `D${k + 1}`;
  });
  // 兩個一組：第一個放 A 列、第二個放 J 列（同一段欄），各自用不同的導通群組。
  const byArea = (area: 1 | 3) => twoLeads.filter((t) => (eic ? t.area === area : true));
  for (const area of eic ? ([1, 3] as const) : ([1] as const)) {
    const list = byArea(area);
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2);
      const width = Math.max(...pair.map((t) => t.span)) + 2;
      const x = take(eic ? area : 1, width);
      pair.forEach((t, j) => {
        components.push(comp(t.id, t.defId, hole(`${j === 0 ? 'A' : 'J'}${x}`, eic ? area : undefined), { board: BOARD_ID, props: t.props as never, ...(t.defId === 'resistor' ? { span: t.span } : {}) }));
        tie(`${t.id}#1`, t.nets[0]);
        tie(`${t.id}#2`, t.nets[1]);
      });
    }
  }

  // ---- 電源 ----
  if (eic) {
    const posts = getLayout(layout).posts ?? [];
    const red = posts.find((p) => p.source === 'vcc')!;
    const black = posts.find((p) => p.source === 'gnd')!;
    extra.set(VCC, [{ boardId: BOARD_ID, x: red.x, y: red.y }]);
    extra.set(GND, [{ boardId: BOARD_ID, x: black.x, y: black.y }]);
  } else {
    components.push(comp('V1', 'vcc', 'T+3', { board: BOARD_ID }));
    components.push(comp('G1', 'gnd', 'B-3', { board: BOARD_ID }));
    tie('V1#1', VCC);
    tie('G1#1', GND);
  }

  // ---- 連線導線：每個訊號的終端依序兩兩相接（只告訴 AI 佈線哪些腳要連在一起） ----
  const base: Circuit = { version: 1, boards: [board(BOARD_ID, 0, 0, layout)], components, wires: [] };
  const pointOf = new Map<string, GridPoint>();
  for (const c of components) {
    const def = getComponentDefinition(c.defId)!;
    for (const fp of resolveFootprint(c, def).pins) pointOf.set(`${c.id}#${fp.pinNumber}`, fp.point);
  }
  const terminals = new Map<string, GridPoint[]>();
  for (const [pin, net] of Object.entries(netOf)) {
    const p = pointOf.get(pin);
    if (p) terminals.set(net, [...(terminals.get(net) ?? []), p]);
  }
  for (const [net, points] of extra) terminals.set(net, [...points, ...(terminals.get(net) ?? [])]);

  const used = new Set<string>();
  const key = (p: GridPoint) => `${p.x},${p.y}`;
  const freeHole = (p: GridPoint): GridPoint => {
    // 接線柱只有一個孔：直接用它。
    if (eic && (getLayout(layout).posts ?? []).some((post) => post.x === p.x && post.y === p.y)) return p;
    const hole = freeHolesInGroup(base, p).find((h) => !used.has(key(h)));
    if (!hole) throw new Error(`no free hole near ${key(p)}`);
    used.add(key(hole));
    return hole;
  };
  const wires: Wire[] = [];
  for (const [net, points] of terminals) {
    // 同一個導通群組的終端只算一次。
    const seen = new Set<string>();
    const unique = points.filter((p) => {
      const g = groupIdAt(base, p) ?? key(p);
      if (seen.has(g)) return false;
      seen.add(g);
      return true;
    });
    for (let i = 1; i < unique.length; i++) {
      const a = freeHole(unique[i - 1]);
      const b = freeHole(unique[i]);
      wires.push({ id: `c${wires.length + 1}`, color: net === VCC ? '#d32f2f' : net === GND ? '#212121' : '#1565c0', source: 'manual', straight: true, start: a, end: b, path: [a, b] });
    }
  }
  const circuit: Circuit = { ...base, wires };

  const errors = validateCircuit(circuit).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'));
  if (errors.length > 0) return { ok: false, reason: `轉換失敗：${errors[0].message}（這是程式的錯，請回報）` };

  const ics: Record<string, number> = {};
  for (const p of plans) ics[p.defId] = (ics[p.defId] ?? 0) + 1;
  return {
    ok: true,
    circuit,
    bom: { ics, switch: swDef, resistors: twoLeads.filter((t) => t.defId === 'resistor').length, leds: outputs.length, layout },
    switchId: 'SW1',
    inputs: inputs.map((n) => n.id),
    leds,
    netOf,
  };
}
