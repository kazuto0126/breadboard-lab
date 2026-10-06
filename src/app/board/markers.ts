import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit, CircuitError } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';

export interface Marker {
  point: GridPoint;
  severity: 'error' | 'warning';
}

/** 規格第 5.6 節：錯誤畫在它的點位上；沒有點位時畫在相關元件的第 1 腳。同一點只留最嚴重的。 */
export function markersFromErrors(errors: CircuitError[], circuit: Circuit): Marker[] {
  const byKey = new Map<string, Marker>();
  const add = (point: GridPoint, severity: Marker['severity']) => {
    const key = `${point.boardId}:${point.x},${point.y}`;
    const existing = byKey.get(key);
    if (!existing || (existing.severity === 'warning' && severity === 'error')) byKey.set(key, { point, severity });
  };
  for (const e of errors) {
    if (e.severity === 'info') continue;
    const severity = e.severity;
    if (e.points.length > 0) {
      for (const p of e.points) add(p, severity);
      continue;
    }
    for (const id of e.componentIds) {
      const instance = circuit.components.find((c) => c.id === id);
      const def = instance ? getComponentDefinition(instance.defId) : undefined;
      if (instance && def) add(resolveFootprint(instance, def).pins[0].point, severity);
    }
  }
  return [...byKey.values()];
}

/** 規格第 5.4 節：有這些錯誤的導線畫成紅色虛線。 */
export const WIRE_ERROR_CODES = new Set<string>(['WIRE_PATH_INVALID', 'WIRE_ENDPOINT_INVALID', 'WIRE_THROUGH_OBSTACLE', 'WIRE_OVERLAP']);

export function invalidWireIds(errors: CircuitError[]): Set<string> {
  return new Set(errors.filter((e) => WIRE_ERROR_CODES.has(e.code)).flatMap((e) => e.wireIds));
}
