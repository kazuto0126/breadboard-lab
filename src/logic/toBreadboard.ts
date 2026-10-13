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
import { toNandUnits } from './nandOnly';
import { assignIcs, convertProblem, decompose, gateSlots } from './synth';
import { isSink, type LogicDiagram } from './types';

export interface ConvertOptions {
  /** 開關的另一側接 +5 V（撥 ON = 1，330 Ω 下拉）或 GND（撥 ON = 0，1 kΩ 上拉）。 */
  switchTo: 'vcc' | 'gnd';
  board: 'auto' | LayoutId;
  /** 照種類對應（預設）或只用 NAND（74LS00）。 */
  gates?: 'direct' | 'nand';
}

export interface Bom {
  ics: Record<string, number>;
  switch: 'dipsw-4' | 'dipsw-8';
  resistors: number;
  leds: number;
  /** 7 段顯示器（共陽極）的個數。 */
  displays: number;
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
      /** 顯示器 id → 7 段顯示器元件 id（DS1、DS2）。 */
      displays: Record<string, string>;
      /** 元件腳（`U1#3`）→ 預定的訊號名稱（測試用）。 */
      netOf: Record<string, string>;
    }
  | { ok: false; reason: string };

const VCC = 'VCC';
const GND = 'GND';
const BOARD_ID = 'b1';
const RESISTOR_SPAN = 3;
const LAST_COLUMN = 63;
/** 元件之間最多空幾欄。 */
const MAX_GAP = 6;

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
  /** 兩個一組時只和同一組的配對（輸入、LED、第 k 個顯示器）。 */
  group: string;
}

class NoRoom extends Error {}

/** 拆好的單元；只用 NAND 時再換成 2 輸入 NAND（輸出端接的訊號一定保留）。 */
function unitsFor(d: LogicDiagram, options: ConvertOptions) {
  const units = decompose(d);
  if (options.gates !== 'nand') return units;
  const keep = d.wires.filter((w) => isSink(d.nodes.find((n) => n.id === w.to.node)?.kind ?? 'AND')).map((w) => w.from);
  return toNandUnits(units, keep);
}

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
  const chips = assignIcs(unitsFor(d, options)).length;
  return { ok: false, reason: `零件太多，一塊 EIC-1106 放不下（需要 ${chips} 片 IC）` };
}

function build(d: LogicDiagram, options: ConvertOptions, layout: LayoutId): ConvertResult {
  const eic = layout === 'EIC1106';
  const hole = (name: string, area?: number) => holeOn(BOARD_ID, eic ? `${area}-${name}` : name, layout);
  const { inputs, outputs: sinks } = sortedIo(d);
  const outputs = sinks.filter((n) => n.kind === 'OUTPUT');
  const displays = sinks.filter((n) => n.kind === 'DISPLAY');
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w.from]));
  const plans = assignIcs(unitsFor(d, options));
  const swDef = inputs.length <= 4 ? 'dipsw-4' : 'dipsw-8';
  const swPins = swDef === 'dipsw-4' ? 8 : 16;

  const components: ComponentInstance[] = [];
  const netOf: Record<string, string> = {};
  const tie = (pin: string, net: string) => (netOf[pin] = net);
  const extra = new Map<string, GridPoint[]>(); // 接線柱等非元件腳的終端

  // ---- 放置：開關、IC 跨凹槽排一列；兩腳元件兩個一組放在 A 列與 J 列 ----
  // 先列出每一區要放的東西（寬度與放置方式），再把剩下的欄平均分成間隔（最多 6 欄），留空間給 AI 佈線拉線。
  const blocks: Record<number, Array<{ width: number; place: (x: number) => void }>> = { 1: [], 2: [], 3: [] };
  const icArea = eic ? 2 : 1;
  const icBlocks: Array<{ width: number; place: (x: number) => void }> = [];

  blocks[1].push({
    width: swPins / 2,
    place: (x) => components.push(comp('SW1', swDef, hole(`F${x}`, 1), { board: BOARD_ID, props: { switchStates: Array(swPins / 2).fill(false), labels: Array.from({ length: swPins / 2 }, (_, k) => inputs[k]?.name ?? '') } })),
  });
  // 開關接電源的那一側要靠近那條電源軌：+5 V 在上方（E 列那一側的腳 9 − k），GND 在下方（F 列那一側的腳 k）。
  inputs.forEach((node, k) => {
    const top = `SW1#${swPins - k}`;
    const bottom = `SW1#${k + 1}`;
    if (options.switchTo === 'vcc') {
      tie(bottom, node.id);
      tie(top, VCC);
    } else {
      tie(top, node.id);
      tie(bottom, GND);
    }
  });

  for (const plan of plans) {
    icBlocks.push({ width: 7, place: (x) => components.push(comp(plan.id, plan.defId, hole(`F${x}`, icArea), { board: BOARD_ID })) });
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

  // ---- 7 段顯示器：74LS47 + 共陽極顯示器 + 7 顆 220 Ω（規格 2026-10-13 seven-seg 第 6 節） ----
  const pinNo = (defId: string, name: string) => getComponentDefinition(defId)!.pins.filter((p) => p.name === name).map((p) => p.number);
  const displayParts: Array<{ node: (typeof displays)[number]; ic: string; ds: string }> = displays.map((node, k) => ({ node, ic: `U${plans.length + k + 1}`, ds: `DS${k + 1}` }));
  for (const { node, ic } of displayParts) {
    icBlocks.push({ width: 8, place: (x) => components.push(comp(ic, '74LS47', hole(`F${x}`, icArea), { board: BOARD_ID })) });
    ['A', 'B', 'C', 'D'].forEach((name, i) => pinNo('74LS47', name).forEach((p) => tie(`${ic}#${p}`, driver.get(`${node.id}#${i}`)!)));
    for (const name of ['VCC', '/LT', '/BI/RBO', '/RBI']) pinNo('74LS47', name).forEach((p) => tie(`${ic}#${p}`, VCC));
    pinNo('74LS47', 'GND').forEach((p) => tie(`${ic}#${p}`, GND));
  }

  const twoLeads: TwoLead[] = [];
  let r = 0;
  inputs.forEach((node) => {
    const vcc = options.switchTo === 'vcc';
    twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: vcc ? 330 : 1000 }, span: RESISTOR_SPAN, nets: [node.id, vcc ? GND : VCC], area: 1, group: 'in' });
  });
  const leds: Record<string, string> = {};
  outputs.forEach((node, k) => {
    const source = driver.get(`${node.id}#0`)!;
    const mid = `led:${node.id}`;
    twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: 220 }, span: RESISTOR_SPAN, nets: [source, mid], area: 3, group: 'led' });
    twoLeads.push({ id: `D${k + 1}`, defId: 'led', props: { color: 'red', labels: [node.name ?? ''] }, span: 1, nets: [mid, GND], area: 3, group: 'led' });
    leds[node.id] = `D${k + 1}`;
  });
  const displayIds: Record<string, string> = {};
  for (const { node, ic, ds } of displayParts) {
    for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const out = `${ic}:/${s}`;
      const into = `${ds}:${s}`;
      pinNo('74LS47', `/${s}`).forEach((p) => tie(`${ic}#${p}`, out));
      pinNo('7seg-ca', s).forEach((p) => tie(`${ds}#${p}`, into));
      twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: 220 }, span: RESISTOR_SPAN, nets: [out, into], area: 3, group: ds });
    }
    pinNo('7seg-ca', 'CA').forEach((p) => tie(`${ds}#${p}`, VCC));
    displayIds[node.id] = ds;
  }
  for (const t of twoLeads) {
    tie(`${t.id}#1`, t.nets[0]);
    tie(`${t.id}#2`, t.nets[1]);
  }
  // 輸入的電阻、輸出的電阻與 LED、每個顯示器的電阻各自兩個一組（不混在一起）；MB-102 時都算第 1 區。
  // 顯示器本體（跨過凹槽，第 1 腳在 H 列、上排在 B 列）放在它的電阻後面。
  for (const group of [...new Set(twoLeads.map((t) => t.group))]) {
    const list = twoLeads.filter((t) => t.group === group);
    const area = list[0].area;
    // 兩個一組：第一個放 A 列、第二個放 J 列（同一段欄），各自用不同的導通群組。
    const size = 2;
    for (let i = 0; i < list.length; i += size) {
      const pair = list.slice(i, i + size);
      blocks[eic ? area : area === 1 ? 1 : 3].push({
        width: Math.max(...pair.map((t) => t.span)) + 1,
        place: (x) =>
          pair.forEach((t, j) =>
            components.push(comp(t.id, t.defId, hole(`${j === 0 ? 'A' : 'J'}${x}`, eic ? area : undefined), { board: BOARD_ID, props: t.props as never, ...(t.defId === 'resistor' ? { span: t.span } : {}) })),
          ),
      });
    }
    const shown = displayParts.find((p) => p.ds === group);
    if (shown)
      blocks[3].push({
        width: 5,
        place: (x) => components.push(comp(shown.ds, '7seg-ca', hole(`H${x}`, eic ? 3 : undefined), { board: BOARD_ID, props: { labels: [shown.node.name ?? ''] } as never })),
      });
  }
  // 順序：開關、輸入的電阻（靠近開關）、IC、輸出的電阻與 LED。MB-102 時全部排在同一列。
  if (eic) blocks[2].push(...icBlocks);
  else {
    blocks[1] = [...blocks[1], ...icBlocks, ...blocks[3]];
    blocks[3] = [];
  }
  for (const area of [1, 2, 3]) {
    const list = blocks[area];
    if (list.length === 0) continue;
    const used = list.reduce((sum, b) => sum + b.width, 0);
    const free = LAST_COLUMN - 1 - used; // 第 2–63 欄
    if (free < list.length + 1) throw new NoRoom();
    const gap = Math.min(MAX_GAP, Math.floor(free / (list.length + 1)));
    let x = 2 + gap;
    for (const b of list) {
      b.place(x);
      x += b.width + gap;
    }
  }

  // ---- 電源 ----
  if (eic) {
    // 接線柱只有一個孔，AI 佈線只能接一條線到它；改在每個插孔區上下的電源軌放 VCC / GND 符號（實際接線時從紅柱、黑柱拉到這些軌）。
    const rails: Array<[string, 'vcc' | 'gnd', string]> = [
      ['V1', 'vcc', 'P2+3'], ['G1', 'gnd', 'P3-3'],
      ['V2', 'vcc', 'P3+4'], ['G2', 'gnd', 'P4-4'],
      ['V3', 'vcc', 'P4+5'], ['G3', 'gnd', 'P5-5'],
    ];
    for (const [id, defId, at] of rails) {
      components.push(comp(id, defId, holeOn(BOARD_ID, at, layout), { board: BOARD_ID }));
      tie(`${id}#1`, defId === 'vcc' ? VCC : GND);
    }
  } else {
    // 上下兩組電源軌都接上 +5 V 與 GND（實際接線時用跳線把上下的軌接通），每個元件就近取電。
    components.push(comp('V1', 'vcc', 'T+3', { board: BOARD_ID }));
    components.push(comp('G1', 'gnd', 'B-3', { board: BOARD_ID }));
    components.push(comp('V2', 'vcc', 'B+4', { board: BOARD_ID }));
    components.push(comp('G2', 'gnd', 'T-4', { board: BOARD_ID }));
    tie('V1#1', VCC);
    tie('G1#1', GND);
    tie('V2#1', VCC);
    tie('G2#1', GND);
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
  if (displays.length > 0) ics['74LS47'] = displays.length;
  return {
    ok: true,
    circuit,
    bom: { ics, switch: swDef, resistors: twoLeads.filter((t) => t.defId === 'resistor').length, leds: outputs.length, displays: displays.length, layout },
    switchId: 'SW1',
    inputs: inputs.map((n) => n.id),
    leds,
    displays: displayIds,
    netOf,
  };
}
