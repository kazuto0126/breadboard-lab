import { describe, expect, it } from 'vitest';
import { parseExpressions, taskFromExpressions } from '../../src/logic/expression';
import type { TruthTask } from '../../src/logic/task';

/** 子專案 35（規格 2026-10-19 boolean-expressions）：用布林式建立題目。 */
const task = (text: string): TruthTask => {
  const r = taskFromExpressions(text);
  if (!r.ok) throw new Error(r.reason);
  return r.task;
};
/** 第 k 個輸出是 1 的列。 */
const ones = (text: string, k = 0) => task(text).rows.flatMap((r, i) => (r[k] === 1 ? [i] : []));
const reason = (text: string) => {
  const r = taskFromExpressions(text);
  return r.ok ? null : r.reason;
};

describe('reading boolean expressions', () => {
  it('reads the textbook form', () => {
    const t = task("X = AB + A'C");
    expect(t.inputs).toEqual(['A', 'B', 'C']);
    expect(t.outputs).toEqual(['X']);
    expect(ones("X = AB + A'C")).toEqual([1, 3, 6, 7]);
  });

  it('accepts the other ways of writing AND, NOT, OR and XOR', () => {
    for (const and of ['AB', 'A*B', 'A·B', 'A⋅B', 'A&B', 'A∧B', 'A B']) expect(ones(`X = ${and}`), and).toEqual([3]);
    for (const not of ["A'", 'A’', '!A', '~A', '¬A']) expect(ones(`X = ${not}`), not).toEqual([0]);
    for (const or of ['A + B', 'A|B', 'A∨B']) expect(ones(`X = ${or}`), or).toEqual([1, 2, 3]);
    for (const xor of ['A ⊕ B', 'A ^ B']) expect(ones(`X = ${xor}`), xor).toEqual([1, 2]);
  });

  it('handles parentheses, constants and precedence', () => {
    expect(ones("X = (A + B)'")).toEqual([0]);
    expect(ones('X = A + BC')).toEqual([3, 4, 5, 6, 7]);
    expect(ones('X = (A + B)C')).toEqual([3, 5, 7]);
    expect(ones('X = A ⊕ BC')).toEqual([3, 4, 5, 6]);
    expect(ones('X = A + B ⊕ C')).toEqual([1, 2, 4, 5, 6, 7]);
    expect(ones('X = A1 + 0')).toEqual([1]);
    expect(ones('X = A + 1')).toEqual([0, 1]);
    expect(ones("X = A''")).toEqual([1]);
  });

  it('reads several lines, names outputs that have no name, and sorts the inputs', () => {
    const t = task("X = AB\n\nY = A + B\n");
    expect(t.outputs).toEqual(['X', 'Y']);
    expect(ones('X = AB\nY = A + B', 1)).toEqual([1, 2, 3]);
    expect(task('AB').outputs).toEqual(['F']);
    expect(task('AB\nA + B').outputs).toEqual(['F1', 'F2']);
    expect(task('X = A1B').inputs).toEqual(['A1', 'B']);
    expect(task('X = B + A10 + A2').inputs).toEqual(['A2', 'A10', 'B']);
    expect(parseExpressions("X = AB + A'C")).toMatchObject({ ok: true, inputs: ['A', 'B', 'C'], outputs: [{ name: 'X' }] });
  });

  it('accepts text copied from documents (full-width spaces and equals sign)', () => {
    expect(ones('X　＝　A　B')).toEqual([3]);
  });

  it('explains what is wrong and where', () => {
    expect(reason('X = (A + B')).toBe('第 1 行第 5 個字：括號沒有關起來');
    expect(reason('X = A +')).toBe('第 1 行：+ 後面少了東西');
    expect(reason('X = A $ B')).toBe('第 1 行第 7 個字：看不懂「$」');
    expect(reason('= A')).toBe('第 1 行：要寫成「輸出名稱 = 式子」');
    expect(reason('X = ')).toBe('第 1 行：= 後面少了式子');
    expect(reason('X = A)')).toBe('第 1 行第 6 個字：多了一個「)」');
    expect(reason('  \n ')).toBe("先輸入布林式，例如 X = AB + A'C");
    expect(reason('X = X + A')).toBe('名稱 X 同時是輸入和輸出');
    expect(reason('X = A + B + C + D + E + G + H')).toBe('輸入最多 6 個（64 列）');
    expect(reason('X = 1')).toBe('至少要有一個輸入');
    expect(reason('X = A\nX = B')).toBe('名稱 X 重複');
  });
});
