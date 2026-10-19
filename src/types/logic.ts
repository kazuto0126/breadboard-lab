/** IC 輸入讀到的邏輯值。'X' = 衝突或未知。 */
export type Logic = 0 | 1 | 'X';

/** 節點電位。'Z' = 浮接（沒有任何東西驅動）。 */
export type Level = 0 | 1 | 'X' | 'Z';

/** 有極性的控制訊號：pin 為腳位名稱，active 為有效電位。 */
export interface ActiveSignal {
  pin: string;
  active: 'high' | 'low';
}

export type GateOp = 'and' | 'or' | 'nand' | 'nor' | 'xor' | 'xnor' | 'not' | 'buf';

export interface GateSpec {
  op: GateOp;
  in: string[];
  out: string;
}

/** 組合邏輯閘（74LS00、02、04、08、32、86…）。 */
export interface GatesLogic {
  model: 'gates';
  gates: GateSpec[];
}

export interface DecoderUnit {
  /** 選擇線，LSB 在前。 */
  select: string[];
  /** 全部有效時才致能。 */
  enable: ActiveSignal[];
  /** 第 i 個輸出對應選擇值 i。 */
  outputs: string[];
  outputActive: 'high' | 'low';
}

/** 解碼器 / 解多工器（74LS138、154）。 */
export interface DecoderLogic {
  model: 'decoder';
  units: DecoderUnit[];
}

export interface FlipFlopSpec {
  d: string;
  clock: string;
  q?: string;
  qn?: string;
  /** 非同步設定（Q = 1）。 */
  preset?: ActiveSignal;
  /** 非同步清除（Q = 0）。 */
  clear?: ActiveSignal;
}

/** 上升緣觸發的 D 型正反器組（74LS74、173、174、175、273）。 */
export interface DffLogic {
  model: 'dff';
  flipflops: FlipFlopSpec[];
  /** 全部有效時才在時脈上升緣載入 D；否則保持。省略 = 一律載入。 */
  load?: ActiveSignal[];
  /** 全部有效時才輸出；否則三態輸出為 Z。省略 = 一律輸出。 */
  outputEnable?: ActiveSignal[];
}

export interface RippleStage {
  clock: string;
  modulus: number;
  /** 這一段的輸出，LSB 在前。 */
  outputs: string[];
}

export interface RipplePreset {
  /** 全部有效時，每一段直接設成 values。先列的優先。 */
  when: ActiveSignal[];
  values: number[];
}

/** 下降緣觸發的漣波計數器（74LS90、93）。 */
export interface RippleCounterLogic {
  model: 'ripple-counter';
  stages: RippleStage[];
  presets: RipplePreset[];
}

/** 上升緣觸發的同步計數器（74LS161、163）。 */
export interface SyncCounterLogic {
  model: 'sync-counter';
  /** LSB 在前。 */
  outputs: string[];
  data: string[];
  clock: string;
  clear: ActiveSignal & { mode: 'async' | 'sync' };
  load: ActiveSignal;
  enable: ActiveSignal[];
  /** 計到最大值且 enable 全部有效時輸出 1。 */
  carry: { output: string; enable: ActiveSignal[] };
}

/** 雙時脈上 / 下數計數器（74LS193）。carry / borrow 為低電位有效的輸出腳。 */
export interface UpDownCounterLogic {
  model: 'updown-counter';
  outputs: string[];
  data: string[];
  up: string;
  down: string;
  clear: ActiveSignal;
  load: ActiveSignal;
  carry: string;
  borrow: string;
}

/** 二進位全加器（74LS283）。 */
export interface AdderLogic {
  model: 'adder';
  a: string[];
  b: string[];
  carryIn: string;
  sum: string[];
  carryOut: string;
}

/** 雙向匯流排收發器（74LS245）。 */
export interface TransceiverLogic {
  model: 'transceiver';
  a: string[];
  b: string[];
  /** direction.pin 為 aToB 指定的電位時，A → B；否則 B → A。 */
  direction: { pin: string; aToB: 'high' | 'low' };
  enable: ActiveSignal[];
}

export interface JkFlipFlopSpec {
  j: string;
  k: string;
  clock: string;
  q?: string;
  qn?: string;
  preset?: ActiveSignal;
  clear?: ActiveSignal;
}

/** 下降緣觸發的 JK 正反器組（74LS73、76）。 */
export interface JkffLogic {
  model: 'jkff';
  flipflops: JkFlipFlopSpec[];
}

/** 4 位元大小比較器（74LS85），含串接輸入。a、b 都是 LSB 在前。 */
export interface ComparatorLogic {
  model: 'comparator';
  a: string[];
  b: string[];
  cascade: { gt: string; eq: string; lt: string };
  outputs: { gt: string; eq: string; lt: string };
}

export interface MuxUnit {
  /** 選擇線，LSB 在前。 */
  select: string[];
  data: string[];
  enable: ActiveSignal[];
  output?: string;
  /** 反相輸出（74LS151 的 W）。 */
  outputN?: string;
}

/** 多工器（74LS151、153）：不致能時 Y = 0、W = 1。 */
export interface MuxLogic {
  model: 'mux';
  units: MuxUnit[];
}

/** BCD 轉 7 段解碼器（74LS47）：輸出低電位有效、開集極（亮 = 0、不亮 = Z）。inputs = A B C D，segments = a…g。 */
export interface Bcd7segLogic {
  model: 'bcd7seg';
  inputs: string[];
  segments: string[];
  lampTest: string;
  blanking: string;
  rippleBlanking: string;
  /** 子專案 32：74LS48 的輸出是高電位有效（亮 = 1），74LS47 是低電位有效（亮 = 0、不亮 = 開集極斷開）。 */
  activeHigh?: boolean;
}

/** NE555：OUT 跟著模擬時間驅動的虛擬振盪腳；reset 有效時 OUT = 0。 */
export interface Timer555Logic {
  model: 'timer555';
  output: string;
  reset: ActiveSignal;
}

export type LogicSpec =
  | GatesLogic
  | DecoderLogic
  | DffLogic
  | RippleCounterLogic
  | SyncCounterLogic
  | UpDownCounterLogic
  | AdderLogic
  | TransceiverLogic
  | JkffLogic
  | ComparatorLogic
  | MuxLogic
  | Bcd7segLogic
  | Timer555Logic;

export type LogicModelName = LogicSpec['model'];
