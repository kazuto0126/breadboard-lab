import { describe, expect, it } from 'vitest';
import * as api from '../src/index';
import { acceptanceCircuit } from './fixtures/circuits';

describe('public API', () => {
  it('exposes the documented functions', () => {
    const names = [
      'buildBoard', 'getBoard', 'holeName', 'parseHoleName', 'getComponentDefinitions', 'getComponentDefinition',
      'resolveFootprint', 'getNodeState', 'extractNets', 'validateCircuit', 'autoRoute', 'checkRoutingLegality',
      'scoreRouting', 'applyRouting', 'mergeConfig', 'renderAscii', 'parseLogic', 'createModel', 'compileSimulation',
      'initialSimState', 'adoptSimState', 'settle', 'clockLevel', 'nextClockEdge', 'buildLattice', 'latticeOf', 'pointAt',
      'buildCanvas', 'autoPlaceAndRoute',
    ];
    const exported = api as unknown as Record<string, unknown>;
    for (const name of names) expect(typeof exported[name], name).toBe('function');
    expect(api.MB102_LAYOUT.id).toBe('MB102');
    expect(api.DEFAULT_ROUTING_CONFIG.weights.crossing).toBe(1000);
  });

  it('round-trips a simulation state and result through JSON', () => {
    const sim = api.compileSimulation(acceptanceCircuit());
    const { state, result } = api.settle(sim, api.initialSimState(sim), { pressed: {}, clocks: {} });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('round-trips a routing result through JSON', () => {
    const result = api.autoRoute(acceptanceCircuit());
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('renders the board as text with pins, bodies and wires', () => {
    const c = acceptanceCircuit();
    const before = api.renderAscii(c);
    const lines = before.split('\n');
    expect(lines).toHaveLength(20);
    expect(lines[2].startsWith('T- ')).toBe(true);
    expect(lines[5].startsWith('A  ')).toBe(true);
    expect(before).toContain('U');
    expect(before).toContain('#');
    const after = api.renderAscii(c, api.autoRoute(c).wires);
    expect(after).toMatch(/[─│┌┐└┘]/);
    expect(after).not.toContain('*');
  });
});
