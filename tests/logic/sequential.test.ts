import { describe, expect, it } from 'vitest';
import { checkDiagram } from '../../src/logic/check';
import { evaluate, isSequential, sequenceTable, type SeqState } from '../../src/logic/evaluate';
import type { BlockChip, LogicDiagram, LogicNode, LogicWire } from '../../src/logic/types';

/** 子專案 46（規格 2026-10-24 sequential-logic）：時脈、正反器與計數器方塊的模擬。 */
let wid = 0;
const w = (from: string, node: string, pin = 0, fromPin?: number): LogicWire => ({ id: `w${++wid}`, from, ...(fromPin ? { fromPin } : {}), to: { node, pin } });
const clock = (id = 'clk'): LogicNode => ({ id, kind: 'CLOCK', x: 0, y: 0, name: 'CLK' });
const input = (id: string, value: 0 | 1 = 0): LogicNode => ({ id, kind: 'INPUT', x: 0, y: 0, name: id, value });
const output = (id: string): LogicNode => ({ id, kind: 'OUTPUT', x: 0, y: 0, name: id });
const block = (id: string, chip: BlockChip): LogicNode => ({ id, kind: 'BLOCK', x: 0, y: 0, chip });
const high = (id: string): LogicNode => ({ id, kind: 'HIGH', x: 0, y: 0 });
const diagram = (nodes: LogicNode[], wires: LogicWire[]): LogicDiagram => ({ version: 1, nodes, wires });

/** 送一個脈衝（0 → 1 → 0），回傳新的狀態。 */
function pulse(d: LogicDiagram, state: SeqState | undefined, clk = 'clk'): SeqState {
  const up = evaluate(d, { [clk]: 1 }, state).seq;
  return evaluate(d, { [clk]: 0 }, up).seq;
}
/** 依序幾個輸出端的值（MSB 在前）。 */
const bits = (d: LogicDiagram, state: SeqState | undefined, ids: string[], values: Record<string, 0 | 1> = {}) => {
  const v = evaluate(d, values, state);
  return ids.map((id) => v.nodes.get(id)).join('');
};
/** 送 n 個脈衝，每一步讀出的值。 */
function count(d: LogicDiagram, ids: string[], n: number): string[] {
  // 先記下時脈是 0（上電），第一個上升緣才看得到。
  let state: SeqState | undefined = evaluate(d, {}, undefined).seq;
  const seen = [bits(d, state, ids)];
  for (let k = 0; k < n; k++) {
    state = pulse(d, state);
    seen.push(bits(d, state, ids));
  }
  return seen;
}

// 74LS74 的腳：1/CLR 1D 1CLK 1/PRE … 輸出 1Q 1/Q …（順序見 BLOCK_PINS）。
const pinOf = async (chip: BlockChip, name: string) => (await import('../../src/logic/blocks')).BLOCK_PINS[chip].inputs.indexOf(name);
const outOf = async (chip: BlockChip, name: string) => (await import('../../src/logic/blocks')).BLOCK_PINS[chip].outputs.indexOf(name);

describe('sequential blocks', () => {
  it('knows which diagrams are sequential', () => {
    expect(isSequential(diagram([input('A'), output('X')], [w('A', 'X')]))).toBe(false);
    expect(isSequential(diagram([block('u', '74LS74')], []))).toBe(true);
    expect(isSequential(diagram([clock()], []))).toBe(true);
  });

  it('a D flip-flop takes D on the rising edge only', async () => {
    const d = diagram([clock(), input('D'), block('u', '74LS74'), output('Q')], [w('D', 'u', await pinOf('74LS74', '1D')), w('clk', 'u', await pinOf('74LS74', '1CLK')), w('u', 'Q', 0, await outOf('74LS74', '1Q'))]);
    let s = evaluate(d, {}, undefined).seq;
    expect(bits(d, s, ['Q'])).toBe('0');
    // D = 1，時脈還沒變：Q 不變。
    s = evaluate(d, { D: 1 }, s).seq;
    expect(bits(d, s, ['Q'], { D: 1 })).toBe('0');
    // 上升緣：Q = 1；下降緣不變。
    s = evaluate(d, { D: 1, clk: 1 }, s).seq;
    expect(bits(d, s, ['Q'], { D: 1, clk: 1 })).toBe('1');
    s = evaluate(d, { D: 0, clk: 0 }, s).seq;
    expect(bits(d, s, ['Q'], { D: 0, clk: 0 })).toBe('1');
    expect(checkDiagram(d).filter((i) => i.code === 'LOGIC_INPUT_OPEN')).toEqual([]);
  });

  it('a JK ripple counter built from two 74LS76 counts 0 to 7', async () => {
    const J = await pinOf('74LS76', '1J');
    const K = await pinOf('74LS76', '1K');
    const C1 = await pinOf('74LS76', '1CLK');
    const J2 = await pinOf('74LS76', '2J');
    const K2 = await pinOf('74LS76', '2K');
    const C2 = await pinOf('74LS76', '2CLK');
    const Q1 = await outOf('74LS76', '1Q');
    const Q2 = await outOf('74LS76', '2Q');
    // u1 的兩個正反器是 Q0、Q1，u2 的第一個是 Q2；J = K = 1（接 5V），每一級的 Q 接下一級的 CLK（下降緣觸發）。
    const d = diagram(
      [clock(), high('h'), block('u1', '74LS76'), block('u2', '74LS76'), output('Q0'), output('Q1'), output('Q2')],
      [
        w('h', 'u1', J), w('h', 'u1', K), w('h', 'u1', J2), w('h', 'u1', K2), w('h', 'u2', J), w('h', 'u2', K),
        w('clk', 'u1', C1), w('u1', 'u1', C2, Q1), w('u1', 'u2', C1, Q2),
        w('u1', 'Q0', 0, Q1), w('u1', 'Q1', 0, Q2), w('u2', 'Q2', 0, Q1),
      ],
    );
    expect(checkDiagram(d).filter((i) => i.severity === 'error')).toEqual([]);
    expect(count(d, ['Q2', 'Q1', 'Q0'], 8)).toEqual(['000', '001', '010', '011', '100', '101', '110', '111', '000']);
  });

  it('74LS93 with QA wired to CKB counts 0 to 15, and 74LS90 counts 0 to 9', async () => {
    for (const [chip, n] of [['74LS93', 16], ['74LS90', 10]] as const) {
      const outs = ['QD', 'QC', 'QB', 'QA'];
      const nodes = [clock(), block('u', chip), ...outs.map(output)];
      const wires = [w('clk', 'u', await pinOf(chip, 'CKA')), w('u', 'u', await pinOf(chip, 'CKB'), await outOf(chip, 'QA'))];
      for (const o of outs) wires.push(w('u', o, 0, await outOf(chip, o)));
      const seen = count(diagram(nodes, wires), outs, n);
      expect(seen.map((b) => parseInt(b, 2)), chip).toEqual([...Array.from({ length: n }, (_, k) => k), 0]);
    }
  });

  it('74LS161 and 74LS193 count up on their clocks', async () => {
    const outs = ['QD', 'QC', 'QB', 'QA'];
    const a = diagram([clock(), block('u', '74LS161'), ...outs.map(output)], [w('clk', 'u', await pinOf('74LS161', 'CLK')), ...(await Promise.all(outs.map(async (o) => w('u', o, 0, await outOf('74LS161', o)))))]);
    expect(count(a, outs, 5).map((b) => parseInt(b, 2))).toEqual([0, 1, 2, 3, 4, 5]);
    const b = diagram([clock(), block('u', '74LS193'), ...outs.map(output)], [w('clk', 'u', await pinOf('74LS193', 'UP')), ...(await Promise.all(outs.map(async (o) => w('u', o, 0, await outOf('74LS193', o)))))]);
    expect(count(b, outs, 5).map((x) => parseInt(x, 2))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('allows a loop through a flip-flop (Q → NOT → D toggles), but not a loop of gates', async () => {
    const d = diagram(
      [clock(), block('u', '74LS74'), { id: 'n', kind: 'NOT', x: 0, y: 0 }, output('Q')],
      [w('clk', 'u', await pinOf('74LS74', '1CLK')), w('u', 'n', 0, await outOf('74LS74', '1Q')), w('n', 'u', await pinOf('74LS74', '1D')), w('u', 'Q', 0, await outOf('74LS74', '1Q'))],
    );
    expect(checkDiagram(d).filter((i) => i.code === 'LOGIC_LOOP')).toEqual([]);
    expect(count(d, ['Q'], 4)).toEqual(['0', '1', '0', '1', '0']);
    const gates = diagram([input('A'), { id: 'g1', kind: 'AND', x: 0, y: 0, inputs: 2 }, { id: 'g2', kind: 'OR', x: 0, y: 0, inputs: 2 }, output('X')], [w('A', 'g1', 0), w('g2', 'g1', 1), w('g1', 'g2', 0), w('A', 'g2', 1), w('g2', 'X')]);
    expect(checkDiagram(gates).map((i) => i.code)).toContain('LOGIC_LOOP');
  });

  it('clears asynchronously through /CLR', async () => {
    const d = diagram(
      [clock(), input('CLR', 1), block('u', '74LS93'), output('QA')],
      [w('clk', 'u', await pinOf('74LS93', 'CKA')), w('CLR', 'u', await pinOf('74LS93', 'R0(1)')), w('CLR', 'u', await pinOf('74LS93', 'R0(2)')), w('u', 'QA', 0, await outOf('74LS93', 'QA'))],
    );
    // CLR = 0：一個脈衝之後 QA = 1（下降緣）；撥成 1（R0 都是 1）立刻清成 0。
    const start = evaluate(d, { CLR: 0 }, undefined).seq;
    const up = evaluate(d, { CLR: 0, clk: 1 }, start).seq;
    const after = evaluate(d, { CLR: 0, clk: 0 }, up).seq;
    expect(bits(d, after, ['QA'], { CLR: 0 })).toBe('1');
    const cleared = evaluate(d, { CLR: 1 }, after).seq;
    expect(bits(d, cleared, ['QA'], { CLR: 1 })).toBe('0');
  });
});

describe('the sequence table', () => {
  it('lists the outputs after each clock pulse from reset', async () => {
    const outs = ['QD', 'QC', 'QB', 'QA'];
    const nodes = [clock(), block('u', '74LS93'), ...outs.map(output)];
    const wires = [w('clk', 'u', await pinOf('74LS93', 'CKA')), w('u', 'u', await pinOf('74LS93', 'CKB'), await outOf('74LS93', 'QA'))];
    for (const o of outs) wires.push(w('u', o, 0, await outOf('74LS93', o)));
    const t = sequenceTable(diagram(nodes, wires), 4);
    if (!t.ok) throw new Error(t.reason);
    expect(t.outputs).toEqual(['QA', 'QB', 'QC', 'QD']);
    expect(t.rows.map((r) => r.out.join(''))).toEqual(['0000', '1000', '0100', '1100', '0010']);
    expect(t.rows.map((r) => r.pulse)).toEqual([0, 1, 2, 3, 4]);
  });

  it('asks for a clock when there is none', () => {
    expect(sequenceTable(diagram([block('u', '74LS74'), output('Q')], []), 4)).toMatchObject({ ok: false, reason: 'no-clock' });
  });
});

describe('clock nodes in files and edits', () => {
  it('reads a clock from a file, keeps it at 0, and allows only one', async () => {
    const { parseLogicDiagram } = await import('../../src/logic/file');
    const r = parseLogicDiagram({ version: 1, nodes: [{ id: 'c1', kind: 'CLOCK', x: 0, y: 0, name: 'CLK', value: 1 }], wires: [] });
    if (!r.ok) throw new Error('parse failed');
    expect(r.diagram.nodes[0]).toEqual({ id: 'c1', kind: 'CLOCK', x: 0, y: 0, name: 'CLK', value: 0 });
    const two = parseLogicDiagram({ version: 1, nodes: [{ id: 'c1', kind: 'CLOCK', x: 0, y: 0, name: 'CLK' }, { id: 'c2', kind: 'CLOCK', x: 0, y: 4, name: 'CLK2' }], wires: [] });
    expect(two).toMatchObject({ ok: false, error: '一張圖只能有一個時脈' });
    const { addNode } = await import('../../src/logic/edit');
    const one = addNode({ version: 1, nodes: [], wires: [] }, 'CLOCK', 0, 0);
    if (!one.ok) throw new Error(one.reason);
    expect(one.diagram.nodes[0]).toMatchObject({ kind: 'CLOCK', name: 'CLK', value: 0 });
    expect(addNode(one.diagram, 'CLOCK', 0, 4)).toMatchObject({ ok: false, reason: '一張圖只能有一個時脈' });
  });

  it('does not compare a sequential circuit with a truth-table task, and formulas say why', async () => {
    const { compareDiagramToTask, createTask, taskFromDiagram } = await import('../../src/logic/task');
    const { diagramFormulas } = await import('../../src/logic/formula');
    const d = diagram([clock(), block('u', '74LS74'), output('Q')], [w('clk', 'u', await pinOf('74LS74', '1CLK')), w('u', 'Q', 0, await outOf('74LS74', '1Q'))]);
    const made = createTask(['A'], ['Q']);
    if (!made.ok) throw new Error(made.reason);
    expect(compareDiagramToTask(d, made.task)).toMatchObject({ kind: 'issues', issues: [expect.stringContaining('時序電路')] });
    expect(taskFromDiagram(d)).toMatchObject({ ok: false, reason: expect.stringContaining('時序電路') });
    expect(diagramFormulas(d).outputs[0]).toMatchObject({ read: null, simplified: null, simplifiedProblem: '時序電路不化簡（看時序表）' });
  });
});
