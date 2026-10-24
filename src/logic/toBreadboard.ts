import { getNode, parseHoleName } from '../core/breadboard/naming';
import { getBoard, getLayout } from '../core/breadboard/registry';
import { resolveFootprint } from '../core/circuit/footprint';
import { getComponentDefinition } from '../core/circuit/library';
import { connectPowerToNearestRails } from '../core/circuit/powerRails';
import { validateCircuit } from '../core/circuit/validate';
import { groupIdAt } from '../editor/analysis';
import { board, comp, holeOn } from '../editor/builder';
import { freeHolesInGroup } from '../editor/explain/helpers';
import type { LayoutId } from '../types/board';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentInstance } from '../types/component';
import type { GridPoint } from '../types/geometry';
import { SEGMENT_NAMES, sortedIo } from './evaluate';
import { toNandUnits, toNorUnits } from './nandOnly';
import { BLOCK_DEFAULTS, BLOCK_PINS } from './blocks';
import { assignIcs, convertProblem, displayResistorsOf, decompose, drivers, gateSlots, type IcPlan, type Unit } from './synth';
import { isSink, signalOf, type LogicDiagram, type LogicNode } from './types';

export interface ConvertOptions {
  /** 開關的另一側接 +5 V（撥 ON = 1，330 Ω 下拉）或 GND（撥 ON = 0，1 kΩ 上拉）。 */
  switchTo: 'vcc' | 'gnd';
  board: 'auto' | LayoutId;
  /** 照種類對應（預設）、只用 NAND（74LS00）或只用 NOR（74LS02，子專案 27）。 */
  gates?: 'direct' | 'nand' | 'nor';
  /** 子專案 19：輸入要不要接上 / 下拉電阻（預設不接，開關直接接 IC 輸入；模擬時當成理想開關）。 */
  pulls?: boolean;
  /** 子專案 30：輸入用指撥開關（預設）或每個輸入一顆按鈕。 */
  inputs?: 'switch' | 'button';
  /** 子專案 32：7 段顯示器用共陽極 + 74LS47（預設）或共陰極 + 74LS48。 */
  display?: 'ca' | 'cc';
  /**
   * 子專案 44：7 段顯示器每段一顆 220 Ω（亮度一致）或共同腳共用一顆 100 Ω（線比較少，亮的段越多越暗）。
   * 沒指定時 1 個顯示器每段一顆、2 個共用一顆（每段一顆時 2 個排不完）。
   */
  displayResistors?: 'each' | 'shared';
}

export interface Bom {
  ics: Record<string, number>;
  /** 指撥開關；輸入用按鈕時是 null。 */
  switch: 'dipsw-4' | 'dipsw-8' | null;
  /** 子專案 38：指撥開關的個數（拆成兩個 4 位元時是 2；輸入用按鈕時是 0）。 */
  switches: number;
  /** 子專案 30：按鈕的個數（輸入用指撥開關時是 0）。 */
  buttons: number;
  resistors: number;
  leds: number;
  /** 7 段顯示器（共陽極）的個數。 */
  displays: number;
  layout: LayoutId;
}

/** 子專案 38：零件清單裡開關那一項（「8 位元指撥開關 × 1」「4 位元指撥開關 × 2」「按鈕 × 3」）。 */
export function switchText(bom: Pick<Bom, 'switch' | 'switches' | 'buttons'>): string {
  return bom.switch ? `${bom.switch === 'dipsw-4' ? '4' : '8'} 位元指撥開關 × ${bom.switches}` : `按鈕 × ${bom.buttons}`;
}

export type ConvertResult =
  | {
      ok: true;
      circuit: Circuit;
      bom: Bom;
      /** 輸入用按鈕時是 null。 */
      switchId: 'SW1' | null;
      /** 子專案 30：輸入用按鈕時，第 k 個輸入的按鈕 id。 */
      buttons?: string[];
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
/**
 * 子專案 36（規格 2026-10-20 conversion-placement）：擺法。gap：區塊之間最多空幾欄；leds：輸出的電阻與 LED 怎麼擺
 * （pair：電阻在 A 列、LED 在 B 列，兩組一塊、第二組在下半部；straddle：電阻直立跨過凹槽、LED 在 I 列，每顆 2 欄）；
 * split：MB-102 上 4 顆以上的 LED 分兩邊（一半在開關左邊）。convertRoute 會試好幾種擺法挑佈線最好的。
 * oneRow：子專案 38，只在 EIC-1106：全部排在第 2 區一排（和 MB-102 一樣），上下兩區與電源軌留給跨線。
 * splitSwitches：子專案 38，加上 / 下拉電阻、輸入超過 4 個時，開關拆成兩個 4 位元：每個都能挪到電源軌有孔的地方，電阻都直立插進軌；
 * 排成一排時第二個放在第一顆 IC 後面。沒有電阻或輸入 4 個以下時沒有作用（一個開關的線比較少）。
 */
export interface LayoutVariant {
  gap: number;
  leds: 'pair' | 'straddle';
  split: boolean;
  oneRow?: true;
  splitSwitches?: true;
}

/** 預設擺法（子專案 36 以前的擺法）。 */
export const DEFAULT_LAYOUT: LayoutVariant = { gap: 6, leds: 'pair', split: false };

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
  /** 子專案 37：低態致動的 LED 轉 180°（陰極在電阻那一側、陽極接 +5 V）。 */
  reversed?: true;
}

class NoRoom extends Error {}

/** 一個要放的區塊：寬度、放置方式，以及（可有可無的）要放在哪一欄才行。 */
interface Block {
  width: number;
  place: (x: number) => void;
  /** 子專案 36：這一欄可以放嗎（例如直立的電阻要插進電源軌的孔）；放不行時往右挪，最多 5 欄。 */
  align?: (x: number) => boolean;
}

/** 拆好的單元；只用 NAND / NOR 時再換成那一種 2 輸入閘（輸出端接的訊號一定保留）。 */
function unitsFor(d: LogicDiagram, options: ConvertOptions) {
  const extra = displayInverters(d, options);
  const units = [...decompose(d), ...extra];
  if (options.gates !== 'nand' && options.gates !== 'nor') return units;
  // 接到輸出端、顯示器、IC 方塊的訊號一定保留（方塊照原本的 IC 放，不換成 NAND / NOR）。
  const driver = drivers(d);
  const keep = d.wires
    .filter((w) => {
      const kind = d.nodes.find((n) => n.id === w.to.node)?.kind ?? 'AND';
      return isSink(kind) || kind === 'BLOCK';
    })
    .map((w) => driver.get(`${w.to.node}#${w.to.pin}`)!);
  keep.push(...extra.map((u) => u.output));
  return options.gates === 'nand' ? toNandUnits(units, keep) : toNorUnits(units, keep);
}

/** 顯示器上直接由邏輯驅動的腳（DP，或每段直接控制的段）：[腳的編號, 段名]。 */
function directPins(node: LogicNode): Array<[number, string]> {
  return node.segments ? SEGMENT_NAMES.map((s, p): [number, string] => [p, s]) : [[4, 'dp']];
}

/** 共陽極的顯示器亮的段要接低電位：DP 與每段直接控制的段先經過一個反相器（子專案 32）。 */
function displayInverters(d: LogicDiagram, options: ConvertOptions): Unit[] {
  if (options.display === 'cc') return [];
  const driver = drivers(d);
  return d.nodes
    .filter((n) => n.kind === 'DISPLAY')
    .flatMap((n) => directPins(n).flatMap(([p]) => (driver.has(`${n.id}#${p}`) ? [{ kind: 'NOT' as const, inputs: [driver.get(`${n.id}#${p}`)!], output: `inv~${n.id}~${p}` }] : [])));
}

/**
 * 子專案 45：每個輸入第一次被哪顆 IC 用到（IC 的順序和放在板上的順序一樣：邏輯閘、IC 方塊、顯示器的解碼 IC）；
 * 只接到 LED 等其他零件的輸入排在最後。
 */
function icOrderOf(d: LogicDiagram, plans: IcPlan[], chips: LogicNode[]): Map<string, number> {
  const first = new Map<string, number>();
  const mark = (signal: string | undefined, k: number) => {
    if (signal !== undefined && !first.has(signal)) first.set(signal, k);
  };
  plans.forEach((plan, k) => plan.slots.forEach((unit) => unit?.inputs.forEach((signal) => mark(signal, k))));
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, signalOf(w.from, w.fromPin)]));
  const later = [...chips, ...d.nodes.filter((n) => n.kind === 'DISPLAY' && !n.segments)];
  later.forEach((node, j) => {
    for (const [key, signal] of driver) if (key.startsWith(`${node.id}#`)) mark(signal, plans.length + j);
  });
  return first;
}

/** 子專案 45：拆成兩個 4 位元開關時依「哪顆 IC 先用到」分組（同一顆 IC 的輸入盡量在同一個開關）；每個開關裡照名稱排。 */
export function splitByIc(inputs: LogicNode[], order: Map<string, number>): [LogicNode[], LogicNode[]] {
  const rank = (n: LogicNode) => order.get(n.id) ?? Number.MAX_SAFE_INTEGER;
  const sorted = inputs.map((n, k) => ({ n, k })).sort((a, b) => rank(a.n) - rank(b.n) || a.k - b.k).map((x) => x.n);
  const byName = (list: LogicNode[]) => [...list].sort((a, b) => inputs.indexOf(a) - inputs.indexOf(b));
  return [byName(sorted.slice(0, 4)), byName(sorted.slice(4))];
}

/** 規格（2026-10-13 logic-to-breadboard）第 4、5 節。 */
export function toBreadboard(d: LogicDiagram, options: ConvertOptions, variant: LayoutVariant = DEFAULT_LAYOUT): ConvertResult {
  const problem = convertProblem(d, options);
  if (problem) return { ok: false, reason: problem };
  // 有 7 段顯示器時 MB-102 的線排不完（規格 2026-10-13 seven-seg 第 6 節），自動選板直接用 EIC-1106。
  const hasDisplay = d.nodes.some((n) => n.kind === 'DISPLAY');
  const layouts: LayoutId[] = options.board !== 'auto' ? [options.board] : hasDisplay ? ['EIC1106'] : ['MB102', 'EIC1106'];
  for (const layout of layouts) {
    try {
      return build(d, options, layout, variant);
    } catch (err) {
      if (!(err instanceof NoRoom)) throw err;
    }
  }
  if (options.board === 'MB102') return { ok: false, reason: 'MB-102 放不下，請改用 EIC-1106' };
  const chips = assignIcs(unitsFor(d, options)).length;
  return { ok: false, reason: `零件太多，一塊 EIC-1106 放不下（需要 ${chips} 片 IC）` };
}

function build(d: LogicDiagram, options: ConvertOptions, layout: LayoutId, variant: LayoutVariant): ConvertResult {
  const eic = layout === 'EIC1106';
  // 子專案 38：排成一排（MB-102，或 EIC-1106 的一排擺法）時，EIC-1106 上的東西全部放在第 2 區。
  const inOneRow = !eic || variant.oneRow === true;
  const hole = (name: string, area?: number) => holeOn(BOARD_ID, eic ? `${inOneRow ? 2 : area}-${name}` : name, layout);
  const { inputs, outputs: sinks } = sortedIo(d);
  const outputs = sinks.filter((n) => n.kind === 'OUTPUT');
  const displays = sinks.filter((n) => n.kind === 'DISPLAY');
  const driver = drivers(d);
  const plans = assignIcs(unitsFor(d, options));
  const chips = d.nodes.filter((n) => n.kind === 'BLOCK' && n.chip);

  const components: ComponentInstance[] = [];
  const netOf: Record<string, string> = {};
  const tie = (pin: string, net: string) => (netOf[pin] = net);
  const extra = new Map<string, GridPoint[]>(); // 接線柱等非元件腳的終端

  // ---- 放置：開關、IC 跨凹槽排一列；兩腳元件兩個一組放在 A 列與 J 列 ----
  // 先列出每一區要放的東西（寬度與放置方式），再把剩下的欄平均分成間隔（最多 6 欄），留空間給 AI 佈線拉線。
  const blocks: Record<number, Block[]> = { 1: [], 2: [], 3: [] };
  const icArea = eic ? 2 : 1;
  const icBlocks: Block[] = [];
  /** MB-102 上 LED 分兩邊時，放在開關左邊的那一半。 */
  const ledsBefore: Block[] = [];

  // ---- 子專案 36：上 / 下拉電阻直立，一端插在開關那一排、另一端直接插進電源軌（不用另外拉線） ----
  // 開關接 +5 V 時是下拉：從 J 列往下插進 − 軌；接 GND 時是上拉：從 A 列往上插進 + 軌。電源軌每 6 欄少一個孔，
  // 所以放開關時往右挪到每個輸入那一排都有孔；6 個以上的輸入一定會碰到一欄沒有孔，那一個（第 6 個）照舊用平放的電阻。
  const boardModel = getBoard(layout, BOARD_ID);
  const railHole = (rail: string, col: number) => {
    const p = parseHoleName(boardModel, `${rail}${col}`);
    return p !== null && getNode(boardModel, p.x, p.y)?.kind === 'hole';
  };
  const pullDown = options.switchTo === 'vcc';
  const uprightPulls = options.pulls === true && options.inputs !== 'button';
  // 子專案 38：拆成兩個 4 位元開關時，每個開關各自挪到有孔的地方，不用平放的電阻。
  const splitSwitches = variant.splitSwitches === true && uprightPulls && inputs.length > 4;
  const flatPull = uprightPulls && inputs.length >= 6 && !splitSwitches ? 5 : -1;
  /** 每個開關接的輸入（依名稱排序）；拆開時依「哪顆 IC 先用到」分組（子專案 45），開關比較靠近用到它的 IC。 */
  const switches = splitSwitches ? splitByIc(inputs, icOrderOf(d, plans, chips)) : [inputs];
  const swDef = splitSwitches || inputs.length <= 4 ? 'dipsw-4' : 'dipsw-8';
  const swPins = swDef === 'dipsw-4' ? 8 : 16;
  const switchBlocks: Block[] = [];
  // EIC-1106 分區時開關在第 1 區（下面 P3、上面 P2）；一排時在第 2 區（下面 P4、上面 P3）。
  const pullRail = pullDown ? (!eic ? 'B-' : inOneRow ? 'P4-' : 'P3-') : !eic ? 'T+' : inOneRow ? 'P3+' : 'P2+';
  const pullRow = pullDown ? 'J' : 'A';

  // 子專案 46：時脈換成麵包板的時脈元件（理想方波；實際接線時接到實驗箱的脈波產生器或 555），放在開關前面。
  const clockNode = d.nodes.find((n) => n.kind === 'CLOCK');
  if (clockNode) {
    blocks[1].push({ width: 2, place: (x) => components.push(comp('CLK1', 'clock', hole(`C${x}`, 1), { board: BOARD_ID })) });
    tie('CLK1#1', clockNode.id);
  }

  const useButtons = options.inputs === 'button';
  const buttonIds = inputs.map((_, k) => `BTN${k + 1}`);
  if (useButtons) {
    // 子專案 30：每個輸入一顆按鈕，跨過凹槽（第 1、2 腳是一側，第 3、4 腳是另一側）；一側接電源、另一側接輸入。
    inputs.forEach((node, k) => {
      const id = buttonIds[k];
      blocks[1].push({ width: 3, place: (x) => components.push(comp(id, 'pushbutton', hole(`F${x}`, 1), { board: BOARD_ID, props: { labels: [node.name ?? ''] } })) });
      tie(`${id}#1`, options.switchTo === 'vcc' ? VCC : GND);
      tie(`${id}#3`, node.id);
    });
  } else {
    switches.forEach((group, s) => {
      const id = `SW${s + 1}`;
      switchBlocks.push({
        width: swPins / 2,
        // 電阻的編號依輸入的順序（子專案 45 起兩個開關的輸入不一定連號）。
        align: uprightPulls ? (x) => group.every((node, j) => (inputs.indexOf(node) === flatPull) !== railHole(pullRail, x + j)) : undefined,
        place: (x) => {
          components.push(comp(id, swDef, hole(`F${x}`, 1), { board: BOARD_ID, props: { switchStates: Array(swPins / 2).fill(false), labels: Array.from({ length: swPins / 2 }, (_, j) => group[j]?.name ?? '') } }));
          if (!uprightPulls) return;
          group.forEach((node, j) => {
            const k = inputs.indexOf(node);
            if (k === flatPull || !railHole(pullRail, x + j)) return;
            const rid = `R${k + 1}`;
            const at = hole(`${pullRow}${x + j}`, 1);
            const span = Math.abs(holeOn(BOARD_ID, `${pullRail}${x + j}`, layout).y - at.y);
            components.push(comp(rid, 'resistor', at, { board: BOARD_ID, rotation: pullDown ? 90 : 270, span, props: { resistance: pullDown ? 330 : 1000 } as never }));
            tie(`${rid}#1`, node.id);
            tie(`${rid}#2`, pullDown ? GND : VCC);
          });
        },
      });
      // 開關接電源的那一側要靠近那條電源軌：+5 V 在上方（E 列那一側的腳 9 − j），GND 在下方（F 列那一側的腳 j）。
      group.forEach((node, j) => {
        const top = `${id}#${swPins - j}`;
        const bottom = `${id}#${j + 1}`;
        if (options.switchTo === 'vcc') {
          tie(bottom, node.id);
          tie(top, VCC);
        } else {
          tie(top, node.id);
          tie(bottom, GND);
        }
      });
    });
  }
  // 子專案 38：兩個開關排成一排時，第二個放在第一顆 IC 後面（靠近用到它的 IC）；EIC-1106 分區時兩個都在第 1 區。
  const laterSwitches = splitSwitches && inOneRow ? switchBlocks.slice(1) : [];
  blocks[1].push(...switchBlocks.filter((b) => !laterSwitches.includes(b)));

  for (const plan of plans) {
    icBlocks.push({ width: 7, place: (x) => components.push(comp(plan.id, plan.defId, hole(`F${x}`, icArea), { board: BOARD_ID })) });
    const def = getComponentDefinition(plan.defId)!;
    for (const p of def.pins) {
      if (p.role === 'power') tie(`${plan.id}#${p.number}`, VCC);
      if (p.role === 'ground') tie(`${plan.id}#${p.number}`, GND);
    }
    gateSlots(plan.defId).forEach((slot, i) => {
      const unit = plan.slots[i];
      // 子專案 19：沒用到的閘不接線（輸入懸空，整組沒用到時檢查不會警告）。
      if (!unit) return;
      slot.inputs.forEach((pin, j) => tie(`${plan.id}#${pin}`, unit.inputs[j]));
      tie(`${plan.id}#${slot.output}`, unit.output);
    });
  }

  // ---- IC 方塊：放那顆 IC，腳依名稱接（規格 2026-10-13 logic-blocks 第 7 節）；沒用到的輸出只有自己一隻腳，不會拉線 ----
  chips.forEach((node, k) => {
    const chip = node.chip!;
    const ic = `U${plans.length + k + 1}`;
    const def = getComponentDefinition(chip)!;
    icBlocks.push({ width: def.pins.length / 2, place: (x) => components.push(comp(ic, chip, hole(`F${x}`, icArea), { board: BOARD_ID })) });
    const numberOf = (name: string) => def.pins.find((p) => p.name === name)!.number;
    for (const p of def.pins) {
      if (p.role === 'power') tie(`${ic}#${p.number}`, VCC);
      if (p.role === 'ground') tie(`${ic}#${p.number}`, GND);
    }
    // 子專案 46：時序 IC 沒接的輸入接到 +5 V / GND（BLOCK_DEFAULTS，例如 /CLR 接 +5 V 不用）。
    const defaults = BLOCK_DEFAULTS[chip] ?? {};
    BLOCK_PINS[chip].inputs.forEach((name, i) => {
      const signal = driver.get(`${node.id}#${i}`) ?? (name in defaults ? (defaults[name] === 1 ? VCC : GND) : undefined);
      if (signal) tie(`${ic}#${numberOf(name)}`, signal);
    });
    BLOCK_PINS[chip].outputs.forEach((name, i) => tie(`${ic}#${numberOf(name)}`, signalOf(node.id, i)));
  });

  // ---- 7 段顯示器：74LS47 + 共陽極顯示器 + 7 顆 220 Ω（規格 2026-10-13 seven-seg 第 6 節）；
  //      子專案 32：共陰極時是 74LS48 + 共陰極顯示器，共同腳接 GND ----
  const pinNo = (defId: string, name: string) => getComponentDefinition(defId)!.pins.filter((p) => p.name === name).map((p) => p.number);
  const cc = options.display === 'cc';
  const decoder = cc ? '74LS48' : '74LS47';
  const dsDef = cc ? '7seg-cc' : '7seg-ca';
  const segOut = (s: string) => (cc ? s : `/${s}`);
  // 每段直接控制的顯示器不用解碼 IC。
  let nextIc = plans.length + chips.length;
  const displayParts: Array<{ node: (typeof displays)[number]; ic: string | null; ds: string }> = displays.map((node, k) => ({ node, ic: node.segments ? null : `U${++nextIc}`, ds: `DS${k + 1}` }));
  for (const { node, ic } of displayParts) {
    if (!ic) continue;
    icBlocks.push({ width: 8, place: (x) => components.push(comp(ic, decoder, hole(`F${x}`, icArea), { board: BOARD_ID })) });
    ['A', 'B', 'C', 'D'].forEach((name, i) => pinNo(decoder, name).forEach((p) => tie(`${ic}#${p}`, driver.get(`${node.id}#${i}`)!)));
    for (const name of ['VCC', '/LT', '/BI/RBO', '/RBI']) pinNo(decoder, name).forEach((p) => tie(`${ic}#${p}`, VCC));
    pinNo(decoder, 'GND').forEach((p) => tie(`${ic}#${p}`, GND));
  }

  const twoLeads: TwoLead[] = [];
  let r = 0;
  if (options.pulls) inputs.forEach((node, k) => {
    // 直立的電阻在放開關時一起放（編號一樣是 R1、R2…，依輸入的順序）。
    if (uprightPulls && k !== flatPull) return;
    twoLeads.push({ id: `R${k + 1}`, defId: 'resistor', props: { resistance: pullDown ? 330 : 1000 }, span: RESISTOR_SPAN, nets: [node.id, pullDown ? GND : VCC], area: 1, group: 'in' });
  });
  if (options.pulls) r = inputs.length;
  const leds: Record<string, string> = {};
  outputs.forEach((node, k) => {
    const source = driver.get(`${node.id}#0`)!;
    const mid = `led:${node.id}`;
    // 子專案 37：低態致動時 LED 陽極接 +5 V、陰極經過電阻接到輸出（0 時亮）；一般是輸出經過電阻接陽極、陰極接 GND。
    const low = node.activeLow === true;
    twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: 220 }, span: RESISTOR_SPAN, nets: [source, mid], area: 3, group: 'led' });
    twoLeads.push({ id: `D${k + 1}`, defId: 'led', props: { color: 'red', labels: [node.name ?? ''] }, span: 1, nets: low ? [VCC, mid] : [mid, GND], area: 3, group: 'led', ...(low ? { reversed: true as const } : {}) });
    leds[node.id] = `D${k + 1}`;
  });
  const displayIds: Record<string, string> = {};
  // 子專案 44：共用一顆電阻時段直接接，電阻在共同腳。
  const shared = displayResistorsOf(d, options.displayResistors) === 'shared';
  for (const { node, ic, ds } of displayParts) {
    /** 一段：每段一顆電阻時經過 220 Ω，共用時直接接。 */
    const segment = (signal: string, s: string) => {
      if (shared) {
        pinNo(dsDef, s).forEach((n) => tie(`${ds}#${n}`, signal));
        return;
      }
      const into = `${ds}:${s}`;
      pinNo(dsDef, s).forEach((n) => tie(`${ds}#${n}`, into));
      twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: 220 }, span: RESISTOR_SPAN, nets: [signal, into], area: 3, group: ds });
    };
    // DP 與每段直接控制的段：共陰極直接接訊號；共陽極先經過反相器（見 displayInverters）。
    for (const [p, s] of directPins(node)) {
      const signal = driver.get(`${node.id}#${p}`);
      if (signal) segment(cc ? signal : `inv~${node.id}~${p}`, s);
    }
    if (ic) for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const out = `${ic}:${segOut(s)}`;
      pinNo(decoder, segOut(s)).forEach((p) => tie(`${ic}#${p}`, out));
      segment(out, s);
    }
    const common = cc ? 'CC' : 'CA';
    if (shared) {
      const at = `${ds}:${common}`;
      pinNo(dsDef, common).forEach((p) => tie(`${ds}#${p}`, at));
      twoLeads.push({ id: `R${++r}`, defId: 'resistor', props: { resistance: 100 }, span: RESISTOR_SPAN, nets: cc ? [at, GND] : [VCC, at], area: 3, group: ds });
    } else pinNo(dsDef, common).forEach((p) => tie(`${ds}#${p}`, cc ? GND : VCC));
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
    if (group === 'led') {
      const at = (row: string, col: number) => hole(`${row}${col}`, eic ? area : undefined);
      // 子專案 37：低態致動的 LED 轉 180°、往右一欄放：陰極還是和電阻的那一腳同一排，陽極在右邊一排。
      const putLed = (led: TwoLead, row: string, col: number) =>
        components.push(comp(led.id, led.defId, at(row, led.reversed ? col + 1 : col), { board: BOARD_ID, ...(led.reversed ? { rotation: 180 as const } : {}), props: led.props as never }));
      const units: Array<[TwoLead, TwoLead]> = [];
      for (let i = 0; i < list.length; i += 2) units.push([list[i], list[i + 1]]);
      const ledBlocks: Block[] = [];
      if (variant.leds === 'straddle') {
        // 子專案 36：電阻直立跨過凹槽（E → F），LED 在 I 列：陽極和電阻的下端同一排（不用接線）、陰極在右邊一排；每顆 2 欄，一顆接一顆。
        // （低態致動時相反：陰極和電阻同一排、陽極在右邊一排。）
        const half = Math.floor(units.length / 2);
        const chunks = variant.split && inOneRow && units.length >= 4 ? [units.slice(0, half), units.slice(half)] : [units];
        for (const chunk of chunks)
          ledBlocks.push({
            width: chunk.length * 2,
            place: (x) =>
              chunk.forEach(([res, led], j) => {
                components.push(comp(res.id, res.defId, at('E', x + 2 * j), { board: BOARD_ID, rotation: 90, props: res.props as never, span: 3 }));
                putLed(led, 'I', x + 2 * j);
              }),
          });
      } else {
        // 輸出的電阻緊鄰 LED：電阻在 A 列 x～x+3，LED 在 B 列、陽極在 x+3（和電阻的另一腳同一排，不用接線）、陰極在 x+4。
        // 兩組一塊：第二組放在下半部（電阻 J 列、LED I 列）。
        for (let i = 0; i < units.length; i += 2) {
          const pair = units.slice(i, i + 2);
          ledBlocks.push({
            width: RESISTOR_SPAN + 2,
            place: (x) =>
              pair.forEach(([res, led], j) => {
                const [rRow, dRow] = j === 0 ? ['A', 'B'] : ['J', 'I'];
                components.push(comp(res.id, res.defId, at(rRow, x), { board: BOARD_ID, props: res.props as never, span: res.span }));
                putLed(led, dRow, x + res.span);
              }),
          });
        }
      }
      // 子專案 36：MB-102 上 4 顆以上的 LED 可以分兩邊，前一半放在開關左邊。
      if (variant.split && inOneRow && units.length >= 4 && ledBlocks.length >= 2) {
        const before = Math.floor(ledBlocks.length / 2);
        ledsBefore.push(...ledBlocks.slice(0, before));
        blocks[3].push(...ledBlocks.slice(before));
      } else blocks[eic ? area : 3].push(...ledBlocks);
      continue;
    }
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
        place: (x) => components.push(comp(shown.ds, dsDef, hole(`H${x}`, eic ? 3 : undefined), { board: BOARD_ID, props: { labels: [shown.node.name ?? ''] } as never })),
      });
  }
  // 順序：開關、輸入的電阻（靠近開關）、IC、輸出的電阻與 LED。排成一排時（MB-102、EIC-1106 的一排擺法）全部排在同一列。
  if (!inOneRow) blocks[2].push(...icBlocks);
  else {
    blocks[1] = [...ledsBefore, ...blocks[1], ...icBlocks.slice(0, 1), ...laterSwitches, ...icBlocks.slice(1), ...blocks[3]];
    blocks[3] = [];
  }
  for (const area of [1, 2, 3]) {
    const list = blocks[area];
    if (list.length === 0) continue;
    const used = list.reduce((sum, b) => sum + b.width, 0);
    const free = LAST_COLUMN - 1 - used; // 第 2–63 欄
    if (free < list.length + 1) throw new NoRoom();
    const gap = Math.min(variant.gap, Math.floor(free / (list.length + 1)));
    let x = 2 + gap;
    for (const b of list) {
      for (let i = 0; i < 6 && b.align && !b.align(x); i++) x++;
      if (b.align && !b.align(x)) throw new NoRoom();
      b.place(x);
      x += b.width + gap;
    }
    if (x - gap > LAST_COLUMN + 1) throw new NoRoom();
  }

  // ---- 電源 ----
  // 子專案 34：先各放一個 5V / GND 符號，接好所有連線後再用 connectPowerToNearestRails 改成「每個要接電源的腳接最近的軌、
  // 用到的軌各插一個符號、軌和軌之間不拉線」（EIC-1106 的接線柱只有一個孔，所以符號一樣放在電源軌上，實際接線時從紅柱、黑柱拉過來）。
  // 子專案 36：直立的電阻可能插在第 3 欄，所以符號插在那條軌第一個空的孔。
  const taken = new Set(
    components.flatMap((c) => {
      const fp = resolveFootprint(c, getComponentDefinition(c.defId)!);
      return [...fp.pins.map((p) => p.point), ...fp.blocked].map((p) => `${p.x},${p.y}`);
    }),
  );
  const power: Array<[string, 'vcc' | 'gnd', string]> = !eic
    ? [['V1', 'vcc', 'T+'], ['G1', 'gnd', 'B-']]
    : inOneRow
      ? [['V1', 'vcc', 'P3+'], ['G1', 'gnd', 'P4-']]
      : [['V1', 'vcc', 'P2+'], ['G1', 'gnd', 'P3-']];
  for (const [id, defId, rail] of power) {
    let at: GridPoint | null = null;
    for (let col = 3; col <= LAST_COLUMN && !at; col++) {
      if (!railHole(rail, col)) continue;
      const p = holeOn(BOARD_ID, `${rail}${col}`, layout);
      if (!taken.has(`${p.x},${p.y}`)) at = p;
    }
    if (!at) throw new NoRoom();
    components.push(comp(id, defId, at, { board: BOARD_ID }));
    tie(`${id}#1`, defId === 'vcc' ? VCC : GND);
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
  const powered = connectPowerToNearestRails({ ...base, wires });
  const circuit = powered.circuit;
  for (const id of powered.removed) delete netOf[`${id}#1`];
  for (const c of powered.added) tie(`${c.id}#1`, c.defId === 'vcc' ? VCC : GND);

  const errors = validateCircuit(circuit).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'));
  if (errors.length > 0) return { ok: false, reason: `轉換失敗：${errors[0].message}（這是程式的錯，請回報）` };

  const ics: Record<string, number> = {};
  for (const p of plans) ics[p.defId] = (ics[p.defId] ?? 0) + 1;
  for (const b of chips) ics[b.chip!] = (ics[b.chip!] ?? 0) + 1;
  const decoders = displays.filter((n) => !n.segments).length;
  if (decoders > 0) ics[decoder] = decoders;
  return {
    ok: true,
    circuit,
    bom: { ics, switch: useButtons ? null : swDef, switches: useButtons ? 0 : switches.length, buttons: useButtons ? inputs.length : 0, resistors: components.filter((c) => c.defId === 'resistor').length, leds: outputs.length, displays: displays.length, layout },
    switchId: useButtons ? null : 'SW1',
    ...(useButtons ? { buttons: buttonIds } : {}),
    inputs: inputs.map((n) => n.id),
    leds,
    displays: displayIds,
    netOf,
  };
}
