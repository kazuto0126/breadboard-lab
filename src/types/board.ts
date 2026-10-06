export type NodeKind = 'hole' | 'surface';
export type RailLabel = 'T-' | 'T+' | 'B+' | 'B-';
export type TerminalRowLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export type LayoutRow =
  | { y: number; kind: 'terminal'; label: TerminalRowLabel; half: 'top' | 'bot' }
  | { y: number; kind: 'rail'; label: RailLabel; holeColumns: number[] }
  | { y: number; kind: 'surface' };

export interface BoardLayout {
  id: string;
  width: number;
  height: number;
  rows: LayoutRow[];
}

export interface BreadboardNode {
  id: string;
  boardId: string;
  x: number;
  y: number;
  kind: NodeKind;
  name: string | null;
  groupId: string | null;
}

export interface BreadboardGroup {
  id: string;
  boardId: string;
  kind: 'terminal' | 'rail';
  nodeIds: string[];
}

export interface Breadboard {
  id: string;
  layoutId: string;
  width: number;
  height: number;
  nodes: BreadboardNode[];
  groups: Record<string, BreadboardGroup>;
}

export interface BreadboardInstance {
  id: string;
  layoutId: 'MB102';
  /** 在世界座標中的位置（mm），一律對齊 0.1 吋（2.54 mm）格點。 */
  x: number;
  y: number;
  /** 所屬的 Board Group（與其他板邊對邊貼合且對齊時）；單獨一塊為 null。由幾何推導後寫入。 */
  groupId: string | null;
}

/** 需求文件 38.8 的 Board Group（由板子的位置推導）。座標與大小以格（0.1 吋）為單位。 */
export interface BoardGroup {
  id: string;
  boardIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 180;
}
