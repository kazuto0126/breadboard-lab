import { describe, expect, it } from 'vitest';
import { toCircuitFile, emptyCircuit, parseCircuitText } from '../../src/editor/fileFormat';
import { parseLogicDiagram } from '../../src/logic/file';
import { createTask, cycleCell, parseNames, parseRowList, renameTask, rowsWith, setColumn, type TruthTask } from '../../src/logic/task';
import { emptyDiagram } from '../../src/logic/types';

const must = <T>(r: { ok: true; task: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.task;
};

describe('task names', () => {
  it('splits names on spaces and commas', () => {
    expect(parseNames(' A, B  C ')).toEqual({ ok: true, names: ['A', 'B', 'C'] });
    expect(parseNames('A 1B')).toEqual({ ok: false, reason: '名稱 1B 不合法（英文字母開頭，只能有英數與底線，最多 8 個字）' });
    expect(parseNames('A A')).toEqual({ ok: false, reason: '名稱 A 重複' });
    expect(parseNames('  ')).toEqual({ ok: false, reason: '至少要有一個名稱' });
  });

  it('creates a task with every output 0 and checks the sizes', () => {
    const t = must(createTask(['A', 'B'], ['X']));
    expect(t).toEqual({ inputs: ['A', 'B'], outputs: ['X'], rows: [[0], [0], [0], [0]] });
    expect(createTask(['A', 'B', 'C', 'D', 'E', 'F', 'G'], ['X'])).toEqual({ ok: false, reason: '輸入最多 6 個（64 列）' });
    expect(createTask(['A'], ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9'])).toEqual({ ok: false, reason: '輸出最多 8 個' });
    expect(createTask(['A'], ['A'])).toEqual({ ok: false, reason: '名稱 A 同時是輸入和輸出' });
    expect(createTask([], ['X'])).toEqual({ ok: false, reason: '至少要有一個輸入' });
  });
});

describe('editing a task', () => {
  const and = (): TruthTask => must(createTask(['A', 'B'], ['X', 'Y']));

  it('cycles a cell 0 → 1 → X → 0', () => {
    let t = cycleCell(and(), 3, 0);
    expect(t.rows[3]).toEqual([1, 0]);
    t = cycleCell(t, 3, 0);
    expect(t.rows[3]).toEqual(['X', 0]);
    t = cycleCell(t, 3, 0);
    expect(t.rows[3]).toEqual([0, 0]);
  });

  it('reads and writes a column as row numbers', () => {
    expect(parseRowList('1, 2 3', 4)).toEqual({ ok: true, rows: [1, 2, 3] });
    expect(parseRowList('', 4)).toEqual({ ok: true, rows: [] });
    expect(parseRowList('4', 4)).toEqual({ ok: false, reason: '列號 4 超出範圍（0–3）' });
    expect(parseRowList('1, x', 4)).toEqual({ ok: false, reason: 'x 不是列號' });
    expect(parseRowList('1 1', 4)).toEqual({ ok: false, reason: '列號 1 重複' });
    const t = must(setColumn(and(), 1, [1, 2], [3]));
    expect(t.rows.map((r) => r[1])).toEqual([0, 1, 1, 'X']);
    expect(rowsWith(t, 1, 1)).toEqual([1, 2]);
    expect(rowsWith(t, 1, 'X')).toEqual([3]);
    expect(setColumn(and(), 1, [1, 2], [2])).toEqual({ ok: false, reason: '第 2 列不能同時是 1 和不在乎' });
  });

  it('keeps the values when only names change, and starts over when the number of inputs changes', () => {
    const t = must(setColumn(and(), 0, [3], []));
    const renamed = must(renameTask(t, ['P', 'Q'], ['Y', 'Z']));
    // 輸出依名稱保留：Y 保留原本的值（全 0），Z 是新的。
    expect(renamed).toEqual({ inputs: ['P', 'Q'], outputs: ['Y', 'Z'], rows: [[0, 0], [0, 0], [0, 0], [0, 0]] });
    const sameOutputs = must(renameTask(t, ['P', 'Q'], ['X', 'Y']));
    expect(sameOutputs.rows[3]).toEqual([1, 0]);
    const more = must(renameTask(t, ['A', 'B', 'C'], ['X']));
    expect(more.rows).toHaveLength(8);
    expect(more.rows.every((r) => r.length === 1 && r[0] === 0)).toBe(true);
    expect(renameTask(t, ['A'], ['A'])).toEqual({ ok: false, reason: '名稱 A 同時是輸入和輸出' });
  });
});

describe('saving a task with the logic diagram', () => {
  const task = (): TruthTask => must(setColumn(must(createTask(['A', 'B'], ['X'])), 0, [3], [0]));

  it('round-trips through the file format, even without any nodes', () => {
    const d = { ...emptyDiagram(), task: task() };
    const file = toCircuitFile(emptyCircuit(), 'x', new Date(0), undefined, d);
    expect(file.logic).toEqual(d);
    const back = parseCircuitText(JSON.stringify(file));
    expect(back.ok && back.logic).toEqual(d);
  });

  it('rejects a broken task with a reason', () => {
    const bad = (t: unknown) => parseLogicDiagram({ version: 1, nodes: [], wires: [], task: t });
    expect(bad({ inputs: ['A'], outputs: ['X'], rows: [[0]] })).toEqual({ ok: false, error: '題目的列數要是 2 列（有 1 列）' });
    expect(bad({ inputs: ['A'], outputs: ['X'], rows: [[0], [2]] })).toEqual({ ok: false, error: '題目第 1 列的值只能是 0、1 或 X' });
    expect(bad({ inputs: ['A'], outputs: ['X'], rows: [[0], [0, 1]] })).toEqual({ ok: false, error: '題目第 1 列的值只能是 0、1 或 X' });
    expect(bad({ inputs: ['1A'], outputs: ['X'], rows: [[0], [0]] })).toMatchObject({ ok: false, error: expect.stringContaining('題目') });
    expect(bad('A B')).toEqual({ ok: false, error: '題目格式不對' });
  });
});

describe('comparing the logic diagram with the task', () => {
  const majorityTask = () => must(setColumn(must(createTask(['A', 'B', 'C'], ['X'])), 0, [3, 5, 6, 7], []));

  it('matches figure 2-5 row by row, skipping cells marked X', async () => {
    const { compareDiagramToTask } = await import('../../src/logic/task');
    const { majorityDiagram } = await import('../../src/logic/examples');
    expect(compareDiagramToTask(majorityDiagram(), majorityTask())).toEqual({ kind: 'done', rows: 8, mismatches: [], dontCares: false });
    const wrong = cycleCell(majorityTask(), 0, 0); // 第 0 列改成 1
    expect(compareDiagramToTask(majorityDiagram(), wrong)).toEqual({
      kind: 'done',
      rows: 8,
      dontCares: false,
      mismatches: [{ row: 0, inputs: '000', expected: ['1'], actual: ['0'] }],
    });
    // 第 0 列改成 X（不在乎）：不比。
    expect(compareDiagramToTask(majorityDiagram(), cycleCell(wrong, 0, 0))).toMatchObject({ kind: 'done', mismatches: [], dontCares: true });
  });

  it('follows the order of the task inputs (the first one is the highest bit)', async () => {
    const { compareDiagramToTask } = await import('../../src/logic/task');
    const { addNode, connect } = await import('../../src/logic/edit');
    let d = emptyDiagram();
    for (const [kind, x, y] of [['INPUT', 0, 0], ['INPUT', 0, 4], ['OUTPUT', 10, 0]] as const) {
      const r = addNode(d, kind, x, y);
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    const c = connect(d, 'i1', { node: 'o1', pin: 0 }); // X = A（B 沒用到）
    if (!c.ok) throw new Error(c.reason);
    // 題目的輸入順序是 B A：A 是最低位元，X = 1 的列是 1、3。
    const task = must(setColumn(must(createTask(['B', 'A'], ['X'])), 0, [1, 3], []));
    expect(compareDiagramToTask(c.diagram, task)).toMatchObject({ kind: 'done', mismatches: [] });
  });

  it('explains names that do not line up', async () => {
    const { compareDiagramToTask } = await import('../../src/logic/task');
    const { majorityDiagram, bcdDiagram } = await import('../../src/logic/examples');
    expect(compareDiagramToTask(majorityDiagram(), must(createTask(['A', 'B', 'D'], ['X', 'Y'])))).toEqual({
      kind: 'issues',
      issues: ['題目的輸入 D 在邏輯圖找不到輸入端', '邏輯圖的輸入端 C 不在題目裡', '題目的輸出 Y 在邏輯圖找不到輸出端'],
    });
    expect(compareDiagramToTask(bcdDiagram(), must(createTask(['W', 'X', 'Y', 'Z'], ['S1'])))).toEqual({
      kind: 'issues',
      issues: ['S1 在邏輯圖是 7 段顯示器，題目的輸出要接輸出端'],
    });
    expect(compareDiagramToTask(emptyDiagram(), majorityTask())).toEqual({ kind: 'none' });
  });

  it('refuses a diagram with a loop', async () => {
    const { compareDiagramToTask } = await import('../../src/logic/task');
    const { addNode, connect } = await import('../../src/logic/edit');
    let d = emptyDiagram();
    for (const [kind, x, y] of [['INPUT', 0, 0], ['AND', 6, 0], ['AND', 14, 0], ['OUTPUT', 22, 1]] as const) {
      const r = addNode(d, kind, x, y);
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    for (const [from, node, pin] of [['i1', 'g1', 0], ['g1', 'g2', 0], ['g2', 'g1', 1], ['g2', 'o1', 0]] as const) {
      const r = connect(d, from, { node, pin });
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    const task = must(createTask(['A'], ['X']));
    expect(compareDiagramToTask(d, task)).toEqual({ kind: 'issues', issues: ['邏輯圖有迴圈（g1、g2），不能和題目比對'] });
  });
});

describe('making a task from the logic diagram', () => {
  it('copies the truth table of a finished diagram', async () => {
    const { taskFromDiagram } = await import('../../src/logic/task');
    const { majorityDiagram } = await import('../../src/logic/examples');
    const t = must(taskFromDiagram(majorityDiagram()));
    expect(t.inputs).toEqual(['A', 'B', 'C']);
    expect(t.outputs).toEqual(['X']);
    expect(rowsWith(t, 0, 1)).toEqual([3, 5, 6, 7]);
  });

  it('says why it cannot', async () => {
    const { taskFromDiagram } = await import('../../src/logic/task');
    const { majorityDiagram, bcdDiagram } = await import('../../src/logic/examples');
    // 子專案 32：BCD 顯示器可以當題目的輸出；每段直接控制、小數點有接線的不行。
    const segments = { ...bcdDiagram(), nodes: bcdDiagram().nodes.map((n) => (n.kind === 'DISPLAY' ? { ...n, segments: true as const } : n)) };
    expect(taskFromDiagram(segments)).toEqual({ ok: false, reason: '題目的顯示器要用 BCD（S1 是每段直接控制）' });
    const s1 = bcdDiagram().nodes.find((n) => n.kind === 'DISPLAY')!.id;
    const dot = { ...bcdDiagram(), nodes: [...bcdDiagram().nodes, { id: 'kdp', kind: 'HIGH' as const, x: 0, y: 30 }], wires: [...bcdDiagram().wires, { id: 'wdp', from: 'kdp', to: { node: s1, pin: 4 } }] };
    expect(taskFromDiagram(dot)).toEqual({ ok: false, reason: '題目的顯示器不能用小數點（DP 有接線）' });
    const open = { ...majorityDiagram(), wires: majorityDiagram().wires.filter((w) => w.to.node !== 'o1') };
    expect(taskFromDiagram(open)).toEqual({ ok: false, reason: '邏輯圖還有沒接好的地方（有些輸出不確定），先把邏輯圖接好' });
    expect(taskFromDiagram(emptyDiagram())).toEqual({ ok: false, reason: '先在邏輯圖放輸入端和輸出端' });
  });
});

describe('putting the task on the diagram', () => {
  it('adds, replaces and removes the task without leaving an empty field behind', async () => {
    const { withTask } = await import('../../src/logic/task');
    const t = must(createTask(['A'], ['X']));
    const d = withTask(emptyDiagram(), t);
    expect(d.task).toBe(t);
    const gone = withTask(d, undefined);
    expect(gone).toEqual(emptyDiagram());
    expect('task' in gone).toBe(false);
  });
});
