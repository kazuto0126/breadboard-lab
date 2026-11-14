import { describe, expect, it } from 'vitest';
import { stateDiagram, stateDiagramText, stateLayout } from '../../src/logic/stateDiagram';
import type { StateTask } from '../../src/logic/stateTask';

/** 子專案 63（規格 2026-11-14 state-diagram）：從狀態表畫狀態圖。 */
const counter: StateTask = { states: 4, inputs: [], outputs: [], flipFlop: 'D', rows: [1, 2, 3, 0].map((next) => ({ next, out: [] })) };
/** 序列偵測器（Mealy）：S1 且 X = 1 時 Z = 1。 */
const mealy: StateTask = {
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
/** Moore：輸出只看狀態。 */
const moore: StateTask = {
  states: 3,
  inputs: ['X'],
  outputs: ['Z'],
  flipFlop: 'D',
  rows: [
    { next: 0, out: [0] },
    { next: 1, out: [0] },
    { next: 0, out: [0] },
    { next: 2, out: [0] },
    { next: 0, out: [1] },
    { next: 'X', out: [1] },
  ],
};

describe('stateDiagram', () => {
  it('draws one arrow per row for a counter, without labels', () => {
    const d = stateDiagram(counter);
    expect(d.moore).toBe(false);
    expect(d.names).toEqual(['S0', 'S1', 'S2', 'S3']);
    expect(d.edges).toEqual([
      { from: 0, to: 1, labels: [] },
      { from: 1, to: 2, labels: [] },
      { from: 2, to: 3, labels: [] },
      { from: 3, to: 0, labels: [] },
    ]);
  });

  it('labels Mealy arrows with input/output and merges arrows between the same states', () => {
    const d = stateDiagram(mealy);
    expect(d.moore).toBe(false);
    expect(d.edges).toEqual([
      { from: 0, to: 0, labels: ['0/0'] },
      { from: 0, to: 1, labels: ['1/0'] },
      { from: 1, to: 0, labels: ['0/0'] },
      { from: 1, to: 1, labels: ['1/1'] },
    ]);
    const merged = stateDiagram({ ...mealy, rows: mealy.rows.map((r) => ({ ...r, next: 0 })) });
    expect(merged.edges[0]).toEqual({ from: 0, to: 0, labels: ['0/0', '1/0'] });
  });

  it('writes Moore outputs inside the circles and skips do not care arrows', () => {
    const d = stateDiagram(moore);
    expect(d.moore).toBe(true);
    expect(d.names).toEqual(['S0/0', 'S1/0', 'S2/1']);
    expect(d.edges.find((e) => e.from === 1 && e.to === 2)).toEqual({ from: 1, to: 2, labels: ['1'] });
    expect(d.dontCare).toEqual([{ from: 2, label: '1' }]);
  });

  it('gives MCP a text version', () => {
    expect(stateDiagramText(mealy)).toEqual(['狀態圖（箭頭上寫 X/Z（Mealy：輸入/輸出））：', '- S0 → S0：0/0', '- S0 → S1：1/0', '- S1 → S0：0/0', '- S1 → S1：1/1']);
    expect(stateDiagramText(moore)).toContain('- S2/1（1） → 任意（不在乎，沒有畫箭頭）');
    expect(stateDiagramText(counter)[1]).toBe('- S0 → S1');
  });

  it('places S0 on top and the rest clockwise', () => {
    const p = stateLayout(4, 300);
    expect(p[0].y).toBeLessThan(p[2].y);
    expect(p[1].x).toBeGreaterThan(p[3].x);
    const two = stateLayout(2, 300);
    expect(two[0].x).toBeLessThan(two[1].x);
  });
});
