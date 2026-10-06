export type { Direction, GridPoint } from './types/geometry';
export type {
  BoardGroup, BoardLayout, Breadboard, BreadboardGroup, BreadboardInstance, BreadboardNode, LayoutRow, NodeKind, RailLabel,
} from './types/board';
export type {
  ComponentCategory, ComponentDefinition, ComponentInstance, ComponentProps, Footprint, LedColor, PackageSpec,
  PinDefinition, PinRole, ResolvedPin, Rotation,
} from './types/component';
export type { Circuit, CircuitError, CircuitErrorCode, Net, NodeState, PinRef, Wire } from './types/circuit';
export type {
  ActiveSignal, GateOp, Level, Logic, LogicModelName, LogicSpec,
} from './types/logic';
export type {
  DeepPartial, FailedNet, FailureReason, LegalityCode, LegalityViolation, RoutingConfig, RoutingMetrics, RoutingNode,
  RoutingPath, RoutingResult, RoutingWeights,
} from './types/routing';

export { MB102_LAYOUT } from './core/breadboard/layouts';
export { buildBoard } from './core/breadboard/buildBoard';
export { getBoard } from './core/breadboard/registry';
export { getNode, holeName, nodeIdOf, parseHoleName, parseNodeId } from './core/breadboard/naming';
export {
  buildCanvas, buildLattice, isRoutablePoint, isSeamPoint, latticeOf, latticeStep, MM_PER_UNIT, pointAt, unitsFromMm,
} from './core/breadboard/lattice';
export type { Lattice, LatticeBoard, LatticeCanvas } from './core/breadboard/lattice';
export { getComponentDefinition, getComponentDefinitions, parseDefinition, RESISTOR_PRESETS } from './core/circuit/library';
export { resolveFootprint } from './core/circuit/footprint';
export { getNodeState } from './core/circuit/nodeState';
export { extractNets } from './core/circuit/nets';
export { validateCircuit } from './core/circuit/validate';
export { DEFAULT_ROUTING_CONFIG, mergeConfig } from './core/routing/config';
export { autoRoute } from './core/routing/autoRoute';
export { checkRoutingLegality } from './core/routing/legality';
export { scoreRouting } from './core/routing/score';
export { applyRouting } from './core/routing/apply';
export { renderAscii } from './debug/ascii';
export { parseLogic } from './core/circuit/logicSpec';
export { createModel } from './core/simulation/models';
export type { LogicModel, ModelState } from './core/simulation/models';
export {
  adoptSimState, clockLevel, compileSimulation, initialSimState, MAX_ITERATIONS, nextClockEdge, settle,
} from './core/simulation/simulate';
export type { SimCircuit, SimInputs, SimResult, SimState } from './core/simulation/simulate';
