import { applyRouting } from '../core/routing/apply';
import { autoRoute } from '../core/routing/autoRoute';
import { SIGNAL_PALETTE } from '../core/routing/colors';
import type { Circuit } from '../types/circuit';
import { normalizeBoardGroups } from './boards';
import { board, circuit, comp, holeOn, latticeWire, pt, wire } from './builder';
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

/**
 * 74LS283 4 位元加法器，上下貼合的兩塊板：上板 SW1（A1–A4）、SW2（B1–B4）兩個 4 位元指撥開關，
 * 下板 74LS283 與 5 顆 LED（S1–S4、C4）。第 k 個開關的腳 k（下側）接 IC 輸入、另一腳（上側）接上板的 GND 軌：ON = 0、OFF = 1（輸入懸空）。
 * 子專案 7 的佈線標準（直線、一孔一線）下，8 個開關擠在同一塊板的一側沒有足夠的列可以把線拉出來，所以開關放在另一塊板，
 * 每條輸入線各自往下跨過接縫。
 */
export function adderCircuit(): Circuit {
  const boards = [board('b1'), board('b2', 0, 20)];
  const on = (boardId: string, name: string) => holeOn(boardId, name);
  const link = (id: string, from: [string, string], to: [string, string]) => latticeWire(boards, id, on(...from), on(...to));
  return normalizeBoardGroups(
    circuit(
      [
        comp('G1', 'gnd', 'T-3'),
        comp('SW1', 'dipsw-4', 'F10'),
        comp('SW2', 'dipsw-4', 'F40'),
        comp('V1', 'vcc', 'T+3', { board: 'b2' }),
        comp('G2', 'gnd', 'B-3', { board: 'b2' }),
        comp('U1', '74LS283', 'F25', { board: 'b2' }),
        comp('R1', 'resistor', 'A36', { board: 'b2' }),
        comp('D1', 'led', 'C40', { board: 'b2' }),
        comp('R2', 'resistor', 'A43', { board: 'b2' }),
        comp('D2', 'led', 'C47', { board: 'b2' }),
        comp('R3', 'resistor', 'A50', { board: 'b2' }),
        comp('D3', 'led', 'C54', { board: 'b2' }),
        comp('R4', 'resistor', 'A57', { board: 'b2' }),
        comp('D4', 'led', 'C61', { board: 'b2' }),
        comp('R5', 'resistor', 'J36', { board: 'b2' }),
        comp('D5', 'led', 'H40', { board: 'b2' }),
      ],
      [
        // 開關上側 → 上板的 GND 軌
        ...[10, 11, 12, 13, 40, 41, 42, 43].map((x, i) => link(`g${i + 1}`, ['b1', `A${x}`], ['b1', `T-${x}`])),
        // 開關下側 → IC 輸入（故意拉得很亂：斜斜地跨過板子）
        link('a1', ['b1', 'J10'], ['b2', 'J29']), // → A1
        link('a2', ['b1', 'J11'], ['b2', 'J27']), // → A2
        link('a3', ['b1', 'J12'], ['b2', 'A27']), // → A3
        link('a4', ['b1', 'J13'], ['b2', 'A29']), // → A4
        link('b1', ['b1', 'J40'], ['b2', 'J30']), // → B1
        link('b2', ['b1', 'J41'], ['b2', 'J26']), // → B2
        link('b3', ['b1', 'J42'], ['b2', 'A26']), // → B3
        link('b4', ['b1', 'J43'], ['b2', 'A30']), // → B4
        link('v1', ['b2', 'T+25'], ['b2', 'A25']), // VCC → U1 第 16 腳
        link('g9', ['b2', 'J32'], ['b2', 'B-31']), // U1 GND
        link('g10', ['b2', 'J31'], ['b2', 'B-30']), // C0 → GND
        link('g11', ['b2', 'T-61'], ['b2', 'B-61']), // 下板上下 GND 軌接通
        link('g12', ['b2', 'A41'], ['b2', 'T-41']), // LED 陰極 → GND
        link('g13', ['b2', 'A48'], ['b2', 'T-48']),
        link('g14', ['b2', 'A55'], ['b2', 'T-55']),
        link('g15', ['b2', 'B62'], ['b2', 'T-60']),
        link('g16', ['b2', 'J41'], ['b2', 'B-41']),
        link('s1', ['b2', 'J28'], ['b2', 'B36']), // S1 → R1
        link('s2', ['b2', 'J25'], ['b2', 'B43']), // S2 → R2
        link('s3', ['b2', 'A28'], ['b2', 'B50']), // S3 → R3
        link('s4', ['b2', 'A31'], ['b2', 'B57']), // S4 → R4
        link('c4', ['b2', 'A32'], ['b2', 'I36']), // C4 → R5
      ],
      boards,
    ),
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

/**
 * 兩塊麵包板上下貼合成一個 Board Group：74LS00 在上板（b1），電阻與 LED 在下板（b2）。
 * 1Y 的訊號線與 GND 軌的短接線都跨過兩板之間的接縫；貼在一起不代表導通，所以 b2 的 GND 軌要靠 w8 接到 b1。
 */
export function twoBoardCircuit(): Circuit {
  const boards = [board('b1'), board('b2', 0, 20)];
  return normalizeBoardGroups(
    circuit(
      [
        comp('V1', 'vcc', 'T+5'),
        comp('G1', 'gnd', 'B-5'),
        comp('U1', '74LS00', 'F10'),
        comp('R1', 'resistor', 'C30', { board: 'b2' }),
        comp('D1', 'led', 'C40', { board: 'b2' }),
      ],
      [
        wire('w1', 'T+6', 'A10'), // VCC → U1 第 14 腳
        wire('w2', 'B-6', 'J16'), // GND → U1 第 7 腳
        wire('w3', 'I10', 'I16'), // 第 1 腳 → GND
        wire('w4', 'H11', 'H16'), // 第 2 腳 → GND
        latticeWire(boards, 'w5', holeOn('b1', 'J12'), pt(12, 16), pt(30, 16), holeOn('b2', 'A30')), // 1Y → b2 的 R1
        latticeWire(boards, 'w6', holeOn('b2', 'A34'), holeOn('b2', 'A40')), // R1 → LED 陽極
        latticeWire(boards, 'w7', holeOn('b2', 'A41'), holeOn('b2', 'T-41')), // LED 陰極 → b2 的 GND 軌
        latticeWire(boards, 'w8', holeOn('b1', 'B-60'), holeOn('b2', 'T-60')), // b1 與 b2 的 GND 軌接通
      ],
      boards,
    ),
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
    id: 'two-boards',
    name: '兩塊麵包板（Board Group 示範）',
    description:
      '上下貼合的兩塊 MB-102 自動組成群組：74LS00 在上板、電阻與 LED 在下板，跨板導線經過兩板之間的接縫。導線已套用 AI 標準佈線，按「▶ 模擬」LED 會亮。',
    build: () => {
      const c = twoBoardCircuit();
      const routed = autoRoute(c);
      return routed.status === 'success' ? applyRouting(c, routed) : colorize(c);
    },
  },
  {
    id: 'adder',
    name: '74LS283 4 位元加法器',
    description:
      '上下貼合的兩塊板：上板兩個 4 位元指撥開關輸入 A、B（ON = 0），下板 74LS283 與 5 顆 LED 顯示和與進位。手動接線故意很亂，按「AI 標準佈線」看整理後的結果。',
    build: () => colorize(adderCircuit()),
  },
];
