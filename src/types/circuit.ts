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
  /** 含起點與終點；相鄰兩點距離必須為 1。 */
  path: GridPoint[];
}

export interface Circuit {
  version: 1;
  boards: BreadboardInstance[];
  components: ComponentInstance[];
  wires: Wire[];
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
