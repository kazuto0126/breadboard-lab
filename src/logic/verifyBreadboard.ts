import { getComponentDefinition } from '../core/circuit/library';
import { whyDark } from '../core/simulation/darkDisplay';
import { compileSimulation, initialSimState, settle } from '../core/simulation/simulate';
import type { Circuit } from '../types/circuit';
import { sortedIo, truthTable } from './evaluate';
import { valueOfSegments } from './sevenSeg';
import type { LogicDiagram } from './types';

export interface VerifyResult {
  rows: number;
  /** expected / actual：每個輸出欄一格（輸出端 0 / 1 / ?，顯示器是十進位數字或 ?；麵包板上的顯示器不是因為輸入 15 而全暗時是「暗」）。 */
  mismatches: Array<{ inputs: string; expected: string[]; actual: string[] }>;
}

export interface VerifyMap {
  switchId: string;
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
}

export interface Bindings {
  /** 依名稱排序（和真值表的輸入欄同一順序）。 */
  inputs: SwitchBinding[];
  /** 輸出端 id → LED 元件 id。 */
  leds: Record<string, string>;
  /** 顯示器 id → 7 段顯示器元件 id。 */
  displays: Record<string, string>;
}

/** 把每個對應到的開關撥成這一列的值（值 === onIs 就撥 ON）；沒對應到的開關維持原狀。 */
export function withSwitches(circuit: Circuit, inputs: SwitchBinding[], bits: ReadonlyArray<0 | 1>): Circuit {
  const changes = new Map<string, Map<number, boolean>>();
  inputs.forEach((b, k) => {
    if (bits[k] === undefined) return;
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
  const outputs = sortedIo(d).outputs.map((o) => ({ id: o.id, display: o.kind === 'DISPLAY' }));
  return verifyExpected(circuit, bindings, outputs, table.rows.map((row) => ({ in: row.in, out: row.out.map((b) => (b === 'X' ? '?' : String(b))) })));
}

/** 一列的輸入與期望值：輸出端 0 / 1 / ?，顯示器是數字或 ?；X 是不在乎（子專案 24 的題目），不比。 */
export interface ExpectedRow {
  in: Array<0 | 1>;
  out: string[];
}

/** 逐列撥好開關、模擬、讀 LED 與顯示器，和期望值比較（`verifyRows` 與題目的比對共用）。 */
export function verifyExpected(circuit: Circuit, bindings: Bindings, outputs: Array<{ id: string; display: boolean }>, rows: ExpectedRow[]): VerifyResult {
  const mismatches: VerifyResult['mismatches'] = [];
  for (const row of rows) {
    const sim = compileSimulation(withSwitches(circuit, bindings.inputs, row.in));
    const result = settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result;
    const lit = new Set(result.litLeds);
    const actual = outputs.map((o) => {
      if (!o.display) return lit.has(bindings.leds[o.id] ?? '') ? '1' : '0';
      const id = bindings.displays[o.id] ?? '';
      const segments = result.litSegments[id] ?? [];
      if (segments.length === 0) return whyDark(sim, result, id)?.kind === 'fifteen' ? '15' : '暗';
      const v = valueOfSegments(segments);
      return v === null ? '?' : String(v);
    });
    if (row.out.some((e, k) => e !== 'X' && e !== actual[k])) mismatches.push({ inputs: row.in.join(''), expected: row.out, actual });
  }
  return { rows: rows.length, mismatches };
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
    inputs: map.inputs.map((node, index) => ({ node, switchId: map.switchId, index, onIs })),
    leds: map.leds,
    displays: map.displays ?? {},
  });
}

/** 結果的白話說明（最多列 5 列）。 */
export function verifyText(r: VerifyResult, outputs: string[]): string {
  if (r.mismatches.length === 0) return `${r.rows} 種輸入組合，麵包板的模擬結果和真值表全部一致`;
  const pair = (bits: string[]) => outputs.map((name, i) => `${name} = ${bits[i] ?? '?'}`).join('、');
  const list = r.mismatches
    .slice(0, 5)
    .map((m) => `輸入 ${m.inputs} 應該是 ${pair(m.expected)}，麵包板是 ${pair(m.actual)}`)
    .join('；');
  return `有 ${r.mismatches.length} 列不一致：${list}${r.mismatches.length > 5 ? '…' : ''}`;
}
