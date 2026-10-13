/** 規格（2026-10-11 logic-diagram）第 2 節：邏輯圖的資料。座標是格子（整數），x 往右、y 往下。 */
export type GateKind = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR';
/** DISPLAY：7 段顯示器（子專案 16），4 個輸入腳 A、B、C、D，沒有輸出腳。 */
export type NodeKind = GateKind | 'INPUT' | 'OUTPUT' | 'DISPLAY';

export const GATE_KINDS: GateKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'];

export interface LogicNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** 只有閘：AND / OR / NAND / NOR 為 2–4；NOT = 1；XOR = 2。 */
  inputs?: number;
  /** 只有輸入端、輸出端、顯示器。 */
  name?: string;
  /** 只有輸入端：開關目前的狀態。 */
  value?: 0 | 1;
}

export interface LogicWire {
  id: string;
  /** 來源：閘或輸入端的 id。 */
  from: string;
  /** 目的：閘的第 pin 個輸入（從 0 起算），或輸出端（pin = 0）。 */
  to: { node: string; pin: number };
}

export interface LogicDiagram {
  version: 1;
  nodes: LogicNode[];
  wires: LogicWire[];
}

export function emptyDiagram(): LogicDiagram {
  return { version: 1, nodes: [], wires: [] };
}

export const isGate = (kind: NodeKind): kind is GateKind => kind !== 'INPUT' && kind !== 'OUTPUT' && kind !== 'DISPLAY';

/** 只能當終點（不能當線的來源）：輸出端、顯示器。 */
export const isSink = (kind: NodeKind): boolean => kind === 'OUTPUT' || kind === 'DISPLAY';
