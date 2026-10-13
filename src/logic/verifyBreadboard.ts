import { compileSimulation, initialSimState, settle } from '../core/simulation/simulate';
import type { Circuit } from '../types/circuit';
import { sortedIo, truthTable } from './evaluate';
import { valueOfSegments } from './sevenSeg';
import type { LogicDiagram } from './types';

export interface VerifyResult {
  rows: number;
  /** expected / actual：每個輸出欄一格（輸出端 0 / 1 / ?，顯示器是十進位數字或 ?）。 */
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

/**
 * 規格（2026-10-13 logic-to-breadboard）第 7 節：真值表的每一列都在麵包板上模擬一次，讀 LED 亮不亮，和邏輯圖比較。
 * 顯示器（規格 2026-10-13 seven-seg 第 7 節）讀亮的段、對回數字。
 * 開關接 +5 V 時輸入 1 = 撥 ON；接 GND 時輸入 1 = 撥 OFF。
 */
export function verifyBreadboard(d: LogicDiagram, circuit: Circuit, switchTo: 'vcc' | 'gnd', map: VerifyMap): VerifyResult {
  const table = truthTable(d);
  if (!table.ok) return { rows: 0, mismatches: [] };
  const { outputs } = sortedIo(d);
  const sw = circuit.components.find((c) => c.id === map.switchId);
  const width = sw && Array.isArray(sw.props.switchStates) ? sw.props.switchStates.length : 0;
  const mismatches: VerifyResult['mismatches'] = [];
  for (const row of table.rows) {
    const states = Array.from({ length: width }, (_, k) => (k < row.in.length ? (switchTo === 'vcc' ? row.in[k] === 1 : row.in[k] === 0) : false));
    const c: Circuit = { ...circuit, components: circuit.components.map((x) => (x.id === map.switchId ? { ...x, props: { ...x.props, switchStates: states } } : x)) };
    const sim = compileSimulation(c);
    const result = settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result;
    const lit = new Set(result.litLeds);
    const expected = row.out.map((b) => (b === 'X' ? '?' : String(b)));
    const actual = outputs.map((o) => {
      if (o.kind !== 'DISPLAY') return lit.has(map.leds[o.id] ?? '') ? '1' : '0';
      const v = valueOfSegments(result.litSegments[map.displays?.[o.id] ?? ''] ?? []);
      return v === null ? '?' : String(v);
    });
    if (expected.join(',') !== actual.join(',')) mismatches.push({ inputs: row.in.join(''), expected, actual });
  }
  return { rows: table.rows.length, mismatches };
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
