import { describe, expect, it } from 'vitest';
import { logicSet, logicTruthTable, logicWrapBlock, newLabFile, type LabFile, type ToolResult } from '../../src/mcp/tools';

/** 子專案 65（規格 2026-11-14 custom-blocks 第 5 節）：MCP 的自訂方塊。 */
function okFile(r: ToolResult): LabFile {
  if (r.error || !r.file) throw new Error(`tool failed: ${r.text}`);
  return r.file;
}

const halfAdder = {
  nodes: [
    { id: 'a', kind: 'INPUT', name: 'A' },
    { id: 'b', kind: 'INPUT', name: 'B' },
    { id: 'x', kind: 'XOR', inputs: 2 },
    { id: 'n', kind: 'AND', inputs: 2 },
    { id: 's', kind: 'OUTPUT', name: 'S' },
    { id: 'c', kind: 'OUTPUT', name: 'C' },
  ],
  wires: [
    { id: 'w1', from: 'a', to: { node: 'x', pin: 0 } },
    { id: 'w2', from: 'b', to: { node: 'x', pin: 1 } },
    { id: 'w3', from: 'a', to: { node: 'n', pin: 0 } },
    { id: 'w4', from: 'b', to: { node: 'n', pin: 1 } },
    { id: 'w5', from: 'x', to: { node: 's', pin: 0 } },
    { id: 'w6', from: 'n', to: { node: 'c', pin: 0 } },
  ],
};

describe('MCP custom blocks', () => {
  it('logic_wrap_block wraps gates and keeps the truth table', () => {
    const f = okFile(logicSet(newLabFile('x', 'MB102'), { diagram: halfAdder }));
    const r = logicWrapBlock(f, { nodes: ['x', 'n'], name: 'HA' });
    const g = okFile(r);
    expect(r.text).toContain('包成方塊 HA');
    expect(r.text).toContain('- HA（id blk1）：輸入 A、B → 輸出 S、C');
    expect(r.text).toContain('真值表和包起來之前一樣。');
    expect(g.logic.nodes.some((n) => n.kind === 'CUSTOM')).toBe(true);
    expect(logicWrapBlock(f, { nodes: ['zz'] })).toMatchObject({ error: true, text: expect.stringContaining('沒有 zz') });
  });

  it('logic_set takes block definitions without positions and uses them twice', () => {
    const blocks = [{ id: 'ha', name: 'HA', nodes: halfAdder.nodes, wires: halfAdder.wires }];
    // 兩個半加器做全加器（A、B、Cin → S、Cout）。
    const diagram = {
      blocks,
      nodes: [
        { id: 'a', kind: 'INPUT', name: 'A' },
        { id: 'b', kind: 'INPUT', name: 'B' },
        { id: 'ci', kind: 'INPUT', name: 'Cin' },
        { id: 'h1', kind: 'CUSTOM', block: 'ha' },
        { id: 'h2', kind: 'CUSTOM', block: 'ha' },
        { id: 'or', kind: 'OR', inputs: 2 },
        { id: 's', kind: 'OUTPUT', name: 'S' },
        { id: 'co', kind: 'OUTPUT', name: 'Cout' },
      ],
      wires: [
        { id: 'w1', from: 'a', to: { node: 'h1', pin: 0 } },
        { id: 'w2', from: 'b', to: { node: 'h1', pin: 1 } },
        { id: 'w3', from: 'h1', to: { node: 'h2', pin: 0 } },
        { id: 'w4', from: 'ci', to: { node: 'h2', pin: 1 } },
        { id: 'w5', from: 'h2', to: { node: 's', pin: 0 } },
        { id: 'w6', from: 'h1', fromPin: 1, to: { node: 'or', pin: 0 } },
        { id: 'w7', from: 'h2', fromPin: 1, to: { node: 'or', pin: 1 } },
        { id: 'w8', from: 'or', to: { node: 'co', pin: 0 } },
      ],
    };
    const r = logicSet(newLabFile('x', 'MB102'), { diagram });
    const f = okFile(r);
    expect(r.text).toContain('自訂方塊 2 個');
    expect(r.text).toContain('主圖用到 h1、h2');
    expect(r.text).toContain('檢查：沒有發現問題。');
    const t = logicTruthTable(f).text;
    expect(t).toContain('A B Cin | Cout S');
    expect(t).toContain('1 1 1 | 1 1');
    expect(logicSet(newLabFile('x', 'MB102'), { diagram: { ...diagram, blocks: [] } })).toMatchObject({ error: true, text: expect.stringContaining('不存在的自訂方塊 ha') });
  });
});
