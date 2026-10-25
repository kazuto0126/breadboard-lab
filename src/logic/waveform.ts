import type { OutValue, SequenceTable } from './evaluate';

/** 子專案 50（規格 2026-10-25 waveform）：波形的一條線。 */
export interface WaveLane {
  name: string;
  /** clock：每格前有沒有脈衝（1 = 有）；bit：輸出端的 0 / 1 / X；value：顯示器的值。 */
  kind: 'clock' | 'bit' | 'value';
  values: OutValue[];
}

type OkTable = Extract<SequenceTable, { ok: true }>;

/** 時序表的每一欄變成一條線：最上面是時脈，再依表格的順序放輸出端與顯示器。 */
export function waveLanes(t: OkTable): WaveLane[] {
  return [
    { name: t.clock, kind: 'clock', values: t.rows.map((r) => (r.pulse === 0 ? 0 : 1)) },
    ...t.outputs.map((name, i): WaveLane => ({ name, kind: t.display[i] ? 'value' : 'bit', values: t.rows.map((r) => r.out[i]) })),
  ];
}

/** 給 AI 看的文字波形：每格一個字元，1 是 ‾、0 是 _、不確定是 ?；時脈每格前有脈衝寫 |。顯示器不畫（值在時序表裡）。 */
export function waveText(t: OkTable): string {
  const lanes = waveLanes(t).filter((l) => l.kind !== 'value');
  const width = Math.max(...lanes.map((l) => l.name.length));
  const cell = (l: WaveLane, v: OutValue) => (l.kind === 'clock' ? (v === 1 ? '|' : '.') : v === 1 ? '‾' : v === 0 ? '_' : '?');
  return lanes.map((l) => `${l.name.padEnd(width)} ${l.values.map((v) => cell(l, v)).join('')}`).join('\n');
}
