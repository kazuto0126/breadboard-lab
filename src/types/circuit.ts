import type { BreadboardInstance, NodeKind } from './board';
import type { ComponentInstance } from './component';
import type { GridPoint } from './geometry';

export interface Wire {
  id: string;
  color: string;
  source: 'manual' | 'auto';
  netId?: string;
  start: GridPoint;
  end: GridPoint;
  /** 含起點與終點。路徑導線相鄰兩點距離必須為 1；直線導線固定是 [start, end]。 */
  path: GridPoint[];
  /** 直線導線（手動拉的線、拖曳端點後的線）：兩孔之間的一條直線，可以是斜的。沒有這個欄位的是相鄰格點組成的路徑導線。 */
  straight?: true;
}

/** 子專案 18：麵包板畫面上的便條（不影響電路）。 */
export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink';

export interface Note {
  id: string;
  /** 左上角，世界座標 mm（2.54 的倍數）。 */
  x: number;
  y: number;
  text: string;
  color: NoteColor;
  /** 指向的元件 ID。 */
  target?: string;
}

export interface Circuit {
  version: 1;
  boards: BreadboardInstance[];
  components: ComponentInstance[];
  wires: Wire[];
  /** 沒有便條時不寫這個欄位。 */
  notes?: Note[];
}

export interface PinRef {
  componentId: string;
  pinNumber: number;
}

export interface Net {
  id: string;
  name: string;
  kind: 'power' | 'ground' | 'signal';
  groupIds: string[];
  pins: PinRef[];
}

export type CircuitErrorCode =
  | 'PLACEMENT_INVALID'
  | 'PIN_COLLISION'
  | 'BODY_OVERLAP'
  | 'WIRE_ENDPOINT_INVALID'
  | 'WIRE_PATH_INVALID'
  | 'WIRE_THROUGH_OBSTACLE'
  | 'WIRE_OVERLAP'
  | 'SHORT_CIRCUIT'
  | 'IC_PIN_SHORT'
  | 'IC_POWER_MISSING'
  | 'OUTPUT_CONFLICT'
  | 'NO_POWER_SOURCE'
  | 'INPUT_FLOATING'
  | 'PIN_UNCONNECTED'
  | 'LED_REVERSED'
  | 'LED_NO_RESISTOR'
  | 'COMPONENT_SHORTED'
  | 'CIRCUIT_VALID';

export interface CircuitError {
  code: CircuitErrorCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  points: GridPoint[];
  componentIds: string[];
  wireIds: string[];
  netIds: string[];
}

export interface NodeState {
  nodeId: string;
  kind: NodeKind;
  name: string | null;
  groupId: string | null;
  pin: PinRef | null;
  blockedBy: string[];
  wireEnds: string[];
  wirePasses: string[];
  occupied: boolean;
  routable: boolean;
}
