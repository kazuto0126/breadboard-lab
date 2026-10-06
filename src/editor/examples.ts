import { applyRouting } from '../core/routing/apply';
import { autoRoute } from '../core/routing/autoRoute';
import { SIGNAL_PALETTE } from '../core/routing/colors';
import type { Circuit } from '../types/circuit';
import { circuit, comp, wire } from './builder';
import { defaultWireColor } from './manualWire';

/** 需求文件第三十四章的驗收電路：74LS00 第 1 閘輸入接地 → 1Y → 電阻 → LED → GND。 */
export function acceptanceCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'T+5'),
      comp('G1', 'gnd', 'B-5'),
      comp('U1', '74LS00', 'F10'),
      comp('R1', 'resistor', 'G30'),
      comp('D1', 'led', 'G40'),
    ],
    [
      wire('w1', 'T+6', 'A10'), // VCC → U1 第 14 腳
      wire('w2', 'B-6', 'J16'), // GND → U1 第 7 腳
      wire('w3', 'J10', 'I16'), // U1 第 1 腳 → GND
      wire('w4', 'J11', 'H16'), // U1 第 2 腳 → GND
      wire('w5', 'J12', 'J30'), // U1 第 3 腳（1Y）→ R1
      wire('w6', 'J34', 'J40'), // R1 → LED 陽極
      wire('w7', 'J41', 'B-41'), // LED 陰極 → GND
    ],
  );
}

/** 74LS93 4 位元計數器：Push Button 當時脈，QA–QD 各接 電阻 → LED → GND。GND 上下兩條軌由使用者接通。 */
export function counterCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'B+3'),
      comp('G1', 'gnd', 'T-3'),
      comp('U1', '74LS93', 'F10'),
      comp('SW1', 'pushbutton', 'F4'),
      comp('R1', 'resistor', 'A25'),
      comp('R2', 'resistor', 'A31'),
      comp('R3', 'resistor', 'A37'),
      comp('R4', 'resistor', 'A43'),
      comp('D1', 'led', 'E29', { rotation: 90, span: 3 }),
      comp('D2', 'led', 'E35', { rotation: 90, span: 3 }),
      comp('D3', 'led', 'E41', { rotation: 90, span: 3 }),
      comp('D4', 'led', 'E47', { rotation: 90, span: 3 }),
    ],
    [
      wire('g0', 'T-61', 'B-61'), // 上下 GND 軌接通
      wire('v1', 'B+15', 'J14'), // VCC → U1 第 5 腳
      wire('g1', 'T-15', 'A14'), // GND → U1 第 10 腳
      wire('g2', 'B-11', 'J11'), // GND → R0(1)
      wire('g3', 'B-13', 'J12'), // GND → R0(2)
      wire('g4', 'T-4', 'A4'), // GND → 按鈕一側
      wire('g5', 'B-29', 'J29'), // LED 陰極 → GND
      wire('g6', 'B-35', 'J35'),
      wire('g7', 'B-41', 'J41'),
      wire('g8', 'B-47', 'J47'),
      wire('c1', 'A6', 'A10'), // 按鈕另一側 → CKA
      wire('q1', 'B12', 'B25'), // QA → R1
      wire('q2', 'D12', 'G10'), // QA → CKB（串成 4 位元）
      wire('q3', 'C15', 'C31'), // QB → R2
      wire('q4', 'D16', 'D37'), // QC → R3
      wire('q5', 'B13', 'B43'), // QD → R4
    ],
  );
}

/** 8 位元指撥開關 → 74LS283 4 位元加法器 → 5 顆 LED（S1–S4、C4）。開關另一側接 GND。 */
export function adderCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'T+3'),
      comp('G1', 'gnd', 'B-3'),
      comp('SW1', 'dipsw-8', 'F5'),
      comp('U1', '74LS283', 'F25'),
      comp('R1', 'resistor', 'A36'),
      comp('D1', 'led', 'C40'),
      comp('R2', 'resistor', 'A43'),
      comp('D2', 'led', 'C47'),
      comp('R3', 'resistor', 'A50'),
      comp('D3', 'led', 'C54'),
      comp('R4', 'resistor', 'A57'),
      comp('D4', 'led', 'C61'),
      comp('R5', 'resistor', 'J36'),
      comp('D5', 'led', 'H40'),
    ],
    [
      wire('g0', 'T-61', 'B-61'), // 上下 GND 軌接通
      wire('v1', 'T+25', 'A25'), // VCC → U1 第 16 腳
      wire('g1', 'B-5', 'J5'), // 開關下側 → GND
      wire('g2', 'B-6', 'J6'),
      wire('g3', 'B-7', 'J7'),
      wire('g4', 'I8', 'I7'),
      wire('g5', 'B-9', 'J9'),
      wire('g6', 'B-10', 'J10'),
      wire('g7', 'B-11', 'J11'),
      wire('g8', 'B-12', 'J12'),
      wire('g9', 'J31', 'B-31'), // C0 → GND
      wire('g10', 'J32', 'B-33'), // U1 GND
      wire('g11', 'A41', 'T-41'), // LED 陰極 → GND
      wire('g12', 'A48', 'T-48'),
      wire('g13', 'A55', 'T-55'),
      wire('g14', 'B62', [62, 3], [60, 3], 'T-60'),
      wire('g15', 'J41', 'B-41'),
      wire('a1', 'A5', 'J29'), // 開關上側 → A1
      wire('a2', 'A6', 'J27'), // → A2
      wire('a3', 'A7', 'A27'), // → A3
      wire('a4', 'A8', 'A29'), // → A4
      wire('b1', 'A9', 'J30'), // → B1
      wire('b2', 'A10', 'J26'), // → B2
      wire('b3', 'A11', 'A26'), // → B3
      wire('b4', 'A12', 'A30'), // → B4
      wire('s1', 'J28', 'B36'), // S1 → R1
      wire('s2', 'J25', 'B43'), // S2 → R2
      wire('s3', 'A28', 'B50'), // S3 → R3
      wire('s4', 'A31', 'B57'), // S4 → R4
      wire('c4', 'A32', 'I36'), // C4 → R5
    ],
  );
}

/**
 * 74LS161 同步計數器 + 1 Hz 時脈：QA–QD 各經電阻點亮一顆 LED，控制腳（/CLR、/LOAD、ENP、ENT）接 VCC、
 * 資料腳接 GND，Check Circuit 沒有任何錯誤或警告。這裡的導線只用來描述連接關係，
 * 範例載入時會先套用 AI 標準佈線（見 EXAMPLES）。
 */
export function clockCounterCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'T+3'),
      comp('G1', 'gnd', 'T-3'),
      comp('V2', 'vcc', 'B+3'),
      comp('G2', 'gnd', 'B-3'),
      comp('CLK1', 'clock', 'J10'),
      comp('U1', '74LS161', 'F20'),
      comp('R1', 'resistor', 'A35'),
      comp('D1', 'led', 'C39', { props: { color: 'green' } }),
      comp('R2', 'resistor', 'A43'),
      comp('D2', 'led', 'C47', { props: { color: 'green' } }),
      comp('R3', 'resistor', 'J35'),
      comp('D3', 'led', 'H39', { props: { color: 'green' } }),
      comp('R4', 'resistor', 'J43'),
      comp('D4', 'led', 'H47', { props: { color: 'green' } }),
    ],
    [
      wire('vcc', 'T+19', 'A20'), // VCC → 第 16 腳
      wire('gnd', 'B-27', 'J27'), // GND → 第 8 腳
      wire('clk', 'I10', 'I21'), // 時脈 → CLK
      wire('clr', 'J20', 'B+19'), // /CLR 接 HIGH
      wire('enp', 'J26', 'B+25'), // ENP 接 HIGH
      wire('ent', 'A26', 'T+25'), // ENT 接 HIGH
      wire('load', 'A27', 'T+27'), // /LOAD 接 HIGH
      wire('da', 'J22', 'B-22'), // 資料腳 A–D 接 GND
      wire('db', 'J23', 'B-23'),
      wire('dc', 'J24', 'B-24'),
      wire('dd', 'J25', 'B-25'),
      wire('qa', 'B22', 'B35'), // QA → R1
      wire('qb', 'C23', 'C43'), // QB → R2
      wire('qc', 'D24', 'G35'), // QC → R3
      wire('qd', 'A25', 'I43'), // QD → R4
      wire('k1', 'A40', 'T-40'), // LED 陰極 → GND
      wire('k2', 'A48', 'T-48'),
      wire('k3', 'J40', 'B-40'),
      wire('k4', 'J48', 'B-48'),
    ],
  );
}

export interface ExampleCircuit {
  id: string;
  name: string;
  description: string;
  build: () => Circuit;
}

/** 範例的手動導線著色：接 + 軌紅色、接 − 軌黑色，其他依序輪流使用訊號色。 */
function colorize(c: Circuit): Circuit {
  let signal = 0;
  return {
    ...c,
    wires: c.wires.map((w) => {
      const color = defaultWireColor(c, w.start, w.end, '');
      return { ...w, color: color || SIGNAL_PALETTE[signal++ % SIGNAL_PALETTE.length] };
    }),
  };
}

/** 檔案選單中的範例電路；tests/routing/fixtures.test.ts 保證每一個都佈得出來。 */
export const EXAMPLES: ExampleCircuit[] = [
  {
    id: 'acceptance',
    name: '74LS00 + LED（驗收電路）',
    description: 'NAND 閘輸入接地 → 輸出經電阻點亮 LED。手動接線故意有重疊，按「AI 標準佈線」看整理後的結果。',
    build: () => colorize(acceptanceCircuit()),
  },
  {
    id: 'counter',
    name: '74LS93 計數器',
    description: 'Push Button 當時脈，4 顆 LED 顯示二進位計數。',
    build: () => colorize(counterCircuit()),
  },
  {
    id: 'clock-counter',
    name: '74LS161 + 時脈（模擬示範）',
    description: '1 Hz 時脈驅動 74LS161，4 顆 LED 自動數 0–15。按「▶ 模擬」看它跑起來；導線已套用 AI 標準佈線。',
    build: () => {
      const c = clockCounterCircuit();
      const routed = autoRoute(c);
      return routed.status === 'success' ? applyRouting(c, routed) : colorize(c);
    },
  },
  {
    id: 'adder',
    name: '74LS283 4 位元加法器',
    description: '8 位元指撥開關輸入 A、B，5 顆 LED 顯示和與進位。手動接線故意很亂（穿過 IC、互相重疊），按「AI 標準佈線」看整理後的結果。',
    build: () => colorize(adderCircuit()),
  },
];
