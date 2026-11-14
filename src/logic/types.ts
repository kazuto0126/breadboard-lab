import type { NoteColor } from '../types/circuit';
import type { StateTask } from './stateTask';
import type { TruthTask } from './task';

/** 規格（2026-10-11 logic-diagram）第 2 節：邏輯圖的資料。座標是格子（整數），x 往右、y 往下。 */
export type GateKind = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR';
/** DISPLAY：7 段顯示器（子專案 16），4 個輸入腳 A、B、C、D，沒有輸出腳。 */
/** 子專案 21：HIGH / LOW 是常數 1 / 0（5V、GND），BLOCK 是 IC 方塊。 */
/** 子專案 46：CLOCK 是時脈（一個輸出，「一個脈衝」送出 0 → 1 → 0）。 */
/** 子專案 65：CUSTOM 是自訂方塊（定義在 LogicDiagram.blocks）。 */
/** 子專案 66：MERGE（合起來）把 width 個一位元訊號合成一條匯流排；SPLIT（拆開）把匯流排拆回 width 個一位元訊號。 */
export type NodeKind = GateKind | 'INPUT' | 'OUTPUT' | 'DISPLAY' | 'HIGH' | 'LOW' | 'BLOCK' | 'CLOCK' | 'CUSTOM' | 'MERGE' | 'SPLIT';
/** 子專案 46：74LS74 起是時序 IC（正反器、計數器）。子專案 51：DFF、JKFF 是單顆正反器（轉換時兩顆合用一片 74LS74 / 76）。 */
export type BlockChip = '74LS83' | '74LS151' | '74LS153' | '74LS138' | '74LS85' | '74LS74' | '74LS76' | '74LS90' | '74LS93' | '74LS161' | '74LS193' | 'DFF' | 'JKFF';

export const GATE_KINDS: GateKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'];

export interface LogicNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** 只有閘：AND / OR / NAND / NOR 為 2–4；NOT = 1；XOR = 2。子專案 65：自訂方塊是輸入腳數。 */
  inputs?: number;
  /** 子專案 65：只有自訂方塊：輸出腳數。 */
  outputs?: number;
  /** 子專案 65：只有自訂方塊：定義的 id。 */
  block?: string;
  /** 子專案 66：只有合起來 / 拆開：匯流排的位元數（2–8）。 */
  width?: number;
  /** 只有輸入端、輸出端、顯示器。 */
  name?: string;
  /** 只有輸入端：開關目前的狀態。 */
  value?: 0 | 1;
  /** 只有 IC 方塊：哪一顆 IC。 */
  chip?: BlockChip;
  /** 子專案 26：順時針轉幾度（0 不寫）；7 段顯示器不轉。 */
  rotation?: Rotation;
  /** 子專案 28：左右鏡射（先鏡射再轉）；不鏡射時不寫。 */
  flip?: true;
  /** 子專案 32：只有顯示器：每段直接控制（8 個輸入 a–g、dp），不寫是 BCD（A–D 與 DP）。 */
  segments?: true;
  /** 子專案 37：只有輸出端：低態致動（0 時亮）；不寫是 1 時亮。真值表與比對仍然寫訊號的 0 / 1。 */
  activeLow?: true;
}

export type Rotation = 90 | 180 | 270;

/** 可以轉向、鏡射的元件：子專案 28 起除了 7 段顯示器（數字有方向）都可以。 */
export const canRotate = (kind: NodeKind): boolean => kind !== 'DISPLAY';

export interface LogicWire {
  id: string;
  /** 來源：閘或輸入端的 id。 */
  from: string;
  /** 來源的第幾個輸出腳（只有 IC 方塊會大於 0；0 時不寫）。 */
  fromPin?: number;
  /** 目的：閘的第 pin 個輸入（從 0 起算），或輸出端（pin = 0）。 */
  to: { node: string; pin: number };
}

export interface LogicDiagram {
  version: 1;
  nodes: LogicNode[];
  wires: LogicWire[];
  /** 子專案 24：真值表題目（邏輯圖的編輯都用 `{ ...d }` 產生新的圖，會保留它）。 */
  task?: TruthTask;
  /** 子專案 52：狀態表題目。 */
  stateTask?: StateTask;
  /** 子專案 29：邏輯圖上的便條。 */
  notes?: LogicNote[];
  /** 子專案 65：這個檔案的自訂方塊。 */
  blocks?: CustomBlock[];
}

/**
 * 子專案 65（規格 2026-11-14 custom-blocks 第 1 節）：自訂方塊的定義：裡面是一張小邏輯圖，
 * 輸入端是方塊的輸入腳、輸出端是輸出腳（順序照圖上的位置由上到下，腳名是它們的名稱）。
 */
export interface CustomBlock {
  id: string;
  name: string;
  /** 子專案 66：A0、A1… 這種腳合成一個多位元腳 A[n−1:0]（新做的方塊都是；子專案 65 存的方塊沒有這個欄位，照舊一個一個）。 */
  busPins?: true;
  nodes: LogicNode[];
  wires: LogicWire[];
}

/** 子專案 29：邏輯圖的便條（位置是格子座標）；指向一個元件。 */
export interface LogicNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: NoteColor;
  target?: string;
}

export function emptyDiagram(): LogicDiagram {
  return { version: 1, nodes: [], wires: [] };
}

export const isGate = (kind: NodeKind): kind is GateKind => (GATE_KINDS as string[]).includes(kind);

/** 沒有輸入腳、只當線的來源：輸入端、5V、GND、時脈。 */
/** 子專案 64：一張圖最多幾個時脈。 */
export const MAX_CLOCKS = 4;

export const isSource = (kind: NodeKind): boolean => kind === 'INPUT' || kind === 'HIGH' || kind === 'LOW' || kind === 'CLOCK';

/** 訊號名稱：方塊第 k 個輸出（k > 0）是 `${id}.${k}`，其他都是節點 id。 */
export const signalOf = (from: string, fromPin?: number): string => (fromPin ? `${from}.${fromPin}` : from);

/** 只能當終點（不能當線的來源）：輸出端、顯示器。 */
export const isSink = (kind: NodeKind): boolean => kind === 'OUTPUT' || kind === 'DISPLAY';
