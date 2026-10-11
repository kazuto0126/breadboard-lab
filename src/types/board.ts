export type NodeKind = 'hole' | 'surface';
export type LayoutId = 'MB102' | 'EIC1106';
export type RailLabel = 'T-' | 'T+' | 'B+' | 'B-' | `P${1 | 2 | 3 | 4 | 5}${'+' | '-'}`;
export type TerminalRowLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export type LayoutRow =
  /** area：插孔區編號（EIC-1106 有 1–3 區；MB-102 只有一區，省略）。 */
  | { y: number; kind: 'terminal'; label: TerminalRowLabel; half: 'top' | 'bot'; area?: number }
  | { y: number; kind: 'rail'; label: RailLabel; holeColumns: number[] }
  | { y: number; kind: 'surface' };

/** 接線柱（EIC-1106）：一個可以接線的孔；source 表示它是 VCC 或 GND 電源。 */
export interface BindingPost {
  x: number;
  y: number;
  name: string;
  color: 'red' | 'black' | 'yellow' | 'green';
  source?: 'vcc' | 'gnd';
}

export interface BoardLayout {
  id: LayoutId;
  /** 顯示用的型號。 */
  name: string;
  width: number;
  height: number;
  rows: LayoutRow[];
  posts?: BindingPost[];
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
  /** 接線柱的電源種類（紅 = vcc、黑 = gnd）。 */
  source?: 'vcc' | 'gnd';
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
  layoutId: LayoutId;
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
