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
