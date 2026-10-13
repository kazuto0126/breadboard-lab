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

export const LOGIC_EXAMPLES = [
  { id: 'majority', name: '多數決電路（圖 2-5）', description: 'X = AB + AC + BC：三個輸入有兩個以上是 1 時 X = 1', build: majorityDiagram },
  { id: 'bcd', name: 'BCD 顯示（7 段顯示器）', description: 'W X Y Z 四個開關當成 BCD 數字（W 是最高位元），7 段顯示器顯示 0–9', build: bcdDiagram },
];
