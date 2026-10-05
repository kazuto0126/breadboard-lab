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
  x: number;
  y: number;
  groupId: null;
}
