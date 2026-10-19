import { describe, expect, it } from 'vitest';
import { designFromTask } from '../../src/logic/design';
import { majorityDiagram } from '../../src/logic/examples';
import type { TruthTask } from '../../src/logic/task';
import { toBreadboard } from '../../src/logic/toBreadboard';
import { newLabFile, type LabFile, type ToolResult } from '../../src/mcp/tools';
import { taskCheck, taskSet, taskShow, taskToDiagram } from '../../src/mcp/taskTools';

const blank = () => newLabFile('t', 'MB102');
const saved = (r: ToolResult): LabFile => {
  if (r.error || !r.file) throw new Error(r.text);
  return r.file;
};
const majority = () => saved(taskSet(blank(), { inputs: ['A', 'B', 'C'], outputs: [{ name: 'X', ones: [3, 5, 6, 7] }] }));
const task = (f: LabFile): TruthTask => {
  if (!f.logic.task) throw new Error('no task');
  return f.logic.task;
};
const BCD: Array<number | 'X'> = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'X', 'X', 'X', 'X', 'X', 'X'];

describe('task_set (sub-project 33)', () => {
  it('writes the majority task from the rows that are 1', () => {
    const r = taskSet(blank(), { inputs: ['A', 'B', 'C'], outputs: [{ name: 'X', ones: [3, 5, 6, 7] }] });
    expect(r.text).toContain('3 個輸入、1 個輸出、8 列');
    const t = task(saved(r));
    expect(t.rows[3]).toEqual([1]);
    expect(t.rows[0]).toEqual([0]);
  });

  it('writes don’t-care rows and display outputs', () => {
    const t = task(saved(taskSet(blank(), { inputs: ['W', 'X', 'Y', 'Z'], outputs: [{ name: 'F', ones: [1], dont_care: [2] }, { name: 'S1', display: true, values: BCD }] })));
    expect(t.displays).toEqual(['S1']);
    expect(t.rows[1]).toEqual([1, 1]);
    expect(t.rows[2]).toEqual(['X', 2]);
    expect(t.rows[15]).toEqual([0, 'X']);
  });

  it('explains what is wrong and leaves the file alone', () => {
    const bad = (args: Parameters<typeof taskSet>[1]) => {
      const r = taskSet(blank(), args);
      expect(r.error).toBe(true);
      expect(r.file).toBeUndefined();
      return r.text;
    };
    expect(bad({ inputs: ['A'], outputs: [{ name: 'X' }], clear: true })).toBe('inputs / outputs、from_diagram、clear 只能選一種');
    expect(bad({})).toBe('要給 inputs 與 outputs（直接寫題目）、from_diagram: true（用邏輯圖的真值表）或 clear: true（刪除題目）');
    expect(bad({ inputs: ['A', 'B', 'C'], outputs: [{ name: 'X', ones: [8] }] })).toBe('X 的 ones：列號 8 超出範圍（0–7）');
    expect(bad({ inputs: ['A', 'A'], outputs: [{ name: 'X' }] })).toBe('名稱 A 重複');
    expect(bad({ inputs: ['A', 'B', 'C', 'D'], outputs: [{ name: 'S1', display: true, values: [1, 2, 3] }] })).toBe('S1 的 values：要寫 16 個數字（有 3 個）');
    expect(bad({ inputs: ['A'], outputs: [{ name: 'S1', display: true, values: [16, 0] }] })).toBe('S1 的 values：16 不是 0–15 的數字或 X');
    expect(bad({ inputs: ['A'], outputs: [{ name: 'X', values: [0, 1] }] })).toBe('X 是一般輸出，用 ones / dont_care');
    expect(bad({ inputs: ['A'], outputs: [{ name: 'S1', display: true, ones: [1] }] })).toBe('S1 是顯示器，用 values');
  });

  it('makes the task from the diagram in the file', () => {
    const f = { ...blank(), logic: majorityDiagram() };
    const t = task(saved(taskSet(f, { from_diagram: true })));
    expect(t.rows.flatMap((r, i) => (r[0] === 1 ? [i] : []))).toEqual([3, 5, 6, 7]);
    const none = taskSet(blank(), { from_diagram: true });
    expect(none.error).toBe(true);
    expect(none.text).toContain('還沒有邏輯圖');
  });

  it('clears the task and keeps the diagram', () => {
    const f = { ...majority(), logic: { ...majorityDiagram(), task: task(majority()) } };
    const cleared = saved(taskSet(f, { clear: true }));
    expect(cleared.logic.task).toBeUndefined();
    expect(cleared.logic.nodes).toHaveLength(8);
    expect(taskSet(blank(), { clear: true })).toEqual({ text: '檔案裡沒有題目' });
  });
});

describe('task_show', () => {
  it('lists the table and the simplified expression', () => {
    const text = taskShow(majority(), {}).text;
    expect(text).toContain('A B C | X');
    expect(text).toContain('0 1 1 | 1');
    expect(text).toContain('X = AB + AC + BC');
    expect(taskShow(majority(), { form: 'pos' }).text).toContain('X = (A + B)(A + C)(B + C)');
  });

  it('shows display outputs as numbers, one expression per bit', () => {
    const f = saved(taskSet(blank(), { inputs: ['W', 'X', 'Y', 'Z'], outputs: [{ name: 'S1', display: true, values: BCD }] }));
    const text = taskShow(f, {}).text;
    expect(text).toContain('1 0 0 1 | 9');
    expect(text).toContain('S1.A = Z');
  });

  it('says when there is no task', () => {
    expect(taskShow(blank(), {})).toEqual({ text: '檔案裡還沒有題目；用 task_set 寫入', error: true });
  });
});

describe('task_to_diagram', () => {
  it('draws a NAND-only diagram, keeps the task, and checks it', () => {
    const r = taskToDiagram(majority(), { form: 'nand' });
    const f = saved(r);
    expect(new Set(f.logic.nodes.map((n) => n.kind))).toEqual(new Set(['INPUT', 'NAND', 'OUTPUT']));
    expect(f.logic.task).toEqual(task(majority()));
    expect(r.text).toContain('8 種輸入組合，邏輯圖和題目全部一致');
  });

  it('says it replaced the diagram that was there', () => {
    const f = { ...majority(), logic: { ...majorityDiagram(), task: task(majority()) } };
    expect(taskToDiagram(f, {}).text).toContain('取代了原本的邏輯圖（8 個元件）');
  });
});

describe('task_check', () => {
  const drawn = () => saved(taskToDiagram(majority(), {}));

  it('checks the diagram and says the breadboard is empty', () => {
    const text = taskCheck(drawn()).text;
    expect(text).toContain('邏輯圖：8 種輸入組合，邏輯圖和題目全部一致');
    expect(text).toContain('麵包板：還沒有元件');
  });

  it('lists the rows that differ', () => {
    const f = drawn();
    const t = task(f);
    const wrong = { ...f, logic: { ...f.logic, task: { ...t, rows: t.rows.map((r, i) => (i === 0 ? [1] : r)) } } };
    expect(taskCheck(wrong).text).toContain('A B C = 0 0 0：題目 X = 1，邏輯圖 X = 0');
  });

  it('lists at most ten rows', () => {
    const f = saved(taskToDiagram(saved(taskSet(blank(), { inputs: ['A', 'B', 'C', 'D'], outputs: [{ name: 'X' }] })), {}));
    const t = task(f);
    const ones = { ...f, logic: { ...f.logic, task: { ...t, rows: t.rows.map(() => [1]) } } };
    const text = taskCheck(ones).text;
    expect(text).toContain('有 16 列不一致');
    expect(text.match(/：題目 X = 1，邏輯圖 X = 0/g)).toHaveLength(10);
    expect(text).toContain('還有 6 列');
  });

  it('checks the breadboard by name', () => {
    const f = drawn();
    const r = toBreadboard(designFromTask(task(f)).diagram, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(taskCheck({ ...f, circuit: r.circuit }).text).toContain('麵包板：8 種輸入組合，麵包板的模擬結果和題目全部一致');
  });

  it('says when there is no task', () => {
    expect(taskCheck(blank())).toEqual({ text: '檔案裡還沒有題目；用 task_set 寫入', error: true });
  });
});
