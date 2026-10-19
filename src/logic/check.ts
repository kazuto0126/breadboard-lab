import { topoOrder } from './evaluate';
import { BLOCK_PINS } from './blocks';
import { inputCountOf } from './shapes';
import { isGate, isSink, type LogicDiagram, type LogicNode } from './types';

export interface LogicIssue {
  code: 'LOGIC_LOOP' | 'LOGIC_INPUT_OPEN' | 'LOGIC_OUTPUT_OPEN' | 'LOGIC_UNUSED' | 'LOGIC_NO_IO';
  severity: 'error' | 'warning';
  message: string;
  nodeIds: string[];
}

export function nodeLabel(node: LogicNode): string {
  if (node.kind === 'INPUT') return `輸入 ${node.name}`;
  if (node.kind === 'OUTPUT') return `輸出 ${node.name}`;
  if (node.kind === 'DISPLAY') return `顯示器 ${node.name}`;
  if (node.kind === 'HIGH') return `5V ${node.id}`;
  if (node.kind === 'LOW') return `GND ${node.id}`;
  if (node.kind === 'BLOCK') return `方塊 ${node.id}（${node.chip}）`;
  return `${node.id}（${node.kind}）`;
}

/** 規格第 4 節。順序：迴圈、缺輸入 / 輸出端、每個節點（依圖上的順序）的開路與沒用到。 */
export function checkDiagram(d: LogicDiagram): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const loop = topoOrder(d).loop;
  if (loop) issues.push({ code: 'LOGIC_LOOP', severity: 'error', message: `${loop.join('、')} 形成迴圈：邏輯圖只能畫組合邏輯（輸出不能再接回前面）`, nodeIds: loop });
  if (d.nodes.some((n) => isGate(n.kind))) {
    if (!d.nodes.some((n) => n.kind === 'INPUT')) issues.push({ code: 'LOGIC_NO_IO', severity: 'warning', message: '邏輯圖還沒有輸入端', nodeIds: [] });
    if (!d.nodes.some((n) => isSink(n.kind))) issues.push({ code: 'LOGIC_NO_IO', severity: 'warning', message: '邏輯圖還沒有輸出端', nodeIds: [] });
  }
  const driven = new Set(d.wires.map((w) => `${w.to.node}#${w.to.pin}`));
  const used = new Set(d.wires.map((w) => w.from));
  for (const node of d.nodes) {
    if (node.kind === 'OUTPUT') {
      if (!driven.has(`${node.id}#0`)) issues.push({ code: 'LOGIC_OUTPUT_OPEN', severity: 'warning', message: `輸出 ${node.name} 沒有接到任何閘`, nodeIds: [node.id] });
      continue;
    }
    if (node.kind === 'DISPLAY') {
      // 子專案 32：DP、每段直接控制的段可以不接（不亮）；每段直接控制時一段都沒接才提醒。
      if (node.segments) {
        if (!Array.from({ length: 8 }, (_, pin) => driven.has(`${node.id}#${pin}`)).some(Boolean))
          issues.push({ code: 'LOGIC_INPUT_OPEN', severity: 'warning', message: `顯示器 ${node.name} 的每一段都沒有接線`, nodeIds: [node.id] });
        continue;
      }
      for (let pin = 0; pin < 4; pin++) {
        if (!driven.has(`${node.id}#${pin}`))
          issues.push({ code: 'LOGIC_INPUT_OPEN', severity: 'warning', message: `顯示器 ${node.name} 的 ${'ABCD'[pin]} 腳沒有接線，值不確定`, nodeIds: [node.id] });
      }
      continue;
    }
    if (node.kind === 'HIGH' || node.kind === 'LOW') {
      if (!used.has(node.id)) issues.push({ code: 'LOGIC_UNUSED', severity: 'warning', message: `${nodeLabel(node)} 沒有接到任何地方`, nodeIds: [node.id] });
      continue;
    }
    if (node.kind === 'BLOCK' && node.chip) {
      BLOCK_PINS[node.chip].inputs.forEach((name, pin) => {
        if (!driven.has(`${node.id}#${pin}`))
          issues.push({ code: 'LOGIC_INPUT_OPEN', severity: 'warning', message: `${nodeLabel(node)}的 ${name} 腳沒有接線，值不確定`, nodeIds: [node.id] });
      });
      if (!used.has(node.id)) issues.push({ code: 'LOGIC_UNUSED', severity: 'warning', message: `${nodeLabel(node)}的輸出沒有接到任何地方`, nodeIds: [node.id] });
      continue;
    }
    for (let pin = 0; pin < inputCountOf(node); pin++) {
      if (!driven.has(`${node.id}#${pin}`))
        issues.push({ code: 'LOGIC_INPUT_OPEN', severity: 'warning', message: `${nodeLabel(node)}第 ${pin + 1} 個輸入沒有接線，值不確定`, nodeIds: [node.id] });
    }
    if (!used.has(node.id)) issues.push({ code: 'LOGIC_UNUSED', severity: 'warning', message: `${nodeLabel(node)}的輸出沒有接到任何地方`, nodeIds: [node.id] });
  }
  return issues;
}
