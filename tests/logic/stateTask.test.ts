import { describe, expect, it } from 'vitest';
import { evaluate, sequenceTable, type SeqState } from '../../src/logic/evaluate';
import { parseLogicDiagram } from '../../src/logic/file';
import { sopText } from '../../src/logic/minimize';
import {
  createStateTask,
  designFromStateTask,
  excitationTask,
  flipFlopCount,
  parseStateTask,
  stateTaskColumns,
  type StateTask,
} from '../../src/logic/stateTask';
import type { LogicDiagram } from '../../src/logic/types';

/** 子專案 52（規格 2026-10-25 state-table-task）：狀態表題目。 */
const counter = (flipFlop: 'D' | 'JK' = 'D'): StateTask => ({ states: 4, inputs: [], outputs: [], flipFlop, rows: [1, 2, 3, 0].map((next) => ({ next, out: [] })) });

/** 偵測輸入 X 連續兩個 1（Mealy）：S0 沒看到 1、S1 看到一個 1；在 S1 又收到 1 時 Z = 1。 */
const detector = (flipFlop: 'D' | 'JK' = 'D'): StateTask => ({
  states: 2,
  inputs: ['X'],
  outputs: ['Z'],
  flipFlop,
  rows: [
    { next: 0, out: [0] }, // S0, X=0
    { next: 1, out: [0] }, // S0, X=1
    { next: 0, out: [0] }, // S1, X=0
    { next: 1, out: [1] }, // S1, X=1
  ],
});

const equations = (t: StateTask) => {
  const names = excitationTask(t).inputs;
  return Object.fromEntries(stateTaskColumns(t).map((c) => [c.label, sopText(c.terms, names)]));
};

describe('state tasks', () => {
  it('uses the fewest flip-flops for the states', () => {
    expect([2, 3, 4, 5, 8].map(flipFlopCount)).toEqual([1, 2, 2, 3, 3]);
  });

  it('creates a task with every row going to S0 and checks names', () => {
    const r = createStateTask(3, ['X'], ['Z'], 'D');
    if (!r.ok) throw new Error(r.reason);
    expect(r.task.rows).toHaveLength(6);
    expect(r.task.rows[0]).toEqual({ next: 0, out: [0] });
    expect(createStateTask(9, [], ['Z'], 'D')).toMatchObject({ ok: false });
    expect(createStateTask(4, ['A', 'B', 'C'], [], 'D')).toMatchObject({ ok: false, reason: expect.stringContaining('輸入最多 2 個') });
    expect(createStateTask(4, ['Q0'], [], 'D')).toMatchObject({ ok: false, reason: expect.stringContaining('Q0') });
    expect(createStateTask(4, [], ['K1'], 'JK')).toMatchObject({ ok: false, reason: expect.stringContaining('K1') });
  });

  it('simplifies a 2-bit up counter for D and JK flip-flops', () => {
    expect(equations(counter())).toEqual({ D1: "Q1'Q0 + Q1Q0'", D0: "Q0'" });
    expect(equations(counter('JK'))).toEqual({ J1: 'Q0', K1: 'Q0', J0: '1', K0: '1' });
  });

  it('treats unused state codes as do not care', () => {
    // 3 個狀態的計數器 S0 → S1 → S2 → S0：11 不在乎。
    const t: StateTask = { states: 3, inputs: [], outputs: [], flipFlop: 'D', rows: [1, 2, 0].map((next) => ({ next, out: [] })) };
    expect(excitationTask(t).rows[3]).toEqual(['X', 'X']);
    expect(equations(t)).toEqual({ D1: 'Q0', D0: "Q1'Q0'" });
  });

  it('reads back what it writes, and rejects bad tasks', () => {
    const d: LogicDiagram = { version: 1, nodes: [], wires: [], stateTask: detector('JK') };
    const back = parseLogicDiagram(JSON.parse(JSON.stringify(d)));
    if (!back.ok) throw new Error(back.error);
    expect(back.diagram.stateTask).toEqual(detector('JK'));
    expect(parseStateTask({ ...detector(), rows: detector().rows.slice(1) })).toMatchObject({ ok: false });
    expect(parseStateTask({ ...detector(), rows: [{ next: 2, out: [0] }, ...detector().rows.slice(1)] })).toMatchObject({ ok: false });
  });
});

/** 從重設開始照輸入序列送脈衝：每一步先讀輸出（脈衝前），再送一個脈衝。回傳每一步的輸出與送完後的狀態位元。 */
function run(d: LogicDiagram, xs: Array<0 | 1>, outputs: string[], bits: string[]) {
  const id = (name: string) => d.nodes.find((n) => n.name === name)!.id;
  const clk = d.nodes.find((n) => n.kind === 'CLOCK')!.id;
  const x = d.nodes.find((n) => n.kind === 'INPUT')?.id;
  let state: SeqState | undefined = evaluate(d, { [clk]: 0 }).seq;
  const seen: string[] = [];
  for (const v of xs) {
    const values = { ...(x ? { [x]: v } : {}) };
    const before = evaluate(d, { ...values, [clk]: 0 }, state);
    const up = evaluate(d, { ...values, [clk]: 1 }, before.seq);
    const down = evaluate(d, { ...values, [clk]: 0 }, up.seq);
    state = down.seq;
    seen.push(outputs.map((o) => before.nodes.get(id(o))).join('') + '>' + bits.map((b) => down.nodes.get(id(b))).join(''));
  }
  return seen;
}

describe('designFromStateTask', () => {
  it('builds a counter from D flip-flops that counts 0 1 2 3 0', () => {
    const { diagram } = designFromStateTask(counter());
    expect(diagram.nodes.filter((n) => n.kind === 'BLOCK').map((n) => n.chip)).toEqual(['DFF', 'DFF']);
    expect(diagram.nodes.filter((n) => n.kind === 'CLOCK')).toHaveLength(1);
    // Q0' 直接用 /Q，不放 NOT。
    expect(diagram.nodes.some((n) => n.kind === 'NOT')).toBe(false);
    const t = sequenceTable(diagram, 4);
    if (!t.ok) throw new Error(t.reason);
    expect(t.outputs).toEqual(['Q0', 'Q1']);
    expect(t.rows.map((r) => `${r.out[1]}${r.out[0]}`)).toEqual(['00', '01', '10', '11', '00']);
    expect(diagram.stateTask).toEqual(counter());
  });

  it('builds the same counter from JK flip-flops', () => {
    const { diagram } = designFromStateTask(counter('JK'));
    expect(diagram.nodes.filter((n) => n.kind === 'BLOCK').map((n) => n.chip)).toEqual(['JKFF', 'JKFF']);
    const t = sequenceTable(diagram, 4);
    if (!t.ok) throw new Error(t.reason);
    expect(t.rows.map((r) => `${r.out[1]}${r.out[0]}`)).toEqual(['00', '01', '10', '11', '00']);
  });

  it('a Mealy detector follows the state table for D and JK', () => {
    for (const ff of ['D', 'JK'] as const) {
      const { diagram } = designFromStateTask(detector(ff));
      // X = 0 1 1 1 0 1：Z 在第 3、4 步（S1 收到 1）是 1。
      expect(run(diagram, [0, 1, 1, 1, 0, 1], ['Z'], ['Q0']), ff).toEqual(['0>0', '0>1', '1>1', '1>1', '0>0', '0>1']);
    }
  });
});
