import { describe, expect, it } from 'vitest';
import { designFromTask, type DesignForm } from '../../src/logic/design';
import { truthTable } from '../../src/logic/evaluate';
import { majorityDiagram } from '../../src/logic/examples';
import { taskFromExpressions } from '../../src/logic/expression';
import { diagramFormulas } from '../../src/logic/formula';
import type { LogicDiagram, LogicNode, LogicWire, NodeKind } from '../../src/logic/types';

/** 子專案 40（規格 2026-10-23 diagram-formulas）：自己畫的邏輯圖每個輸出的布林式。 */
const input = (id: string, name = id): LogicNode => ({ id, kind: 'INPUT', x: 0, y: 0, name });
const output = (id: string, name = id): LogicNode => ({ id, kind: 'OUTPUT', x: 0, y: 0, name });
const gate = (id: string, kind: NodeKind, inputs?: number): LogicNode => ({ id, kind, x: 0, y: 0, ...(inputs ? { inputs } : {}) });
let wid = 0;
const w = (from: string, node: string, pin = 0, fromPin?: number): LogicWire => ({ id: `w${++wid}`, from, ...(fromPin ? { fromPin } : {}), to: { node, pin } });
const diagram = (nodes: LogicNode[], wires: LogicWire[]): LogicDiagram => ({ version: 1, nodes, wires });

/** 只有一個輸出時它的式子。 */
const only = (d: LogicDiagram) => {
  const f = diagramFormulas(d).outputs;
  expect(f).toHaveLength(1);
  return f[0];
};
/** A、B 接一個兩輸入閘到 X。 */
const twoInput = (kind: NodeKind) => diagram([input('A'), input('B'), gate('g', kind, kind === 'NOT' ? undefined : 2), output('X')], [w('A', 'g', 0), w('B', 'g', 1), w('g', 'X')]);

/** 照圖寫出來的式子貼回「輸入布林式」，真值表要和邏輯圖一樣。 */
function expectSameTable(d: LogicDiagram) {
  const t = truthTable(d);
  if (!t.ok) throw new Error(t.reason);
  const f = diagramFormulas(d).outputs;
  const text = f.map((o) => `${o.name} = ${o.read}`).join('\n');
  const r = taskFromExpressions(text);
  if (!r.ok) throw new Error(`${text}\n${r.reason}`);
  // 式子裡沒用到的輸入不會出現在題目裡：依名稱逐列對照。
  for (const [i, row] of t.rows.entries()) {
    const env = Object.fromEntries(t.inputs.map((n, k) => [n, row.in[k]]));
    const at = r.task.rows.findIndex((_, j) => r.task.inputs.every((n, k) => ((j >> (r.task.inputs.length - 1 - k)) & 1) === env[n]));
    expect(r.task.rows[at], `${text}\n第 ${i} 列`).toEqual(row.out);
  }
}

describe('reading the formula off the drawing', () => {
  it('writes each gate the textbook way', () => {
    expect(only(twoInput('AND')).read).toBe('AB');
    expect(only(twoInput('OR')).read).toBe('A + B');
    expect(only(twoInput('NAND')).read).toBe("(AB)'");
    expect(only(twoInput('NOR')).read).toBe("(A + B)'");
    expect(only(twoInput('XOR')).read).toBe('A ⊕ B');
    expect(only(diagram([input('A'), gate('n', 'NOT'), output('X')], [w('A', 'n'), w('n', 'X')])).read).toBe("A'");
  });

  it('adds parentheses only where they are needed', () => {
    // X = (A + B)C、Y = A ⊕ (B + C)、Z = (A ⊕ B)C、W = (A')'
    const d = diagram(
      [input('A'), input('B'), input('C'), gate('or', 'OR', 2), gate('and', 'AND', 2), gate('or2', 'OR', 2), gate('xor', 'XOR', 2), gate('xor2', 'XOR', 2), gate('and2', 'AND', 2), gate('n1', 'NOT'), gate('n2', 'NOT'), output('X'), output('Y'), output('Z'), output('W')],
      [
        w('A', 'or', 0), w('B', 'or', 1), w('or', 'and', 0), w('C', 'and', 1), w('and', 'X'),
        w('B', 'or2', 0), w('C', 'or2', 1), w('A', 'xor', 0), w('or2', 'xor', 1), w('xor', 'Y'),
        w('A', 'xor2', 0), w('B', 'xor2', 1), w('xor2', 'and2', 0), w('C', 'and2', 1), w('and2', 'Z'),
        w('A', 'n1'), w('n1', 'n2'), w('n2', 'W'),
      ],
    );
    expect(diagramFormulas(d).outputs.map((o) => `${o.name} = ${o.read}`)).toEqual(["W = A''", 'X = (A + B)C', 'Y = A ⊕ (B + C)', 'Z = (A ⊕ B)C']);
    expectSameTable(d);
  });

  it('writes NAND of NANDs and the majority example', () => {
    const d = diagram(
      [input('A'), input('B'), input('C'), gate('g1', 'NAND', 2), gate('g2', 'NAND', 2), output('X')],
      [w('A', 'g1', 0), w('B', 'g1', 1), w('g1', 'g2', 0), w('C', 'g2', 1), w('g2', 'X')],
    );
    expect(only(d).read).toBe("((AB)'C)'");
    expectSameTable(d);
    expect(only(majorityDiagram()).read).toBe('AB + AC + BC');
  });

  it('uses constants and repeats a shared gate', () => {
    const d = diagram(
      [input('A'), { id: 'h', kind: 'HIGH', x: 0, y: 0 }, gate('g', 'AND', 2), gate('o', 'OR', 2), output('X')],
      [w('A', 'g', 0), w('h', 'g', 1), w('g', 'o', 0), w('g', 'o', 1), w('o', 'X')],
    );
    expect(only(d).read).toBe('A·1 + A·1');
    expectSameTable(d);
  });

  it('separates AND with a dot when a name is not a letter and digits', () => {
    const d = diagram([input('a', 'Cin'), input('b', 'B'), gate('g', 'AND', 2), output('x', 'Cout')], [w('a', 'g', 0), w('b', 'g', 1), w('g', 'x')]);
    expect(only(d).read).toBe('Cin·B');
    expect(only(d).simplified).toBe('B·Cin');
    // Cin 不是「一個字母加數字」，貼回「輸入布林式」會被讀成 C、i、n，所以不做往返比對。
  });

  it('marks a missing wire with ? and cannot simplify', () => {
    const d = diagram([input('A'), gate('g', 'AND', 2), output('X')], [w('A', 'g', 0), w('g', 'X')]);
    const f = only(d);
    expect(f.read).toBe('A?');
    expect(f.simplified).toBeNull();
    expect(f.simplifiedProblem).toMatch('沒接');
    const open = only(diagram([input('A'), output('X')], []));
    expect(open.read).toBe('?');
  });

  it('cannot read through an IC block but still simplifies', () => {
    const d = diagram(
      [input('A'), input('B'), { id: 'u', kind: 'BLOCK', chip: '74LS85', x: 0, y: 0 }, output('X')],
      [w('A', 'u', 0), w('B', 'u', 4), { id: 'wx', from: 'u', fromPin: 2, to: { node: 'X', pin: 0 } }],
    );
    const f = only(d);
    expect(f.read).toBeNull();
    expect(f.readProblem).toMatch('IC 方塊');
  });

  it('stops when the formula gets too long', () => {
    // 每一層都把上一層接兩次：照圖寫會變成 2^30 個字母。
    const nodes: LogicNode[] = [input('A')];
    const wires: LogicWire[] = [];
    let prev = 'A';
    for (let i = 0; i < 30; i++) {
      nodes.push(gate(`g${i}`, 'AND', 2));
      wires.push(w(prev, `g${i}`, 0), w(prev, `g${i}`, 1));
      prev = `g${i}`;
    }
    nodes.push(output('X'));
    wires.push(w(prev, 'X'));
    const f = only(diagram(nodes, wires));
    expect(f.read).toBeNull();
    expect(f.readProblem).toMatch('太長');
    expect(f.simplified).toBe('A');
  });

  it('gives up on a loop', () => {
    const d = diagram([input('A'), gate('g', 'OR', 2), output('X')], [w('A', 'g', 0), w('g', 'g', 1), w('g', 'X')]);
    const f = only(d);
    expect(f.read).toBeNull();
    expect(f.simplified).toBeNull();
    expect(f.readProblem).toMatch('迴圈');
  });

  it('reads but does not simplify more than 8 inputs', () => {
    const names = 'ABCDEFGHI'.split('');
    const nodes = [...names.map((n) => input(n)), gate('g', 'AND', 4), output('X')];
    const d = diagram(nodes, [w('A', 'g', 0), w('B', 'g', 1), w('C', 'g', 2), w('I', 'g', 3), w('g', 'X')]);
    const f = only(d);
    expect(f.read).toBe('ABCI');
    expect(f.simplified).toBeNull();
    expect(f.simplifiedProblem).toMatch('8');
  });

  it('lists outputs by name and says when there are displays', () => {
    const d = diagram([input('A'), output('y', 'Y'), output('x', 'X'), { id: 'd', kind: 'DISPLAY', x: 0, y: 0, name: 'D1' }], [w('A', 'y'), w('A', 'x')]);
    const r = diagramFormulas(d);
    expect(r.outputs.map((o) => o.name)).toEqual(['X', 'Y']);
    expect(r.displays).toBe(true);
    expect(diagramFormulas(twoInput('AND')).displays).toBe(false);
  });
});

describe('the simplified formula', () => {
  it('matches the truth table', () => {
    expect(only(twoInput('NAND')).simplified).toBe("A' + B'");
    expect(only(majorityDiagram()).simplified).toBe('AB + AC + BC');
    expect(only(twoInput('XOR')).simplified).toBe("A'B + AB'");
  });

  it('writes constants', () => {
    const d = diagram([input('A'), gate('n', 'NOT'), gate('o', 'OR', 2), output('X')], [w('A', 'n'), w('A', 'o', 0), w('n', 'o', 1), w('o', 'X')]);
    expect(only(d).simplified).toBe('1');
  });
});

describe('round trip through generated diagrams', () => {
  const forms: DesignForm[] = ['sop', 'pos', 'nand', 'nor'];
  for (const text of ["X = AB + A'C\nY = A ⊕ B ⊕ C", "F = (A + B')(C + D)\nG = A'B'C'D + ABCD"]) {
    for (const form of forms) {
      it(`${form}: ${text.split('\n')[0]}`, () => {
        const t = taskFromExpressions(text);
        if (!t.ok) throw new Error(t.reason);
        expectSameTable(designFromTask(t.task, form).diagram);
      });
    }
  }
});
