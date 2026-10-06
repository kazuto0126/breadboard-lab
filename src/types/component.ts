import type { GridPoint } from './geometry';
import type { LogicSpec } from './logic';

export type PinRole =
  | 'input'
  | 'output'
  | 'bidir'
  | 'power'
  | 'ground'
  | 'nc'
  | 'passive'
  | 'anode'
  | 'cathode'
  | 'vcc-source'
  | 'gnd-source';

export type ComponentCategory = 'ic' | 'resistor' | 'led' | 'vcc' | 'gnd' | 'dc-power' | 'dip-switch' | 'pushbutton' | 'clock';

export type PackageSpec =
  | { type: 'dip'; pinCount: number; rowSpacing: 3 | 6 }
  | { type: 'two-lead'; defaultSpan: number; minSpan: number; blocksBetween: boolean }
  | { type: 'single' }
  | { type: 'tactile4' };

export interface PinDefinition {
  number: number;
  name: string;
  role: PinRole;
}

export type LedColor = 'red' | 'green' | 'yellow' | 'blue';

export interface ComponentProps {
  resistance?: number;
  color?: LedColor;
  voltage?: number;
  switchStates?: boolean[];
  /** 時脈頻率（Hz）。 */
  frequency?: number;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  /** 給元件庫顯示的一句話說明。 */
  description?: string;
  category: ComponentCategory;
  package: PackageSpec;
  pins: PinDefinition[];
  internalConnections: number[][];
  defaultProps: ComponentProps;
  /** 邏輯模型；被動元件與電源為 null。 */
  logic: LogicSpec | null;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface ComponentInstance {
  id: string;
  defId: string;
  boardId: string;
  anchor: { x: number; y: number };
  rotation: Rotation;
  span?: number;
  props: ComponentProps;
}

export interface ResolvedPin {
  pinNumber: number;
  point: GridPoint;
}

export interface Footprint {
  pins: ResolvedPin[];
  blocked: GridPoint[];
}
