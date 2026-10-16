import { addNode, connect } from '../../src/logic/edit';
import { emptyDiagram, type GateKind, type LogicDiagram } from '../../src/logic/types';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from './build';

/**
 * 手接的 2 輸入閘電路（MB-102，子專案 22 的測試用）：
 * - U1（74LS08 或 74LS86）在 F10：1A = F10、1B = F11、1Y = F12，VCC（E10）接 T+、GND（F16）接 B-。
 * - SW1 第 1 個開關（F30 / E30）是 A；SW2 第 3 個開關（F42 / E42）是 B。開關另一邊接 +5 V（T+），
 *   `toGnd` 時改接 GND（T-），也就是撥 ON = 0。
 * - D1（G20 陽極、G21 陰極）：陽極接 1Y；陰極經過 SW1 第 2 個開關（F31 / E31）接到 GND（T-），
 *   這個開關當「致能」用：撥 OFF 時 LED 永遠不亮。
 */
export function handWired(opts: {
  chip?: '74LS08' | '74LS86';
  toGnd?: boolean;
  /** SW1 四個開關目前的狀態（預設第 2 個 = 致能撥 ON）。 */
  sw1?: boolean[];
  labels?: { sw1?: string[]; sw2?: string[]; led?: string[] };
}): Circuit {
  const rail = opts.toGnd ? 'T-' : 'T+';
  const sw1 = opts.sw1 ?? [false, true, false, false];
  return circuit(
    [
      comp('V1', 'vcc', 'T+3'),
      comp('G1', 'gnd', 'B-3'),
      comp('G2', 'gnd', 'T-5'),
      comp('U1', opts.chip ?? '74LS08', 'F10'),
      comp('SW1', 'dipsw-4', 'F30', { props: { switchStates: sw1, ...(opts.labels?.sw1 ? { labels: opts.labels.sw1 } : {}) } }),
      comp('SW2', 'dipsw-4', 'F40', { props: { switchStates: [false, false, false, false], ...(opts.labels?.sw2 ? { labels: opts.labels.sw2 } : {}) } }),
      comp('D1', 'led', 'G20', { props: { color: 'red', ...(opts.labels?.led ? { labels: opts.labels.led } : {}) } }),
    ],
    [
      wire('pv', 'T+10', 'A10'),
      wire('pg', 'B-16', 'J16'),
      // A：SW1 第 1 個開關
      wire('a-rail', `${rail}30`, 'A30'),
      wire('a-in', 'H30', 'H10'),
      // B：SW2 第 3 個開關
      wire('b-rail', `${rail}42`, 'A42'),
      wire('b-in', 'I42', 'I11'),
      // 1Y → LED 陽極；LED 陰極 → SW1 第 2 個開關 → GND
      wire('y', 'J12', 'J20'),
      wire('k', 'J21', 'J31'),
      wire('en', 'T-31', 'A31'),
    ],
  );
}

/** 邏輯圖：輸入 A、B → 一個閘 → 輸出 X。 */
export function gateDiagram(kind: GateKind): LogicDiagram {
  const must = (r: { ok: boolean; diagram: LogicDiagram }) => {
    if (!r.ok) throw new Error('bad edit');
    return r.diagram;
  };
  let d = emptyDiagram();
  d = must(addNode(d, 'INPUT', 0, 0)); // i1 A
  d = must(addNode(d, 'INPUT', 0, 2)); // i2 B
  d = must(addNode(d, kind, 6, 0)); // g1
  d = must(addNode(d, 'OUTPUT', 14, 1)); // o1 X
  d = must(connect(d, 'i1', { node: 'g1', pin: 0 }));
  d = must(connect(d, 'i2', { node: 'g1', pin: 1 }));
  return must(connect(d, 'g1', { node: 'o1', pin: 0 }));
}
