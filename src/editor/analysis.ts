import { getNode } from '../core/breadboard/naming';
import { getBoard } from '../core/breadboard/registry';
import { extractNets, pinKey } from '../core/circuit/nets';
import { validateCircuit } from '../core/circuit/validate';
import { scoreRouting } from '../core/routing/score';
import type { Circuit, CircuitError, Net, PinRef } from '../types/circuit';
import type { GridPoint } from '../types/geometry';
import type { RoutingMetrics } from '../types/routing';
import { buildOccupancy, type Occupancy } from './placement';

/** 畫面需要的所有衍生資料，依 circuit 參照快取，多個面板共用同一份結果。 */
export interface CircuitAnalysis {
  nets: Net[];
  netById: Map<string, Net>;
  /** 導通群組 ID → Net。 */
  netByGroup: Map<string, Net>;
  /** `${componentId}#${pinNumber}` → Net。 */
  netByPin: Map<string, Net>;
  /** 導線 ID → 它的端點所在的 Net。 */
  netByWire: Map<string, Net>;
  issues: CircuitError[];
  errorCount: number;
  warningCount: number;
  valid: boolean;
  routing: { metrics: RoutingMetrics; score: number };
}

const analysisCache = new WeakMap<Circuit, CircuitAnalysis>();
const occupancyCache = new WeakMap<Circuit, Map<string, Occupancy>>();

export function groupIdAt(circuit: Circuit, p: GridPoint): string | null {
  const instance = circuit.boards.find((b) => b.id === p.boardId);
  if (!instance) return null;
  return getNode(getBoard(instance.layoutId, instance.id), p.x, p.y)?.groupId ?? null;
}

export function analyzeCircuit(circuit: Circuit): CircuitAnalysis {
  const cached = analysisCache.get(circuit);
  if (cached) return cached;

  const nets = extractNets(circuit);
  const netById = new Map(nets.map((n) => [n.id, n]));
  const netByGroup = new Map<string, Net>();
  const netByPin = new Map<string, Net>();
  for (const net of nets) {
    for (const g of net.groupIds) netByGroup.set(g, net);
    for (const ref of net.pins) netByPin.set(pinKey(ref), net);
  }
  const netByWire = new Map<string, Net>();
  for (const w of circuit.wires) {
    for (const end of [w.start, w.end]) {
      const g = groupIdAt(circuit, end);
      const net = g ? netByGroup.get(g) : undefined;
      if (net) {
        netByWire.set(w.id, net);
        break;
      }
    }
  }
  const issues = validateCircuit(circuit);
  const errorCount = issues.filter((e) => e.severity === 'error').length;
  const warningCount = issues.filter((e) => e.severity === 'warning').length;

  const analysis: CircuitAnalysis = {
    nets,
    netById,
    netByGroup,
    netByPin,
    netByWire,
    issues,
    errorCount,
    warningCount,
    valid: errorCount === 0 && warningCount === 0,
    routing: scoreRouting(circuit),
  };
  analysisCache.set(circuit, analysis);
  return analysis;
}

/** 某塊板目前的佔用狀態（快取）。 */
export function occupancyOf(circuit: Circuit, boardId: string): Occupancy {
  let perBoard = occupancyCache.get(circuit);
  if (!perBoard) {
    perBoard = new Map();
    occupancyCache.set(circuit, perBoard);
  }
  let occ = perBoard.get(boardId);
  if (!occ) {
    occ = buildOccupancy(circuit, boardId);
    perBoard.set(boardId, occ);
  }
  return occ;
}

export function netOfPin(analysis: CircuitAnalysis, ref: PinRef): Net | undefined {
  return analysis.netByPin.get(pinKey(ref));
}
