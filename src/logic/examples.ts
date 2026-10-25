import { BLOCK_PINS } from './blocks';
import { addNode, connect, nextNodeId, renameNode, setInputCount } from './edit';
import { emptyDiagram, type LogicDiagram, type NodeKind } from './types';

function must(r: { ok: boolean; diagram: LogicDiagram }): LogicDiagram {
  if (!r.ok) throw new Error('example is invalid');
  return r.diagram;
}

/** 課本「圖 2-5」多數決電路：X = AB + AC + BC。 */
export function majorityDiagram(): LogicDiagram {
  let d = emptyDiagram();
  const place: Array<[NodeKind, number, number]> = [
    ['INPUT', 0, 2], // i1 A
    ['INPUT', 0, 4], // i2 B
    ['INPUT', 0, 10], // i3 C
    ['AND', 12, 1], // g1
    ['AND', 12, 8], // g2
    ['AND', 12, 15], // g3
    ['OR', 22, 8], // g4
    ['OUTPUT', 30, 9], // o1 X
  ];
  for (const [kind, x, y] of place) d = must(addNode(d, kind, x, y));
  d = must(setInputCount(d, 'g4', 3));
  const links: Array<[string, string, number]> = [
    ['i1', 'g1', 0], ['i2', 'g1', 1],
    ['i1', 'g2', 0], ['i3', 'g2', 1],
    ['i2', 'g3', 0], ['i3', 'g3', 1],
    ['g1', 'g4', 0], ['g2', 'g4', 1], ['g3', 'g4', 2],
    ['g4', 'o1', 0],
  ];
  for (const [from, node, pin] of links) d = must(connect(d, from, { node, pin }));
  return d;
}

/** 子專案 16：4 個開關直接接 7 段顯示器（W 是最高位元，接 D；Z 接 A）。 */
export function bcdDiagram(): LogicDiagram {
  let d = emptyDiagram();
  const inputs: Array<[string, number]> = [['W', 4], ['X', 3], ['Y', 1], ['Z', 0]];
  for (const [name, y] of inputs) {
    const id = nextNodeId(d, 'INPUT');
    d = must(renameNode(must(addNode(d, 'INPUT', 0, y)), id, name));
  }
  d = must(addNode(d, 'DISPLAY', 10, 0)); // d1 S1
  // W（i1）→ D（第 3 腳）…Z（i4）→ A（第 0 腳）
  for (let k = 0; k < 4; k++) d = must(connect(d, `i${k + 1}`, { node: 'd1', pin: 3 - k }));
  return d;
}

/** 子專案 21：74LS83 方塊做 2 位元加法。A1 A2、B1 B2 是兩個數（A1、B1 是最低位元），A3 A4 B3 B4 C0 接 GND。 */
export function adderBlockDiagram(): LogicDiagram {
  let d = emptyDiagram();
  const inputs: Array<[string, number]> = [['A1', 0], ['A2', 1], ['B1', 4], ['B2', 5]];
  for (const [name, y] of inputs) {
    const id = nextNodeId(d, 'INPUT');
    d = must(renameNode(must(addNode(d, 'INPUT', 0, y)), id, name));
  }
  d = must(addNode(d, 'LOW', 0, 8)); // k1
  d = must(addNode(d, 'BLOCK', 10, 0, '74LS83')); // b1
  const outputs: Array<[string, number]> = [['S1', 0], ['S2', 1], ['S3', 3]];
  for (const [name, y] of outputs) {
    const id = nextNodeId(d, 'OUTPUT');
    d = must(renameNode(must(addNode(d, 'OUTPUT', 22, y)), id, name));
  }
  // 74LS83 的輸入順序：A1 A2 A3 A4 B1 B2 B3 B4 C0
  const links: Array<[string, number]> = [['i1', 0], ['i2', 1], ['k1', 2], ['k1', 3], ['i3', 4], ['i4', 5], ['k1', 6], ['k1', 7], ['k1', 8]];
  for (const [from, pin] of links) d = must(connect(d, from, { node: 'b1', pin }));
  // S1 S2 S3 → 輸出端（A3、B3 都是 0，2 位元相加的進位出現在 S3）
  const sums: Array<[number, string]> = [[0, 'o1'], [1, 'o2'], [2, 'o3']];
  for (const [k, o] of sums) d = must(connect(d, 'b1', { node: o, pin: 0 }, k));
  return d;
}

/** 子專案 46：74LS90 十進位計數器接 7 段顯示器：時脈接 CKA、QA 接 CKB（數 0–9），QA–QD 接顯示器的 A–D。 */
export function decadeCounterDiagram(): LogicDiagram {
  const IN = BLOCK_PINS['74LS90'].inputs;
  const OUT = BLOCK_PINS['74LS90'].outputs;
  let d = emptyDiagram();
  d = must(addNode(d, 'CLOCK', 0, 2)); // c1
  d = must(addNode(d, 'BLOCK', 8, 0, '74LS90')); // b1
  d = must(addNode(d, 'DISPLAY', 20, 0)); // d1 S1
  d = must(connect(d, 'c1', { node: 'b1', pin: IN.indexOf('CKA') }));
  d = must(connect(d, 'b1', { node: 'b1', pin: IN.indexOf('CKB') }, OUT.indexOf('QA')));
  (['QA', 'QB', 'QC', 'QD'] as const).forEach((q, k) => {
    d = must(connect(d, 'b1', { node: 'd1', pin: k }, OUT.indexOf(q)));
  });
  return d;
}

/** 子專案 46：兩顆 74LS76 做 3 位元漣波計數器（J = K = 1，每一級的 Q 接下一級的 CLK，下降緣觸發）。 */
export function rippleCounterDiagram(): LogicDiagram {
  const IN = BLOCK_PINS['74LS76'].inputs;
  const OUT = BLOCK_PINS['74LS76'].outputs;
  let d = emptyDiagram();
  d = must(addNode(d, 'CLOCK', 0, 1)); // c1
  d = must(addNode(d, 'HIGH', 0, 6)); // k1
  d = must(addNode(d, 'BLOCK', 8, 0, '74LS76')); // b1：Q0、Q1
  d = must(addNode(d, 'BLOCK', 8, 13, '74LS76')); // b2：Q2
  for (const [name, y] of [['Q0', 1], ['Q1', 4], ['Q2', 14]] as const) {
    const id = nextNodeId(d, 'OUTPUT');
    d = must(renameNode(must(addNode(d, 'OUTPUT', 22, y)), id, name));
  }
  for (const [node, pins] of [['b1', ['1J', '1K', '2J', '2K']], ['b2', ['1J', '1K']]] as const)
    for (const pin of pins) d = must(connect(d, 'k1', { node, pin: IN.indexOf(pin) }));
  d = must(connect(d, 'c1', { node: 'b1', pin: IN.indexOf('1CLK') }));
  d = must(connect(d, 'b1', { node: 'b1', pin: IN.indexOf('2CLK') }, OUT.indexOf('1Q')));
  d = must(connect(d, 'b1', { node: 'b2', pin: IN.indexOf('1CLK') }, OUT.indexOf('2Q')));
  d = must(connect(d, 'b1', { node: 'o1', pin: 0 }, OUT.indexOf('1Q')));
  d = must(connect(d, 'b1', { node: 'o2', pin: 0 }, OUT.indexOf('2Q')));
  d = must(connect(d, 'b2', { node: 'o3', pin: 0 }, OUT.indexOf('1Q')));
  return d;
}

/** 子專案 51：兩顆 D 型正反器做 2 位元同步計數器（共用時脈；D0 = /Q0、D1 = Q1 XOR Q0）。 */
export function syncCounterDiagram(): LogicDiagram {
  const IN = BLOCK_PINS.DFF.inputs;
  const OUT = BLOCK_PINS.DFF.outputs;
  let d = emptyDiagram();
  d = must(addNode(d, 'CLOCK', 0, 4)); // c1
  d = must(addNode(d, 'BLOCK', 8, 0, 'DFF')); // b1：Q0
  d = must(addNode(d, 'BLOCK', 8, 8, 'DFF')); // b2：Q1
  d = must(addNode(d, 'XOR', 3, 9)); // g1
  for (const [name, y] of [['Q0', 1], ['Q1', 9]] as const) {
    const id = nextNodeId(d, 'OUTPUT');
    d = must(renameNode(must(addNode(d, 'OUTPUT', 18, y)), id, name));
  }
  d = must(connect(d, 'c1', { node: 'b1', pin: IN.indexOf('CLK') }));
  d = must(connect(d, 'c1', { node: 'b2', pin: IN.indexOf('CLK') }));
  d = must(connect(d, 'b1', { node: 'b1', pin: IN.indexOf('D') }, OUT.indexOf('/Q')));
  d = must(connect(d, 'b1', { node: 'g1', pin: 0 }, OUT.indexOf('Q')));
  d = must(connect(d, 'b2', { node: 'g1', pin: 1 }, OUT.indexOf('Q')));
  d = must(connect(d, 'g1', { node: 'b2', pin: IN.indexOf('D') }));
  d = must(connect(d, 'b1', { node: 'o1', pin: 0 }, OUT.indexOf('Q')));
  d = must(connect(d, 'b2', { node: 'o2', pin: 0 }, OUT.indexOf('Q')));
  return d;
}

export const LOGIC_EXAMPLES = [
  { id: 'majority', name: '多數決電路（圖 2-5）', description: 'X = AB + AC + BC：三個輸入有兩個以上是 1 時 X = 1', build: majorityDiagram },
  { id: 'bcd', name: 'BCD 顯示（7 段顯示器）', description: 'W X Y Z 四個開關當成 BCD 數字（W 是最高位元），7 段顯示器顯示 0–9', build: bcdDiagram },
  { id: 'adder-block', name: '2 位元加法器（74LS83 方塊）', description: '用 74LS83 方塊把 A2A1 與 B2B1 相加，結果 S3S2S1；用不到的腳接 GND', build: adderBlockDiagram },
  { id: 'decade-counter', name: '十進位計數器（74LS90 + 7 段顯示器）', description: '每按一次時脈加 1，顯示 0–9；QA 接 CKB 才會數到 9', build: decadeCounterDiagram },
  { id: 'ripple-counter', name: '3 位元漣波計數器（74LS76 JK 正反器）', description: 'J = K = 1，每一級的 Q 接下一級的時脈（下降緣），Q2 Q1 Q0 數 0–7', build: rippleCounterDiagram },
  { id: 'sync-counter', name: '2 位元同步計數器（D 型正反器）', description: '兩顆 D 型正反器共用時脈：D0 = /Q0、D1 = Q1 XOR Q0，Q1 Q0 數 0–3', build: syncCounterDiagram },
];
