import { getComponentDefinition } from '../core/circuit/library';
import { whyDark } from '../core/simulation/darkDisplay';
import { compileSimulation, initialSimState, settle, type SimCircuit, type SimResult } from '../core/simulation/simulate';
import type { Circuit } from '../types/circuit';
import { segmentToken, sequenceTable, sortedIo, truthTable } from './evaluate';
import { valueOfSegments } from './sevenSeg';
import type { LogicDiagram } from './types';

export interface VerifyResult {
  rows: number;
  /** 子專案 46：時序電路的比對：每種輸入組合送幾個脈衝（rows 是組合數）。 */
  pulses?: number;
  /** expected / actual：每個輸出欄一格（輸出端 0 / 1 / ?，顯示器是十進位數字或 ?；麵包板上的顯示器不是因為輸入 15 而全暗時是「暗」）。 */
  mismatches: Array<{ inputs: string; expected: string[]; actual: string[] }>;
}

export interface VerifyMap {
  /** 輸入用按鈕時是 null（看 buttons）。 */
  switchId: string | null;
  /** 子專案 30：第 k 個輸入的按鈕 id。 */
  buttons?: string[];
  /** 依名稱排序的輸入端 id：第 k 個用開關的第 k 位。 */
  inputs: string[];
  /** 輸出端 id → LED 元件 id。 */
  leds: Record<string, string>;
  /** 顯示器 id → 7 段顯示器元件 id。 */
  displays?: Record<string, string>;
}

/** 子專案 22：邏輯圖的一個輸入端對應到哪個指撥開關的第幾個開關，以及撥 ON 時是 1 還是 0。 */
export interface SwitchBinding {
  node: string;
  switchId: string;
  /** 第幾個開關（0 起算）。 */
  index: number;
  onIs: 0 | 1;
  /** 子專案 30：是按鈕（switchId 是按鈕的 id，index 是 0）：那一列的值 === onIs 時當成按住。 */
  button?: true;
}

export interface Bindings {
  /** 依名稱排序（和真值表的輸入欄同一順序）。 */
  inputs: SwitchBinding[];
  /** 輸出端 id → LED 元件 id。 */
  leds: Record<string, string>;
  /** 顯示器 id → 7 段顯示器元件 id。 */
  displays: Record<string, string>;
  /** 子專案 46：時序電路的時脈元件 id。 */
  clock?: string;
}

/** 子專案 30：按鈕對應的這一列要不要按住。 */
export function pressedFor(inputs: SwitchBinding[], bits: ReadonlyArray<0 | 1>): Record<string, boolean> {
  const pressed: Record<string, boolean> = {};
  inputs.forEach((b, k) => {
    if (b.button && bits[k] !== undefined) pressed[b.switchId] = bits[k] === b.onIs;
  });
  return pressed;
}

/** 把每個對應到的開關撥成這一列的值（值 === onIs 就撥 ON）；沒對應到的開關維持原狀；按鈕不在這裡處理。 */
export function withSwitches(circuit: Circuit, inputs: SwitchBinding[], bits: ReadonlyArray<0 | 1>): Circuit {
  const changes = new Map<string, Map<number, boolean>>();
  inputs.forEach((b, k) => {
    if (bits[k] === undefined || b.button) return;
    if (!changes.has(b.switchId)) changes.set(b.switchId, new Map());
    changes.get(b.switchId)!.set(b.index, bits[k] === b.onIs);
  });
  return {
    ...circuit,
    components: circuit.components.map((c) => {
      const set = changes.get(c.id);
      if (!set) return c;
      const states = [...(c.props.switchStates ?? getComponentDefinition(c.defId)?.defaultProps.switchStates ?? [])];
      for (const [index, on] of set) states[index] = on;
      return { ...c, props: { ...c.props, switchStates: states } };
    }),
  };
}

/**
 * 規格（2026-10-13 logic-to-breadboard）第 7 節：真值表的每一列都在麵包板上模擬一次，讀 LED 亮不亮，和邏輯圖比較。
 * 顯示器（規格 2026-10-13 seven-seg 第 7 節）讀亮的段、對回數字。
 * 子專案 22：開關可以分在好幾個指撥開關上，每個開關自己決定撥 ON 是 1 還是 0。
 * 全暗的顯示器只有在 74LS47 的輸入真的是 15 時才算 15（沒通電、沒接好也是全暗，不能算對）。
 */
export function verifyRows(d: LogicDiagram, circuit: Circuit, bindings: Bindings): VerifyResult {
  const table = truthTable(d);
  if (!table.ok) return { rows: 0, mismatches: [] };
  const outputs = sortedIo(d).outputs.map((o) => ({ id: o.id, display: o.kind === 'DISPLAY', segments: !!o.segments }));
  return verifyExpected(circuit, bindings, outputs, table.rows.map((row) => ({ in: row.in, out: row.out.map((b) => (b === 'X' ? '?' : String(b))) })));
}

/** 一列的輸入與期望值：輸出端 0 / 1 / ?，顯示器是數字或 ?；X 是不在乎（子專案 24 的題目），不比。 */
export interface ExpectedRow {
  in: Array<0 | 1>;
  out: string[];
}

/** 子專案 37：陽極直接接在 +5 V 的 LED 是低態致動（陰極經過電阻接到輸出，訊號 0 時亮）。 */
export function activeLowLeds(sim: SimCircuit): Set<string> {
  const vcc = new Set(sim.sources.filter((s) => s.level === 1).map((s) => s.node));
  return new Set(sim.leds.filter((l) => l.anode !== null && vcc.has(l.anode)).map((l) => l.componentId));
}

/**
 * 逐列撥好開關、模擬、讀 LED 與顯示器，和期望值比較（`verifyRows` 與題目的比對共用）。
 * 子專案 37：LED 讀成訊號的值：陽極接 +5 V 的 LED 亮 = 0，其他 LED 亮 = 1。
 */
export function verifyExpected(circuit: Circuit, bindings: Bindings, outputs: VerifyOutput[], rows: ExpectedRow[]): VerifyResult {
  const mismatches: VerifyResult['mismatches'] = [];
  for (const row of rows) {
    const sim = compileSimulation(withSwitches(circuit, bindings.inputs, row.in));
    const result = settle(sim, initialSimState(sim), { pressed: pressedFor(bindings.inputs, row.in), clocks: {} }).result;
    const actual = readOutputs(sim, result, bindings, outputs);
    if (row.out.some((e, k) => e !== 'X' && e !== actual[k])) mismatches.push({ inputs: row.in.join(''), expected: row.out, actual });
  }
  return { rows: rows.length, mismatches };
}

/** 要讀的輸出：輸出端讀 LED，顯示器讀亮的段。 */
export type VerifyOutput = { id: string; display: boolean; segments?: boolean };

/** 讀 LED 與顯示器，寫成和真值表 / 時序表一樣的格子。 */
function readOutputs(sim: SimCircuit, result: SimResult, bindings: Bindings, outputs: VerifyOutput[]): string[] {
  const lit = new Set(result.litLeds);
  const low = activeLowLeds(sim);
  return outputs.map((o) => {
    if (!o.display) {
      const led = bindings.leds[o.id] ?? '';
      return lit.has(led) !== low.has(led) ? '1' : '0';
    }
    const id = bindings.displays[o.id] ?? '';
    const shown = result.litSegments[id] ?? [];
    // 子專案 32：每段直接控制的顯示器寫亮的段；BCD 顯示器的小數點寫成「5.」。
    if (o.segments) return segmentToken(shown);
    const segments = shown.filter((s) => s !== 'dp');
    const dot = shown.includes('dp') ? '.' : '';
    if (segments.length === 0) return whyDark(sim, result, id)?.kind === 'fifteen' ? `15${dot}` : '暗';
    const v = valueOfSegments(segments);
    return v === null ? '?' : `${v}${dot}`;
  });
}

/** 子專案 46：比對時每種輸入組合送幾個脈衝。 */
export const VERIFY_PULSES = 16;

/** 子專案 46：時序電路比對的輸入組合：4 個以內每一種都試，超過時試 16 種固定的組合（全 0、全 1 與其他）。 */
export function sequenceCombos(count: number): Array<Array<0 | 1>> {
  const toBits = (r: number) => Array.from({ length: count }, (_, i) => ((r >> (count - 1 - i)) & 1) as 0 | 1);
  if (count <= 4) return Array.from({ length: 1 << count }, (_, r) => toBits(r));
  const picks = new Set<number>([0, (1 << count) - 1]);
  for (let k = 1; picks.size < 16; k++) picks.add((k * 2654435761) % (1 << count));
  return [...picks].map(toBits);
}

/**
 * 子專案 46（規格 2026-10-24 sequential-logic 第 5 節）：時序電路的比對。每種輸入組合都從重設開始（麵包板的模擬也從全部 0 開始），
 * 送 VERIFY_PULSES 個脈衝，每一步（第 0 次到最後一次）比較每個輸出端、顯示器。不一致的那一列寫成「輸入 第 k 次」。
 */
export function verifySequence(d: LogicDiagram, circuit: Circuit, bindings: Bindings, pulses = VERIFY_PULSES): VerifyResult {
  const { inputs, outputs: sinks } = sortedIo(d);
  const outputs = sinks.map((o) => ({ id: o.id, display: o.kind === 'DISPLAY', segments: !!o.segments }));
  const clock = bindings.clock ?? '';
  const combos = sequenceCombos(inputs.length);
  const mismatches: VerifyResult['mismatches'] = [];
  for (const bits of combos) {
    const table = sequenceTable(d, pulses, Object.fromEntries(inputs.map((n, i) => [n.id, bits[i]])));
    if (!table.ok) return { rows: 0, pulses, mismatches: [] };
    const sim = compileSimulation(withSwitches(circuit, bindings.inputs, bits));
    const pressed = pressedFor(bindings.inputs, bits);
    let state = initialSimState(sim);
    const step = (level: 0 | 1) => {
      const r = settle(sim, state, { pressed, clocks: { [clock]: level } });
      state = r.state;
      return r.result;
    };
    let result = step(0);
    for (const row of table.rows) {
      if (row.pulse > 0) {
        step(1);
        result = step(0);
      }
      const expected = row.out.map((b) => (b === 'X' ? '?' : String(b)));
      const actual = readOutputs(sim, result, bindings, outputs);
      if (expected.some((e, k) => e !== actual[k])) {
        mismatches.push({ inputs: `${bits.join('') || '（沒有其他輸入）'} 第 ${row.pulse} 次脈衝`, expected, actual });
        break;
      }
    }
  }
  return { rows: combos.length, pulses, mismatches };
}

/**
 * 轉換結果用的比對：第 k 個輸入用開關的第 k 位；開關接 +5 V 時輸入 1 = 撥 ON，接 GND 時輸入 1 = 撥 OFF。
 * 沒有用到的開關一律撥 OFF（和轉換時一樣）。
 */
export function verifyBreadboard(d: LogicDiagram, circuit: Circuit, switchTo: 'vcc' | 'gnd', map: VerifyMap): VerifyResult {
  const sw = circuit.components.find((c) => c.id === map.switchId);
  const width = sw && Array.isArray(sw.props.switchStates) ? sw.props.switchStates.length : 0;
  const off = sw ? { ...circuit, components: circuit.components.map((c) => (c === sw ? { ...c, props: { ...c.props, switchStates: Array(width).fill(false) } } : c)) } : circuit;
  const onIs = switchTo === 'vcc' ? 1 : 0;
  return verifyRows(d, off, {
    inputs: map.buttons ? map.inputs.map((node, k) => ({ node, switchId: map.buttons![k], index: 0, onIs, button: true as const })) : map.inputs.map((node, index) => ({ node, switchId: map.switchId ?? '', index, onIs })),
    leds: map.leds,
    displays: map.displays ?? {},
  });
}

/** 結果的白話說明（最多列 5 列）。 */
export function verifyText(r: VerifyResult, outputs: string[]): string {
  // 子專案 46：時序電路。
  if (r.pulses !== undefined && r.mismatches.length === 0) return `${r.rows} 種輸入組合各送 ${r.pulses} 個脈衝，麵包板的模擬結果和時序表全部一致`;
  if (r.mismatches.length === 0) return `${r.rows} 種輸入組合，麵包板的模擬結果和真值表全部一致`;
  const pair = (bits: string[]) => outputs.map((name, i) => `${name} = ${bits[i] ?? '?'}`).join('、');
  const list = r.mismatches
    .slice(0, 5)
    .map((m) => `輸入 ${m.inputs} 應該是 ${pair(m.expected)}，麵包板是 ${pair(m.actual)}`)
    .join('；');
  return `有 ${r.mismatches.length} 列不一致：${list}${r.mismatches.length > 5 ? '…' : ''}`;
}
