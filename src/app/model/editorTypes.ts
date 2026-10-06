import type { CircuitError } from '../../types/circuit';
import type { ComponentInstance, ComponentProps } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { FailedNet } from '../../types/routing';

export type Mode = 'edit' | 'routing' | 'compare';
export type RightTab = 'selection' | 'check' | 'checklist';
export type CompareView = 'mine' | 'ai';

/** 板子 SVG 單位 → 螢幕像素：screen = board × scale + (tx, ty)。 */
export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export type Selection =
  | { kind: 'component'; id: string }
  | { kind: 'pin'; componentId: string; pinNumber: number }
  | { kind: 'wire'; id: string }
  | { kind: 'hole'; point: GridPoint };

export type RoutingJob =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'animating'; wireIds: string[]; stepMs: number }
  | { status: 'done' }
  | { status: 'failed'; message: string; failedNets: FailedNet[] }
  | { status: 'error'; message: string };

/** 元件庫中的一個方塊。key 也是畫面上的 data-part 值，例如 74LS00、resistor-220、led-red。 */
export interface PartTemplate {
  key: string;
  defId: string;
  label: string;
  props: ComponentProps;
}

export interface Ghost {
  instance: ComponentInstance;
  valid: boolean;
  reason: string | null;
}

export interface WirePreview {
  start: GridPoint;
  end: GridPoint;
  path: GridPoint[];
  valid: boolean;
}

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

export interface Analysis {
  liveCheck: CircuitError[];
  wireCount: number;
  netCount: number;
  score: number;
}
