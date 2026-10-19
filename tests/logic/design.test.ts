import { describe, expect, it } from 'vitest';
import { designFromTask } from '../../src/logic/design';
import { parseLogicDiagram } from '../../src/logic/file';
import { sopText } from '../../src/logic/minimize';
import { convertProblem } from '../../src/logic/synth';
import { compareDiagramToTask, createTask, type TaskValue, type TruthTask } from '../../src/logic/task';
import type { LogicDiagram, NodeKind } from '../../src/logic/types';

/** 用每個輸出的「1 的列」與「不在乎的列」建立題目。 */
function task(inputs: string[], columns: Array<{ ones: number[]; x?: number[] }>, outputs = columns.map((_, k) => `X${k + 1}`)): TruthTask {
  const made = createTask(inputs, outputs);
  if (!made.ok) throw new Error(made.reason);
  return {
    ...made.task,
    rows: made.task.rows.map((_, r) => columns.map((c): TaskValue => (c.ones.includes(r) ? 1 : c.x?.includes(r) ? 'X' : 0))),
  };
}

const kinds = (d: LogicDiagram) => {
  const count: Partial<Record<NodeKind, number>> = {};
  for (const n of d.nodes) count[n.kind] = (count[n.kind] ?? 0) + 1;
  return count;
};

/** 產生的圖要合法、和題目全部一致、可以轉成麵包板。 */
function expectSound(d: LogicDiagram, t: TruthTask) {
  const parsed = parseLogicDiagram(JSON.parse(JSON.stringify(d)));
  expect(parsed.ok ? null : parsed.error).toBeNull();
  expect(compareDiagramToTask(d, t)).toMatchObject({ kind: 'done', mismatches: [] });
  expect(convertProblem(d)).toBeNull();
  for (const n of d.nodes) if (n.kind === 'AND' || n.kind === 'OR') expect(n.inputs).toBeGreaterThanOrEqual(2);
}

describe('drawing a logic diagram from a task', () => {
  it('draws figure 2-5 for the majority task: three ANDs and an OR, no NOT', () => {
    const t = task(['A', 'B', 'C'], [{ ones: [3, 5, 6, 7] }], ['X']);
    const { diagram, columns } = designFromTask(t);
    const terms = columns.map((c) => c.terms);
    expect(sopText(terms[0], t.inputs)).toBe('AB + AC + BC');
    expect(kinds(diagram)).toEqual({ INPUT: 3, AND: 3, OR: 1, OUTPUT: 1 });
    expect(diagram.nodes.filter((n) => n.kind === 'INPUT').map((n) => n.name)).toEqual(['A', 'B', 'C']);
    expect(diagram.nodes.find((n) => n.kind === 'OR')!.inputs).toBe(3);
    expect(diagram.task).toBe(t);
    expectSound(diagram, t);
  });

  it('shares NOT gates and product terms between outputs', () => {
    // X1 = A'B；X2 = A'B + AB'（XOR）：A'B 只做一個 AND，A' 只做一個 NOT。
    const t = task(['A', 'B'], [{ ones: [1] }, { ones: [1, 2] }]);
    const { diagram } = designFromTask(t);
    expect(kinds(diagram)).toEqual({ INPUT: 2, NOT: 2, AND: 2, OR: 1, OUTPUT: 2 });
    expectSound(diagram, t);
  });

  it('chains gates when a term has more than 4 letters or an output more than 4 terms', () => {
    const five = task(['A', 'B', 'C', 'D', 'E'], [{ ones: [31] }]);
    expect(kinds(designFromTask(five).diagram)).toEqual({ INPUT: 5, AND: 2, OUTPUT: 1 });
    expectSound(designFromTask(five).diagram, five);
    // 6 個輸入的同位檢查：32 項、每項 6 個字母。
    const odd = Array.from({ length: 64 }, (_, r) => r).filter((r) => r.toString(2).split('1').length % 2 === 0);
    const parity = task(['A', 'B', 'C', 'D', 'E', 'F'], [{ ones: odd }]);
    const { diagram } = designFromTask(parity);
    expect(kinds(diagram)).toEqual({ INPUT: 6, NOT: 6, AND: 64, OR: 11, OUTPUT: 1 });
    expectSound(diagram, parity);
  });

  it('wires constants for outputs that are always 0 or 1, and keeps unused inputs', () => {
    // X1 全 0、X2 全 1、X3 全 X（當成 0）、X4 = A（B 沒用到）。
    const t = task(['A', 'B'], [{ ones: [] }, { ones: [0, 1, 2, 3] }, { ones: [], x: [0, 1, 2, 3] }, { ones: [2, 3] }]);
    const { diagram } = designFromTask(t);
    expect(kinds(diagram)).toEqual({ INPUT: 2, LOW: 1, HIGH: 1, OUTPUT: 4 });
    const from = (name: string) => {
      const o = diagram.nodes.find((n) => n.name === name)!;
      return diagram.nodes.find((n) => n.id === diagram.wires.find((w) => w.to.node === o.id)!.from)!;
    };
    expect([from('X1').kind, from('X2').kind, from('X3').kind, from('X4').name]).toEqual(['LOW', 'HIGH', 'LOW', 'A']);
    expectSound(diagram, t);
  });

  it('draws lines that never overlap or run through parts for tasks with up to 5 inputs', async () => {
    const { wireRoutes } = await import('../../src/logic/wiring');
    const { nodeSize } = await import('../../src/logic/shapes');
    const { signalOf } = await import('../../src/logic/types');
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 80; trial++) {
      const n = 1 + Math.floor(rand() * 5);
      const m = 1 + Math.floor(rand() * 3);
      const columns = Array.from({ length: m }, () => {
        const ones: number[] = [];
        const x: number[] = [];
        for (let r = 0; r < 1 << n; r++) {
          const p = rand();
          if (p < 0.4) ones.push(r);
          else if (p < 0.5) x.push(r);
        }
        return { ones, x };
      });
      const d = designFromTask(task(['A', 'B', 'C', 'D', 'E'].slice(0, n), columns)).diagram;
      const routes = wireRoutes(d);
      const segs = d.wires.flatMap((w) => {
        const pts = routes.get(w.id)!;
        return pts.slice(1).map((q, i) => ({ signal: signalOf(w.from, w.fromPin), p: pts[i], q }));
      });
      const span = (a: number, b: number, c: number, e: number) => Math.min(Math.max(a, b), Math.max(c, e)) - Math.max(Math.min(a, b), Math.min(c, e));
      for (const s of segs) {
        for (const t of segs) {
          if (s.signal === t.signal) continue;
          if (s.p.y === s.q.y && t.p.y === t.q.y && s.p.y === t.p.y) expect(span(s.p.x, s.q.x, t.p.x, t.q.x), `第 ${trial} 題`).toBeLessThanOrEqual(0);
          if (s.p.x === s.q.x && t.p.x === t.q.x && s.p.x === t.p.x) expect(span(s.p.y, s.q.y, t.p.y, t.q.y), `第 ${trial} 題`).toBeLessThanOrEqual(0);
        }
        for (const nd of d.nodes) {
          const { w, h } = nodeSize(nd);
          const through =
            s.p.y === s.q.y
              ? s.p.y >= nd.y && s.p.y <= nd.y + h - 1 && Math.min(s.p.x, s.q.x) < nd.x + w && Math.max(s.p.x, s.q.x) > nd.x
              : s.p.x > nd.x && s.p.x < nd.x + w && Math.min(s.p.y, s.q.y) <= nd.y + h - 1 && Math.max(s.p.y, s.q.y) >= nd.y;
          expect(through, `第 ${trial} 題的線穿過 ${nd.id}`).toBe(false);
        }
      }
    }
  });

  it('always draws a sound diagram for random tasks', () => {
    let seed = 25;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 60; trial++) {
      const n = 1 + Math.floor(rand() * 6);
      const m = 1 + Math.floor(rand() * 3);
      const columns = Array.from({ length: m }, () => {
        const ones: number[] = [];
        const x: number[] = [];
        for (let r = 0; r < 1 << n; r++) {
          const p = rand();
          if (p < 0.4) ones.push(r);
          else if (p < 0.5) x.push(r);
        }
        return { ones, x };
      });
      const t = task(['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n), columns);
      expectSound(designFromTask(t).diagram, t);
    }
  });
});

describe('other forms (sub-project 31)', () => {
  const majority = () => task(['A', 'B', 'C'], [{ ones: [3, 5, 6, 7] }], ['X']);

  it('draws OR–AND, NAND–NAND and NOR–NOR diagrams with only the right gates', () => {
    const pos = designFromTask(majority(), 'pos').diagram;
    expect(kinds(pos)).toEqual({ INPUT: 3, OR: 3, AND: 1, OUTPUT: 1 });
    expectSound(pos, majority());
    const nand = designFromTask(majority(), 'nand').diagram;
    expect(kinds(nand)).toEqual({ INPUT: 3, NAND: 4, OUTPUT: 1 });
    expectSound(nand, majority());
    const nor = designFromTask(majority(), 'nor').diagram;
    expect(kinds(nor)).toEqual({ INPUT: 3, NOR: 4, OUTPUT: 1 });
    expectSound(nor, majority());
  });

  it('makes NOT gates out of NAND or NOR with both inputs tied together', () => {
    // X = A'B：只用 NAND 時 A' 是兩個輸入都接 A 的 NAND。
    const t = task(['A', 'B'], [{ ones: [1] }], ['X']);
    const d = designFromTask(t, 'nand').diagram;
    const tied = d.nodes.filter((n) => n.kind === 'NAND' && new Set(d.wires.filter((w) => w.to.node === n.id).map((w) => w.from)).size === 1);
    expect(tied.length).toBeGreaterThanOrEqual(1);
    expect(d.nodes.every((n) => n.kind === 'INPUT' || n.kind === 'OUTPUT' || n.kind === 'NAND')).toBe(true);
    expectSound(d, t);
  });

  it('shares product terms between outputs when it can', () => {
    // X1 = AB；X2 = Σm(0,1,2,5,6,7) 選含 AB 的那組，AB 只做一個 AND。
    const t = task(['A', 'B', 'C'], [{ ones: [6, 7] }, { ones: [0, 1, 2, 5, 6, 7] }]);
    const d = designFromTask(t).diagram;
    expect(d.nodes.filter((n) => n.kind === 'AND')).toHaveLength(3);
    expectSound(d, t);
  });

  it.each(['sop', 'pos', 'nand', 'nor'] as const)('always draws a sound %s diagram for random tasks', (form) => {
    let seed = 31;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 40; trial++) {
      const n = 1 + Math.floor(rand() * 6);
      const m = 1 + Math.floor(rand() * 3);
      const columns = Array.from({ length: m }, () => {
        const ones: number[] = [];
        const x: number[] = [];
        for (let r = 0; r < 1 << n; r++) {
          const p = rand();
          if (p < 0.45) ones.push(r);
          else if (p < 0.55) x.push(r);
        }
        return { ones, x };
      });
      const t = task(['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n), columns);
      const d = designFromTask(t, form).diagram;
      expectSound(d, t);
      if (form === 'nand') expect(d.nodes.every((nd) => ['INPUT', 'OUTPUT', 'NAND', 'HIGH', 'LOW'].includes(nd.kind))).toBe(true);
      if (form === 'nor') expect(d.nodes.every((nd) => ['INPUT', 'OUTPUT', 'NOR', 'HIGH', 'LOW'].includes(nd.kind))).toBe(true);
    }
  });
});
