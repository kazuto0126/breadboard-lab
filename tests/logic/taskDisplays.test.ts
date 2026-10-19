import { describe, expect, it } from 'vitest';
import { designFromTask } from '../../src/logic/design';
import { checkAgainstTask } from '../../src/logic/diagramCheck';
import { bcdDiagram } from '../../src/logic/examples';
import { parseLogicDiagram } from '../../src/logic/file';
import { sopText } from '../../src/logic/minimize';
import { convertProblem } from '../../src/logic/synth';
import { compareDiagramToTask, createTask, cycleCell, parseDisplayValues, setDisplayColumn, setOutputKind, taskFromDiagram, type TruthTask } from '../../src/logic/task';
import { toBreadboard } from '../../src/logic/toBreadboard';

const must = <T>(r: { ok: true; task: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.task;
};

/** W X Y Z 四個輸入，S1 是顯示器，顯示 W X Y Z 當成的數字（0–9，10–15 不在乎）。 */
function bcdTask(): TruthTask {
  const t = must(setOutputKind(must(createTask(['W', 'X', 'Y', 'Z'], ['S1'])), 0, true));
  return must(setDisplayColumn(t, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'X', 'X', 'X', 'X', 'X', 'X']));
}

describe('task outputs that are 7-segment displays (sub-project 32)', () => {
  it('reads a column of numbers and checks it', () => {
    expect(parseDisplayValues('0 1 2 3', 4)).toEqual({ ok: true, values: [0, 1, 2, 3] });
    expect(parseDisplayValues('0, x, -, 15', 4)).toEqual({ ok: true, values: [0, 'X', 'X', 15] });
    expect(parseDisplayValues('0 1 2', 4)).toEqual({ ok: false, reason: '要寫 4 個數字（有 3 個）' });
    expect(parseDisplayValues('0 1 2 16', 4)).toEqual({ ok: false, reason: '16 不是 0–15 的數字或 X' });
  });

  it('switches an output between LED and display, and cycles display cells 0–15 then X', () => {
    const t = must(setOutputKind(must(createTask(['A'], ['X', 'S1'])), 1, true));
    expect(t.displays).toEqual(['S1']);
    expect(cycleCell(t, 0, 1).rows[0]).toEqual([0, 1]);
    const fifteen = must(setDisplayColumn(t, 1, [15, 0]));
    expect(cycleCell(fifteen, 0, 1).rows[0]).toEqual([0, 'X']);
    // 換回 LED：超過 1 的值變成 0。
    const back = must(setOutputKind(fifteen, 1, false));
    expect(back).not.toHaveProperty('displays');
    expect(back.rows.map((r) => r[1])).toEqual([0, 0]);
  });

  it('round-trips through files and refuses numbers in LED columns', () => {
    const d = { version: 1 as const, nodes: [], wires: [], task: bcdTask() };
    const back = parseLogicDiagram(JSON.parse(JSON.stringify(d)));
    expect(back.ok && back.diagram.task).toEqual(bcdTask());
    const bad = { ...bcdTask(), displays: [] };
    expect(parseLogicDiagram({ ...d, task: bad })).toEqual({ ok: false, error: '題目第 2 列的值只能是 0、1 或 X' });
  });

  it('compares with the BCD display of the diagram, skipping X', () => {
    expect(compareDiagramToTask(bcdDiagram(), bcdTask())).toMatchObject({ kind: 'done', mismatches: [] });
    const wrong = must(setDisplayColumn(bcdTask(), 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 'X', 'X', 'X', 'X', 'X', 'X']));
    expect(compareDiagramToTask(bcdDiagram(), wrong)).toMatchObject({ kind: 'done', mismatches: [{ row: 9, expected: ['8'], actual: ['9'] }] });
  });

  it('makes a task from a diagram with a display', () => {
    const t = must(taskFromDiagram(bcdDiagram()));
    expect(t.displays).toEqual(['S1']);
    expect(t.rows.map((r) => r[0])).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('draws a diagram with a display from the task: four bits simplified on their own', () => {
    const { diagram, columns } = designFromTask(bcdTask());
    expect(columns.map((c) => c.label)).toEqual(['S1.A', 'S1.B', 'S1.C', 'S1.D']);
    // A 位元就是 Z（10–15 不在乎）。
    expect(sopText(columns[0].terms, ['W', 'X', 'Y', 'Z'])).toBe('Z');
    expect(diagram.nodes.filter((n) => n.kind === 'DISPLAY').map((n) => n.name)).toEqual(['S1']);
    expect(compareDiagramToTask(diagram, bcdTask())).toMatchObject({ kind: 'done', mismatches: [] });
    expect(convertProblem(diagram)).toBeNull();
  });

  it('draws every form with a display next to an ordinary output', () => {
    // X 是多數決（W X Y），S1 顯示 WXYZ + 1（9 之後是 0）。
    let t = must(setOutputKind(must(createTask(['W', 'X', 'Y', 'Z'], ['F', 'S1'])), 1, true));
    t = must(setDisplayColumn(t, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 'X', 'X', 'X', 'X', 'X', 'X']));
    t = { ...t, rows: t.rows.map((r, i) => [[3, 5, 6, 7].includes(i >> 1) ? 1 : 0, r[1]]) };
    for (const form of ['sop', 'pos', 'nand', 'nor'] as const) {
      const { diagram, columns } = designFromTask(t, form);
      expect(columns.map((c) => c.label)).toEqual(['F', 'S1.A', 'S1.B', 'S1.C', 'S1.D']);
      const parsed = parseLogicDiagram(JSON.parse(JSON.stringify(diagram)));
      expect(parsed.ok ? null : parsed.error).toBeNull();
      expect(compareDiagramToTask(diagram, t)).toMatchObject({ kind: 'done', mismatches: [] });
      expect(convertProblem(diagram)).toBeNull();
    }
  });

  it('checks a breadboard display against the task by name', () => {
    const r = toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(checkAgainstTask(bcdTask(), r.circuit)).toMatchObject({ kind: 'done', result: { rows: 16, mismatches: [] } });
  });
});
