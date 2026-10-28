import { describe, expect, it } from 'vitest';
import { BLOCK_PINS } from '../../src/logic/blocks';
import { compareDiagramToStateTask } from '../../src/logic/stateCheck';
import { designFromStateTask, type StateTask } from '../../src/logic/stateTask';
import type { LogicDiagram } from '../../src/logic/types';

/** 子專案 53（規格 2026-10-28 state-task-check）：自己畫的電路和狀態表比對。 */
const counter = (flipFlop: 'D' | 'JK' = 'D'): StateTask => ({ states: 4, inputs: [], outputs: [], flipFlop, rows: [1, 2, 3, 0].map((next) => ({ next, out: [] })) });
const detector = (flipFlop: 'D' | 'JK' = 'D'): StateTask => ({
  states: 2,
  inputs: ['X'],
  outputs: ['Z'],
  flipFlop,
  rows: [
    { next: 0, out: [0] },
    { next: 1, out: [0] },
    { next: 0, out: [0] },
    { next: 1, out: [1] },
  ],
});
const built = (t: StateTask) => designFromStateTask(t).diagram;

describe('compareDiagramToStateTask', () => {
  it('finds the generated circuits correct', () => {
    for (const ff of ['D', 'JK'] as const) {
      expect(compareDiagramToStateTask(built(counter(ff)), counter(ff)), ff).toMatchObject({ kind: 'done', rows: 4, mismatches: [], unreached: [] });
      expect(compareDiagramToStateTask(built(detector(ff)), detector(ff)), ff).toMatchObject({ kind: 'done', rows: 4, mismatches: [], unreached: [] });
    }
  });

  it('reports a wrong next state and the states it never reaches', () => {
    // D0 接 Q0（應該是 /Q0）：一直停在 S0。
    const d = built(counter());
    const q = BLOCK_PINS.DFF.outputs.indexOf('Q');
    const dPin = BLOCK_PINS.DFF.inputs.indexOf('D');
    const ff0 = d.nodes.find((n) => n.kind === 'BLOCK' && d.wires.some((w) => w.from === n.id && d.nodes.find((m) => m.id === w.to.node)?.name === 'Q0'))!.id;
    const wrong: LogicDiagram = { ...d, wires: d.wires.map((w) => (w.to.node === ff0 && w.to.pin === dPin ? { ...w, from: ff0, fromPin: undefined, ...(q ? { fromPin: q } : {}) } : w)) };
    const r = compareDiagramToStateTask(wrong, counter());
    expect(r).toMatchObject({ kind: 'done', rows: 1, unreached: [1, 2, 3] });
    if (r.kind !== 'done') throw new Error();
    expect(r.mismatches).toEqual([{ row: 0, state: 0, inputs: '', expectedNext: 'S1', actualNext: 'S0', expected: [], actual: [] }]);
  });

  it('reports wrong outputs, and skips do not care cells', () => {
    const d = built(detector());
    const x = d.nodes.find((n) => n.name === 'X')!.id;
    const z = d.nodes.find((n) => n.name === 'Z')!.id;
    // Z 直接接 X：S0、X = 1 時 Z 應該是 0。
    const wrong: LogicDiagram = { ...d, wires: d.wires.map((w) => (w.to.node === z ? { id: w.id, from: x, to: w.to } : w)) };
    const r = compareDiagramToStateTask(wrong, detector());
    if (r.kind !== 'done') throw new Error(r.kind);
    expect(r.mismatches.map((m) => [m.state, m.inputs, m.expected, m.actual])).toEqual([[0, '1', ['0'], ['1']]]);
    // 那一格改成不在乎就不比。
    const lenient = { ...detector(), rows: detector().rows.map((row, i) => (i === 1 ? { ...row, out: ['X' as const] } : row)) };
    expect(compareDiagramToStateTask(wrong, lenient)).toMatchObject({ kind: 'done', mismatches: [] });
  });

  it('explains what is missing before it can compare', () => {
    expect(compareDiagramToStateTask({ version: 1, nodes: [], wires: [] }, counter())).toEqual({ kind: 'none' });
    const d = built(detector());
    const noQ: LogicDiagram = { ...d, nodes: d.nodes.map((n) => (n.name === 'Q0' ? { ...n, name: 'S' } : n)) };
    expect(compareDiagramToStateTask(noQ, detector())).toMatchObject({ kind: 'issues', issues: [expect.stringContaining('Q0')] });
    const noClock: LogicDiagram = { ...d, nodes: d.nodes.filter((n) => n.kind !== 'CLOCK'), wires: d.wires.filter((w) => !d.nodes.some((n) => n.kind === 'CLOCK' && n.id === w.from)) };
    expect(compareDiagramToStateTask(noClock, detector())).toMatchObject({ kind: 'issues', issues: expect.arrayContaining([expect.stringContaining('時脈')]) });
    const noX: LogicDiagram = { ...d, nodes: d.nodes.map((n) => (n.name === 'X' ? { ...n, name: 'Y' } : n)) };
    expect(compareDiagramToStateTask(noX, detector())).toMatchObject({ kind: 'issues', issues: expect.arrayContaining([expect.stringContaining('輸入 X'), expect.stringContaining('Y')]) });
  });
});

describe('comparison text', () => {
  it('writes a mismatch in plain words', async () => {
    const { mismatchText } = await import('../../src/logic/stateCheck');
    expect(mismatchText({ row: 3, state: 1, inputs: '1', expectedNext: 'S1', actualNext: 'S0', expected: ['1'], actual: ['?'] }, detector())).toBe('S1、X = 1：題目 → S1、Z = 1；邏輯圖 → S0、Z = ?');
  });
});
