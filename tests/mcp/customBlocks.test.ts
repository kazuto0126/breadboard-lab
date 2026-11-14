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

describe('MCP buses (sub-project 66)', () => {
  it('logic_set takes merge, split and multi-bit block pins without positions', () => {
    // 2 位元 XOR 方塊（A0、A1、B0、B1 → S0、S1），主圖用合起來 / 拆開接。
    const xor2 = {
      id: 'x2',
      name: 'XOR2',
      nodes: [
        { id: 'a0', kind: 'INPUT', name: 'A0' },
        { id: 'a1', kind: 'INPUT', name: 'A1' },
        { id: 'b0', kind: 'INPUT', name: 'B0' },
        { id: 'b1', kind: 'INPUT', name: 'B1' },
        { id: 'g0', kind: 'XOR', inputs: 2 },
        { id: 'g1', kind: 'XOR', inputs: 2 },
        { id: 's0', kind: 'OUTPUT', name: 'S0' },
        { id: 's1', kind: 'OUTPUT', name: 'S1' },
      ],
      wires: [
        { id: 'w1', from: 'a0', to: { node: 'g0', pin: 0 } },
        { id: 'w2', from: 'b0', to: { node: 'g0', pin: 1 } },
        { id: 'w3', from: 'a1', to: { node: 'g1', pin: 0 } },
        { id: 'w4', from: 'b1', to: { node: 'g1', pin: 1 } },
        { id: 'w5', from: 'g0', to: { node: 's0', pin: 0 } },
        { id: 'w6', from: 'g1', to: { node: 's1', pin: 0 } },
      ],
    };
    const diagram = {
      blocks: [xor2],
      nodes: [
        { id: 'p', kind: 'INPUT', name: 'P' },
        { id: 'q', kind: 'INPUT', name: 'Q' },
        { id: 'r', kind: 'INPUT', name: 'R' },
        { id: 't', kind: 'INPUT', name: 'T' },
        { id: 'ma', kind: 'MERGE', width: 2 },
        { id: 'mb', kind: 'MERGE', width: 2 },
        { id: 'blk', kind: 'CUSTOM', block: 'x2' },
        { id: 'sp', kind: 'SPLIT', width: 2 },
        { id: 'u', kind: 'OUTPUT', name: 'U' },
        { id: 'v', kind: 'OUTPUT', name: 'V' },
      ],
      wires: [
        { id: 'w1', from: 'p', to: { node: 'ma', pin: 0 } },
        { id: 'w2', from: 'q', to: { node: 'ma', pin: 1 } },
        { id: 'w3', from: 'r', to: { node: 'mb', pin: 0 } },
        { id: 'w4', from: 't', to: { node: 'mb', pin: 1 } },
        { id: 'w5', from: 'ma', to: { node: 'blk', pin: 0 } },
        { id: 'w6', from: 'mb', to: { node: 'blk', pin: 1 } },
        { id: 'w7', from: 'blk', to: { node: 'sp', pin: 0 } },
        { id: 'w8', from: 'sp', to: { node: 'u', pin: 0 } },
        { id: 'w9', from: 'sp', fromPin: 1, to: { node: 'v', pin: 0 } },
      ],
    };
    const r = logicSet(newLabFile('x', 'MB102'), { diagram });
    const f = okFile(r);
    expect(r.text).toContain('- XOR2（id x2）：輸入 A[1:0]、B[1:0] → 輸出 S[1:0]');
    // U = P ⊕ R，V = Q ⊕ T。
    const t = logicTruthTable(f).text;
    expect(t).toContain('P Q R T | U V');
    expect(t).toContain('1 0 0 1 | 1 1');
    expect(t).toContain('1 1 1 1 | 0 0');
    // busPins: false：一個一個的腳，匯流排接不上。
    const off = logicSet(newLabFile('x', 'MB102'), { diagram: { ...diagram, blocks: [{ ...xor2, busPins: false }] } });
    expect(off).toMatchObject({ error: true });
  });
});
