import { describe, expect, it } from 'vitest';
import { indexCircuit, pinPoint } from '../../src/core/circuit/circuitIndex';
import { validateCircuit } from '../../src/core/circuit/validate';
import { holeLabel } from '../../src/editor/analysis';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { toBreadboard, type ConvertOptions } from '../../src/logic/toBreadboard';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';
import type { Circuit } from '../../src/types/circuit';
import { powerProblems } from '../fixtures/powerChecks';

/** 子專案 36（規格 2026-10-20 conversion-placement）：上 / 下拉電阻直立，一端插在開關那一排、另一端直接插進電源軌。 */
const must = (r: { ok: true; diagram: LogicDiagram } | { ok: false; reason: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.diagram;
};
const convert = (d: LogicDiagram, options: Partial<ConvertOptions>) => {
  const r = toBreadboard(d, { switchTo: 'vcc', board: 'auto', pulls: true, ...options });
  if (!r.ok) throw new Error(r.reason);
  return r;
};
/** 每顆上 / 下拉電阻（電阻值 330 或 1000）的兩隻腳的孔位，以及開關每個輸入那一排的欄。 */
function pulls(c: Circuit) {
  const index = indexCircuit(c);
  const label = (id: string, n: number) => holeLabel(c, pinPoint(index, { componentId: id, pinNumber: n })!);
  return c.components.filter((x) => x.defId === 'resistor' && (x.props.resistance === 330 || x.props.resistance === 1000)).map((x) => [label(x.id, 1), label(x.id, 2)]);
}
const column = (label: string) => Number(/(\d+)$/.exec(label)![1]);
const switchColumn = (c: Circuit, pin: number) => {
  const index = indexCircuit(c);
  return column(holeLabel(c, pinPoint(index, { componentId: 'SW1', pinNumber: pin })!));
};
/** n 個輸入各自直接接到一個輸出端。 */
function passThrough(n: number): LogicDiagram {
  let d = emptyDiagram();
  for (let i = 0; i < n; i++) d = must(addNode(d, 'INPUT', 0, i * 3));
  for (let i = 0; i < n; i++) d = must(addNode(d, 'OUTPUT', 8, i * 3));
  for (let i = 0; i < n; i++) d = must(connect(d, `i${i + 1}`, { node: `o${i + 1}`, pin: 0 }));
  return d;
}
const sound = (d: LogicDiagram, c: Circuit) => {
  expect(validateCircuit(c).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'))).toEqual([]);
  expect(checkAgainstDiagram(d, c)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
  expect(powerProblems(c)).toEqual([]);
};

describe('upright pull resistors (sub-project 36)', () => {
  it('pull-downs go from row J of each switch column straight into the − rail (MB-102)', () => {
    const r = convert(majorityDiagram(), { board: 'MB102' });
    const ps = pulls(r.circuit);
    expect(ps).toHaveLength(3);
    ps.forEach(([a, b], k) => {
      expect(a).toMatch(/^J\d+$/);
      expect(b).toMatch(/^B-\d+$/);
      expect(column(a)).toBe(switchColumn(r.circuit, k + 1));
      expect(column(b)).toBe(column(a));
    });
    sound(majorityDiagram(), r.circuit);
  });

  it('pull-ups go from row A straight into the + rail when the switches go to GND', () => {
    const r = convert(majorityDiagram(), { board: 'MB102', switchTo: 'gnd' });
    pulls(r.circuit).forEach(([a, b], k) => {
      expect(a).toMatch(/^A\d+$/);
      expect(b).toMatch(/^T\+\d+$/);
      expect(column(a)).toBe(switchColumn(r.circuit, 8 - k));
    });
    sound(majorityDiagram(), r.circuit);
  });

  it('does the same on an EIC-1106', () => {
    const down = convert(majorityDiagram(), { board: 'EIC1106' });
    for (const [a, b] of pulls(down.circuit)) {
      expect(a).toMatch(/^1-J\d+$/);
      expect(b).toMatch(/^P3-\d+$/);
    }
    sound(majorityDiagram(), down.circuit);
    const up = convert(majorityDiagram(), { board: 'EIC1106', switchTo: 'gnd' });
    for (const [a, b] of pulls(up.circuit)) {
      expect(a).toMatch(/^1-A\d+$/);
      expect(b).toMatch(/^P2\+\d+$/);
    }
    sound(majorityDiagram(), up.circuit);
  });

  // 子專案 47：8 個輸入時拆成兩個 4 位元開關，每個各自挪到電源軌有孔的地方：8 顆都直立（以前有 1 顆碰到沒有孔的欄、只好平放）。
  it('plugs all 8 pull resistors straight into the rail with two 4-bit switches', () => {
    const d = passThrough(8);
    const r = convert(d, { board: 'EIC1106' });
    const ps = pulls(r.circuit);
    expect(ps).toHaveLength(8);
    const upright = ps.filter(([, b]) => /^P3-/.test(b));
    expect(upright).toHaveLength(8);
    sound(d, r.circuit);
  });
});
