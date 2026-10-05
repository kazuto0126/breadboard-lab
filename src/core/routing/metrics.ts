import type { Wire } from '../../types/circuit';
import type { RoutingMetrics } from '../../types/routing';
import { analyzeWireInteractions, countBends, countShortJogs } from '../circuit/wireGeometry';

export function computeMetrics(wires: Wire[]): RoutingMetrics {
  const { overlaps, crossings } = analyzeWireInteractions(wires);
  return {
    wireCount: wires.length,
    totalLength: wires.reduce((sum, w) => sum + Math.max(0, w.path.length - 1), 0),
    bends: wires.reduce((sum, w) => sum + countBends(w.path), 0),
    crossings: crossings.length,
    overlaps: overlaps.length,
    shortJogs: wires.reduce((sum, w) => sum + countShortJogs(w.path), 0),
  };
}
