import { getComponentDefinition } from '../core/circuit/library';
import { analyzeCircuit } from '../editor/analysis';
import type { Circuit } from '../types/circuit';
import { sortedIo, truthTable } from './evaluate';
import { rowBits, type TruthTask } from './task';
import type { LogicDiagram } from './types';
import { verifyExpected, verifyRows, type Bindings, type VerifyResult } from './verifyBreadboard';

/** 規格（2026-10-17 diagram-check）第 3 節：「檢查」分頁那張卡要顯示什麼。 */
export type DiagramCheck =
  | { kind: 'none' }
  | { kind: 'hint' }
  | { kind: 'incomplete'; issues: string[] }
  | { kind: 'done'; bindings: Bindings; result: VerifyResult; inputs: string[]; outputs: string[]; mapping: string };

/** 某一類零件上的名稱 → 有這個名稱的位置（指撥開關是第幾個開關，其他零件是 0）。 */
function labelsOf(circuit: Circuit, category: string): Map<string, Array<{ id: string; index: number }>> {
  const byName = new Map<string, Array<{ id: string; index: number }>>();
  for (const c of circuit.components) {
    if (getComponentDefinition(c.defId)?.category !== category) continue;
    const labels = category === 'dip-switch' ? (c.props.labels ?? []) : (c.props.labels ?? []).slice(0, 1);
    labels.forEach((raw, index) => {
      const name = raw.trim();
      if (name) byName.set(name, [...(byName.get(name) ?? []), { id: c.id, index }]);
    });
  }
  return byName;
}

/** 要比對的輸入與輸出：邏輯圖用節點 id，題目（子專案 24）用名稱當 id。 */
export interface NamedIo {
  inputs: Array<{ id: string; name: string }>;
  outputs: Array<{ id: string; name: string; display: boolean }>;
}

function ioOfDiagram(d: LogicDiagram): NamedIo {
  const { inputs, outputs } = sortedIo(d);
  return {
    inputs: inputs.map((n) => ({ id: n.id, name: n.name ?? n.id })),
    outputs: outputs.map((n) => ({ id: n.id, name: n.name ?? n.id, display: n.kind === 'DISPLAY' })),
  };
}

/**
 * 規格第 2 節：依名稱把邏輯圖的輸入端、輸出端、顯示器對應到指撥開關的某一個開關、LED、7 段顯示器；
 * 開關一邊接到 +5 V 時撥 ON = 1，接到 GND 時撥 ON = 0。
 */
export function bindByLabels(d: LogicDiagram, circuit: Circuit): { bindings: Bindings; issues: string[]; matched: number } {
  return bindByNames(ioOfDiagram(d), circuit);
}

/** 依名稱對應（邏輯圖與題目共用）。 */
export function bindByNames(io: NamedIo, circuit: Circuit): { bindings: Bindings; issues: string[]; matched: number } {
  const { inputs, outputs } = io;
  const analysis = analyzeCircuit(circuit);
  const switches = labelsOf(circuit, 'dip-switch');
  const leds = labelsOf(circuit, 'led');
  const displays = labelsOf(circuit, 'seven-seg');
  const bindings: Bindings = { inputs: [], leds: {}, displays: {} };
  const missing: string[] = [];
  const twice: string[] = [];
  const rails: string[] = [];
  let matched = 0;

  for (const node of inputs) {
    const name = node.name;
    const found = switches.get(name) ?? [];
    if (found.length === 0) {
      missing.push(`輸入 ${name}：找不到名稱是 ${name} 的開關`);
      continue;
    }
    matched++;
    if (found.length > 1) {
      twice.push(`名稱 ${name} 用在好幾個開關：${found.map((f) => `${f.id} 第 ${f.index + 1} 個`).join('、')}`);
      continue;
    }
    const { id, index } = found[0];
    const instance = circuit.components.find((c) => c.id === id)!;
    const n = getComponentDefinition(instance.defId)!.pins.length;
    // 第 index 個開關接通第 index + 1 腳和第 n − index 腳。
    const kinds = [index + 1, n - index].map((p) => analysis.netByPin.get(`${id}#${p}`)?.kind).filter((k) => k === 'power' || k === 'ground');
    const where = `${id} 第 ${index + 1} 個開關（${name}）`;
    if (kinds.length === 0) rails.push(`${where}沒有接到 +5 V 或 GND`);
    else if (kinds.length === 2) rails.push(`${where}兩邊都接到電源`);
    else bindings.inputs.push({ node: node.id, switchId: id, index, onIs: kinds[0] === 'power' ? 1 : 0 });
  }

  for (const node of outputs) {
    const { name, display } = node;
    const found = (display ? displays : leds).get(name) ?? [];
    if (found.length === 0) {
      missing.push(display ? `顯示器 ${name}：找不到名稱是 ${name} 的 7 段顯示器` : `輸出 ${name}：找不到名稱是 ${name} 的 LED`);
      continue;
    }
    matched++;
    if (found.length > 1) {
      twice.push(`名稱 ${name} 用在好幾${display ? '個 7 段顯示器' : '顆 LED'}：${found.map((f) => f.id).join('、')}`);
      continue;
    }
    (display ? bindings.displays : bindings.leds)[node.id] = found[0].id;
  }

  return { bindings, issues: [...missing, ...twice, ...rails], matched };
}

/** 「A → SW1 第 1 個開關（ON = 1）、X → D1」。 */
function mappingText(io: NamedIo, b: Bindings): string {
  const name = (id: string) => io.inputs.find((n) => n.id === id)?.name ?? id;
  return [
    ...b.inputs.map((s) => `${name(s.node)} → ${s.switchId} 第 ${s.index + 1} 個開關（ON = ${s.onIs}）`),
    ...io.outputs.map((o) => `${o.name} → ${(o.display ? b.displays : b.leds)[o.id]}`),
  ].join('、');
}

/** 規格第 3 節。 */
export function checkAgainstDiagram(d: LogicDiagram, circuit: Circuit): DiagramCheck {
  if (circuit.components.length === 0) return { kind: 'none' };
  const table = truthTable(d);
  if (!table.ok || table.inputs.length === 0 || table.outputs.length === 0) return { kind: 'none' };
  const { bindings, issues, matched } = bindByLabels(d, circuit);
  if (matched === 0) return { kind: 'hint' };
  const all = [...issues];
  if (table.rows.some((r) => r.out.includes('X'))) all.push('邏輯圖有些輸出不確定（還有沒接好的腳），先把邏輯圖接好');
  if (all.length > 0) return { kind: 'incomplete', issues: all };
  return { kind: 'done', bindings, result: verifyRows(d, circuit, bindings), inputs: table.inputs, outputs: table.outputs, mapping: mappingText(ioOfDiagram(d), bindings) };
}

/**
 * 子專案 24（規格 2026-10-17 truth-table-task 第 4 節）：依名稱把麵包板對應到真值表題目，逐列模擬比對；X 的格子不比。
 * 題目的名稱當作對應的 id（開關的 `node` 就是輸入名稱）。
 */
export function checkAgainstTask(task: TruthTask | undefined, circuit: Circuit): DiagramCheck {
  if (!task || circuit.components.length === 0) return { kind: 'none' };
  const io: NamedIo = { inputs: task.inputs.map((name) => ({ id: name, name })), outputs: task.outputs.map((name) => ({ id: name, name, display: false })) };
  const { bindings, issues, matched } = bindByNames(io, circuit);
  if (matched === 0) return { kind: 'hint' };
  if (issues.length > 0) return { kind: 'incomplete', issues };
  const rows = task.rows.map((out, r) => ({ in: rowBits(task, r), out: out.map(String) }));
  return { kind: 'done', bindings, result: verifyExpected(circuit, bindings, io.outputs, rows), inputs: task.inputs, outputs: task.outputs, mapping: mappingText(io, bindings) };
}
