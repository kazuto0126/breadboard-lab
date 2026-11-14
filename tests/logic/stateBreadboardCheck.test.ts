import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkBreadboardAgainstStateTask } from '../../src/logic/stateBreadboardCheck';
import { mismatchText } from '../../src/logic/stateCheck';
import { designFromStateTask, type StateTask } from '../../src/logic/stateTask';
import type { Circuit } from '../../src/types/circuit';

/** 子專案 62（規格 2026-11-14 breadboard-state-check）：麵包板直接和狀態表比對。 */
const detector: StateTask = {
  states: 2,
  inputs: ['X'],
  outputs: ['Z'],
  flipFlop: 'D',
  rows: [
    { next: 0, out: [0] },
    { next: 1, out: [0] },
    { next: 0, out: [0] },
    { next: 1, out: [1] },
  ],
};
const counter: StateTask = { states: 4, inputs: [], outputs: [], flipFlop: 'JK', rows: [1, 2, 3, 0].map((next) => ({ next, out: [] })) };

function breadboardOf(task: StateTask): Circuit {
  const r = convertAndRoute(designFromStateTask(task).diagram, { switchTo: 'vcc', board: 'auto', pulls: true });
  if (!r.ok) throw new Error(r.reason);
  return applyRouting(r.result.circuit, r.routed);
}

describe('checkBreadboardAgainstStateTask', { timeout: 120_000 }, () => {
  const det = breadboardOf(detector);
  const cnt = breadboardOf(counter);

  it('finds the converted breadboards correct', () => {
    expect(checkBreadboardAgainstStateTask(detector, det)).toMatchObject({ kind: 'done', rows: 4, mismatches: [], unreached: [] });
    const c = checkBreadboardAgainstStateTask(counter, cnt);
    expect(c).toMatchObject({ kind: 'done', rows: 4, mismatches: [], unreached: [] });
    if (c.kind !== 'done') throw new Error();
    expect(c.mapping).toMatch(/Q1 → .*Q0 → /);
  });

  it('lists rows where the breadboard differs from the task', () => {
    // 題目改一格：S1、X = 1 時 Z 應該是 0（麵包板是 1）。
    const changed: StateTask = { ...detector, rows: detector.rows.map((row, i) => (i === 3 ? { ...row, out: [0] } : row)) };
    const r = checkBreadboardAgainstStateTask(changed, det);
    if (r.kind !== 'done') throw new Error(r.kind);
    expect(r.mismatches).toHaveLength(1);
    expect(mismatchText(r.mismatches[0], changed, '麵包板')).toBe('S1、X = 1：題目 → S1、Z = 0；麵包板 → S1、Z = 1');
  });

  it('asks for names first, then lists what is missing', () => {
    const unnamed: Circuit = { ...det, components: det.components.map((c) => ({ ...c, props: { ...c.props, labels: [] } })) };
    expect(checkBreadboardAgainstStateTask(detector, unnamed)).toEqual({ kind: 'hint' });
    const noQ: Circuit = { ...det, components: det.components.map((c) => (c.props.labels?.[0] === 'Q0' ? { ...c, props: { ...c.props, labels: [] } } : c)) };
    const r = checkBreadboardAgainstStateTask(detector, noQ);
    expect(r.kind).toBe('incomplete');
    if (r.kind !== 'incomplete') throw new Error();
    expect(r.issues.join('\n')).toContain('輸出 Q0：找不到名稱是 Q0 的 LED（狀態位元');
    expect(checkBreadboardAgainstStateTask(undefined, det)).toEqual({ kind: 'none' });
  });
});
