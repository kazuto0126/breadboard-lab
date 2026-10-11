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

/** 把只用一塊板的電路整個搬到 boardId 這塊板上（元件與導線的格點都換板子 ID）。 */
function onBoard(c: Circuit, boardId: string): Circuit {
  return {
    ...c,
    components: c.components.map((k) => ({ ...k, boardId })),
    wires: c.wires.map((w) => ({ ...w, start: { ...w.start, boardId }, end: { ...w.end, boardId }, path: w.path.map((p) => ({ ...p, boardId })) })),
  };
}

/**
 * 74LS47 + 共陽極 7 段顯示器，上下貼合的兩塊板。下板（b2）：SW1 的 4 個開關是 BCD 的 A–D（ON = 0、OFF = 1，輸入浮接讀成 HIGH）與 74LS47；
 * 上板（b1）：7 顆 330 Ω 電阻直立跨過凹槽、7 段顯示器（CA 接 VCC）。一開始 4 個開關都 ON，顯示 0。
 * 74LS47 的 7 個輸出排在相鄰的 7 欄，在同一塊板上沒有足夠的列把線拉出來（和加法器的開關一樣），所以電阻與顯示器放在上板，每條輸出線各自往上跨過接縫。
 */
export function sevenSegmentCircuit(): Circuit {
  const boards = [board('b1'), board('b2', 0, 20)];
  const link = (id: string, from: [string, string | [number, number]], to: [string, string | [number, number]]) => {
    const at = ([b, h]: [string, string | [number, number]]) => (typeof h === 'string' ? holeOn(b, h) : { boardId: b, x: h[0], y: h[1] });
    return latticeWire(boards, id, at(from), at(to));
  };
  // 段、74LS47 輸出所在的孔（下板上半）、顯示器的腳（上板）
  const segs: Array<[string, string, string]> = [
    ['a', 'A18', 'A55'],
    ['b', 'A19', 'A56'],
    ['c', 'A20', 'J55'],
    ['d', 'A21', 'J53'],
    ['e', 'A22', 'J52'],
    ['f', 'A16', 'A53'],
    ['g', 'A17', 'A52'],
  ];
  // 第 k 顆電阻在上板第 25 + 3k 欄，直立跨過凹槽（E 列與 F 列各一隻腳）。
  const col = (k: number) => 25 + 3 * k;
  return normalizeBoardGroups(
    circuit(
      [
        comp('V2', 'vcc', 'T+3'),
        ...segs.map((_, k) => comp(`R${k + 1}`, 'resistor', [col(k), 8], { rotation: 90, span: 3, props: { resistance: 330 } })),
        comp('DS1', '7seg-ca', 'H52'),
        comp('V1', 'vcc', 'T+3', { board: 'b2' }),
        comp('G1', 'gnd', 'B-3', { board: 'b2' }),
        comp('G2', 'gnd', 'T-3', { board: 'b2' }),
        comp('SW1', 'dipsw-4', 'F5', { board: 'b2', props: { switchStates: [true, true, true, true] } }),
        comp('U1', '74LS47', 'F15', { board: 'b2' }),
      ],
      [
        // 開關上側 → GND（下板 T- 軌）
        link('s1', ['b2', 'T-5'], ['b2', 'A5']),
        link('s2', ['b2', 'T-6'], ['b2', 'A6']),
        link('s3', ['b2', 'T-7'], ['b2', 'A7']),
        link('s4', ['b2', 'T-9'], ['b2', 'A8']),
        // 開關下側 → 74LS47 的 A（F21）、B（F15）、C（F16）、D（F20）
        link('ia', ['b2', 'J5'], ['b2', 'J21']),
        link('ib', ['b2', 'J6'], ['b2', 'I15']),
        link('ic', ['b2', 'J7'], ['b2', 'I16']),
        link('id', ['b2', 'J8'], ['b2', 'J20']),
        link('vcc', ['b2', 'T+15'], ['b2', 'B15']), // 第 16 腳 VCC（E15）
        link('gnd', ['b2', 'J22'], ['b2', 'B-22']), // 第 8 腳 GND
        link('gg', ['b2', 'T-61'], ['b2', 'B-61']), // 下板上下兩條 GND 軌接通
        link('ca', ['b1', 'A54'], ['b1', 'T+54']), // 共陽極 → VCC
        // 74LS47 輸出 → 電阻下端（上板 F 列那一排）；電阻上端（E 列那一排）→ 顯示器的段
        ...segs.flatMap(([name, out, seg], k) => [
          link(`${name}1`, ['b2', out], ['b1', [col(k), 15]]),
          link(`${name}2`, ['b1', [col(k), 4]], ['b1', seg]),
        ]),
      ],
      boards,
    ),
  );
}

/**
 * NE555 當 1 Hz 時脈推動 74LS93，上下貼合的兩塊板。上板（b1）：NE555（U2）在 F10，R5 = 1 kΩ、R6 = 68 kΩ、C1 = 10 µF 照標準無穩態接法，
 * C2 = 0.01 µF 接 CONT；下板（b2）是「74LS93 計數器」範例拿掉按鈕的電路。NE555 的 OUT 往下接到 74LS93 的 CKA。按「▶ 模擬」就會自己數。
 */
export function timerCounterCircuit(): Circuit {
  const boards = [board('b1'), board('b2', 0, 20)];
  const counter = onBoard(counterCircuit(), 'b2');
  const drop = new Set(['g4', 'c1']); // 按鈕的兩條線
  const link = (id: string, from: [string, string], to: [string, string]) => latticeWire(boards, id, holeOn(...from), holeOn(...to));
  return normalizeBoardGroups(
    circuit(
      [
        comp('V2', 'vcc', 'T+3'),
        comp('G3', 'gnd', 'T-3'),
        comp('U2', 'NE555', 'F10'), // 第 1–4 腳 F10–F13（GND TRIG OUT /RESET），第 5–8 腳 E13–E10（CONT THRES DISCH VCC）
        comp('R5', 'resistor', 'A20', { props: { resistance: 1000 } }), // VCC（第 20 欄）↔ DISCH（第 24 欄）
        comp('R6', 'resistor', 'B24', { props: { resistance: 68000 } }), // DISCH（第 24 欄）↔ THRES / TRIG（第 28 欄）
        comp('C1', 'capacitor-electrolytic', 'C28', { props: { capacitance: 1e-5 } }), // + 在第 28 欄、− 在第 30 欄
        comp('C2', 'capacitor-ceramic', 'G20', { props: { capacitance: 1e-8 } }), // CONT（第 20 欄下半）↔ GND（第 22 欄下半）
        ...counter.components.filter((c) => c.id !== 'SW1'),
      ],
      [
        link('t1', ['b1', 'T+10'], ['b1', 'A10']), // NE555 VCC（第 8 腳）
        link('t2', ['b1', 'J10'], ['b1', 'T-9']), // NE555 GND（第 1 腳）
        link('t3', ['b1', 'J13'], ['b1', 'T+13']), // /RESET 接 VCC
        link('t4', ['b1', 'T+21'], ['b1', 'E20']), // R5 上端 → VCC
        link('t5', ['b1', 'D24'], ['b1', 'A11']), // DISCH（第 7 腳 E11）
        link('t6', ['b1', 'D28'], ['b1', 'A12']), // THRES（第 6 腳 E12）
        link('t7', ['b1', 'J11'], ['b1', 'E28']), // TRIG（第 2 腳 F11）接 THRES
        link('t8', ['b1', 'D30'], ['b1', 'T-30']), // C1 負極 → GND
        link('t9', ['b1', 'A13'], ['b1', 'J20']), // CONT（第 5 腳 E13）→ C2
        link('t10', ['b1', 'J22'], ['b1', 'T-22']), // C2 另一腳 → GND
        link('t11', ['b1', 'J12'], ['b2', 'A10']), // OUT（第 3 腳 F12）→ 74LS93 CKA（下板 E10）
        ...counter.wires.filter((w) => !drop.has(w.id)),
      ],
      boards,
    ),
  );
}

/**
 * EIC-1106 大型麵包板：74LS00 驗收電路放在插孔區 2。紅色接線柱接 P3 +、黑色接線柱接 P4 −，不用另外放 VCC / GND 符號。
 * U1 在 2-F10：第 1–7 腳 2-F10–2-F16，第 14–8 腳 2-E10–2-E16。
 */
export function eicCircuit(): Circuit {
  const at = (name: string) => holeOn('b1', name, 'EIC1106');
  return circuit(
    [comp('U1', '74LS00', at('2-F10')), comp('R1', 'resistor', at('2-G30')), comp('D1', 'led', at('2-G40'))],
    [
      wire('vp', at('紅'), at('P3+5')), // 紅柱 → P3 +
      wire('vg', at('黑'), at('P4-5')), // 黑柱 → P4 −
      wire('w1', at('P3+6'), at('2-A10')), // VCC → 第 14 腳
      wire('w2', at('P4-6'), at('2-J16')), // GND → 第 7 腳
      wire('w3', at('2-J10'), at('2-I16')), // 第 1 腳 → GND
      wire('w4', at('2-J11'), at('2-H16')), // 第 2 腳 → GND
      wire('w5', at('2-J12'), at('2-J30')), // 1Y → R1
      wire('w6', at('2-J34'), at('2-J40')), // R1 → LED 陽極
      wire('w7', at('2-J41'), at('P4-41')), // LED 陰極 → GND
    ],
    [board('b1', 0, 0, 'EIC1106')],
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
  {
    id: 'seven-segment',
    name: '74LS47 + 7 段顯示器',
    description: '4 位元指撥開關輸入 BCD（ON = 0），74LS47 經電阻推動共陽極 7 段顯示器。導線已套用 AI 標準佈線，按「▶ 模擬」撥開關看數字。',
    build: () => {
      const c = sevenSegmentCircuit();
      const routed = autoRoute(c);
      return routed.status === 'success' ? applyRouting(c, routed) : colorize(c);
    },
  },
  {
    id: 'timer-counter',
    name: 'NE555 時脈 + 74LS93 計數器',
    description: 'NE555 當 1 Hz 時脈（R1、R2、C1 照標準接法擺好），74LS93 數 0–15、4 顆 LED 顯示。導線已套用 AI 標準佈線，按「▶ 模擬」看它自己數。',
    build: () => {
      const c = timerCounterCircuit();
      const routed = autoRoute(c);
      return routed.status === 'success' ? applyRouting(c, routed) : colorize(c);
    },
  },
];
