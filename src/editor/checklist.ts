import { nodeIdOf } from '../core/breadboard/naming';
import type { Circuit, Net, Wire } from '../types/circuit';
import { analyzeCircuit, holeLabel } from './analysis';
import { WIRE_COLORS } from './manualWire';

/**
 * 接線清單：照著在實體麵包板上插線的順序（規格 docs/superpowers/specs/2026-10-06-wiring-checklist-design.md）。
 * 勾選狀態記錄「勾選當時這條線插在板上的樣子」，導線被重新佈線或改色後就自動變回未完成。
 */
export type ChecklistState = Record<string, string>;

export interface ChecklistRow {
  wireId: string;
  color: string;
  colorName: string;
  /** 起點、終點孔位（多塊板時含板子 ID）。 */
  from: string;
  to: string;
  /** 長度（格）。 */
  length: number;
  /** 所屬 Net；兩端都沒有接到元件腳時為 null。 */
  netName: string | null;
  kind: Net['kind'] | null;
  done: boolean;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** 自然排序：NET_2 在 NET_10 前面、w9 在 w10 前面。 */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

/** 跳線的中文色名（10 種常見顏色以外為「其他」）。 */
export function colorName(hex: string): string {
  return WIRE_COLORS.find((c) => c.value.toLowerCase() === hex.toLowerCase())?.name ?? '其他';
}

/** 一條導線插在板上的樣子：兩端的孔、長度、顏色。 */
export function wireKey(w: Wire): string {
  return `${nodeIdOf(w.start)}>${nodeIdOf(w.end)}|${w.path.length - 1}|${w.color.toLowerCase()}`;
}

export function isChecked(state: ChecklistState, w: Wire): boolean {
  return state[w.id] === wireKey(w);
}

export function setChecked(state: ChecklistState, wire: Wire, checked: boolean): ChecklistState {
  if (isChecked(state, wire) === checked) return state;
  const next = { ...state };
  if (checked) next[wire.id] = wireKey(wire);
  else delete next[wire.id];
  return next;
}

/** 只留下目前電路中仍然有效的勾選（存檔前使用）。 */
export function pruneChecklist(state: ChecklistState, circuit: Pick<Circuit, 'wires'>): ChecklistState {
  const out: ChecklistState = {};
  for (const w of circuit.wires) if (isChecked(state, w)) out[w.id] = state[w.id];
  return out;
}

export function checklistProgress(state: ChecklistState, circuit: Pick<Circuit, 'wires'>): { done: number; total: number } {
  return { done: circuit.wires.filter((w) => isChecked(state, w)).length, total: circuit.wires.length };
}

const KIND_RANK: Record<Net['kind'], number> = { power: 0, ground: 1, signal: 2 };

/** 先接電源、再接地、最後訊號（沒有接到元件腳的線排最後）；同類依 Net 名稱、導線 ID 的自然順序。 */
export function checklistRows(circuit: Circuit, state: ChecklistState): ChecklistRow[] {
  const analysis = analyzeCircuit(circuit);
  const rows = circuit.wires.map((w): ChecklistRow => {
    const net = analysis.netByWire.get(w.id);
    return {
      wireId: w.id,
      color: w.color,
      colorName: colorName(w.color),
      from: holeLabel(circuit, w.start),
      to: holeLabel(circuit, w.end),
      length: w.path.length - 1,
      netName: net?.name ?? null,
      kind: net?.kind ?? null,
      done: isChecked(state, w),
    };
  });
  const rank = (r: ChecklistRow) => (r.kind ? KIND_RANK[r.kind] : 3);
  return rows.sort((a, b) => rank(a) - rank(b) || naturalCompare(a.netName ?? '', b.netName ?? '') || naturalCompare(a.wireId, b.wireId));
}
