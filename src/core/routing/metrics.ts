import type { Lattice } from '../breadboard/lattice';
import type { Wire } from '../../types/circuit';
import type { RoutingMetrics } from '../../types/routing';
import { analyzeWireInteractions, countBends, countShortJogs, wireLength } from '../circuit/wireGeometry';

export function computeMetrics(wires: Wire[], lattice?: Lattice): RoutingMetrics {
  const { overlaps, crossings } = analyzeWireInteractions(wires, lattice);
  return {
    wireCount: wires.length,
    // 直線導線（可以斜）的長度不是整數：四捨五入到小數一位。
    totalLength: Math.round(wires.reduce((sum, w) => sum + wireLength(w, lattice), 0) * 10) / 10,
    bends: wires.reduce((sum, w) => sum + countBends(w.path, lattice), 0),
    crossings: crossings.length,
    overlaps: overlaps.length,
    shortJogs: wires.reduce((sum, w) => sum + countShortJogs(w.path, lattice), 0),
  };
}
