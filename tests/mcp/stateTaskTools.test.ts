import { describe, expect, it } from 'vitest';
import { stateTaskSet, stateTaskToDiagram } from '../../src/mcp/stateTaskTools';
import { newLabFile, type LabFile, type ToolResult } from '../../src/mcp/tools';

/** 子專案 52（規格 2026-10-25 state-table-task 第 6 節）：狀態表題目的 MCP 工具。 */
function okFile(r: ToolResult): LabFile {
  if (r.error || !r.file) throw new Error(`tool failed: ${r.text}`);
  return r.file;
}

const counter = { states: 4, flip_flop: 'D' as const, rows: [1, 2, 3, 0].map((next) => ({ next })) };

describe('state_task_set', () => {
  it('writes the task and answers with the table and the equations', () => {
    const r = stateTaskSet(newLabFile('x', 'MB102'), counter);
    const f = okFile(r);
    expect(f.logic.stateTask).toMatchObject({ states: 4, inputs: [], outputs: [], flipFlop: 'D' });
    expect(r.text).toContain('4 個狀態（2 顆 D 型正反器');
    expect(r.text).toContain('S1(01) | S2');
    expect(r.text).toContain("D1 = Q1'Q0 + Q1Q0'");
    expect(r.text).toContain("D0 = Q0'");
  });

  it('checks rows and names, and clears the task', () => {
    expect(stateTaskSet(newLabFile('x', 'MB102'), { ...counter, rows: counter.rows.slice(1) })).toMatchObject({ error: true, text: expect.stringContaining('4 列') });
    expect(stateTaskSet(newLabFile('x', 'MB102'), { ...counter, outputs: ['Q1'] })).toMatchObject({ error: true, text: expect.stringContaining('Q1') });
    const f = okFile(stateTaskSet(newLabFile('x', 'MB102'), counter));
    const cleared = okFile(stateTaskSet(f, { clear: true }));
    expect(cleared.logic.stateTask).toBeUndefined();
  });
});

describe('state_task_to_diagram', () => {
  it('builds the circuit and shows the sequence from S0', () => {
    const f = okFile(stateTaskSet(newLabFile('x', 'MB102'), { ...counter, flip_flop: 'JK' }));
    const r = stateTaskToDiagram(f);
    const g = okFile(r);
    expect(g.logic.nodes.filter((n) => n.chip === 'JKFF')).toHaveLength(2);
    expect(g.logic.stateTask).toEqual(f.logic.stateTask);
    expect(r.text).toContain('J1 = Q0');
    expect(r.text).toContain('0 | S0 (Q1 Q0 = 0 0)');
    expect(r.text).toContain('3 | S3 (Q1 Q0 = 1 1)');
    expect(r.text).toContain('4 | S0 (Q1 Q0 = 0 0)');
  });

  it('needs a task first', () => {
    expect(stateTaskToDiagram(newLabFile('x', 'MB102'))).toMatchObject({ error: true, text: expect.stringContaining('state_task_set') });
  });
});

describe('state_task_check (sub-project 53)', () => {
  it('compares the diagram with the state table', async () => {
    const { stateTaskCheck } = await import('../../src/mcp/stateTaskTools');
    const f = okFile(stateTaskSet(newLabFile('x', 'MB102'), counter));
    expect(stateTaskCheck(f).text).toContain('還沒有邏輯圖');
    const g = okFile(stateTaskToDiagram(f));
    expect(stateTaskToDiagram(f).text).toContain('和狀態表比對：從 S0 開始比對了 4 列，邏輯圖和狀態表全部一致');
    expect(stateTaskCheck(g).text).toContain('全部一致');
    // 把 Q0 的輸出端改名：說明要有 Q0。
    const renamed = { ...g, logic: { ...g.logic, nodes: g.logic.nodes.map((n) => (n.name === 'Q0' ? { ...n, name: 'A' } : n)) } };
    expect(stateTaskCheck(renamed).text).toContain('要有輸出端 Q0');
    expect(stateTaskCheck(newLabFile('x', 'MB102'))).toMatchObject({ error: true });
  });
});
