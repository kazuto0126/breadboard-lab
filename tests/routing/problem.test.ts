import { describe, expect, it } from 'vitest';
import { GROUND_COLOR, POWER_COLOR, SIGNAL_PALETTE } from '../../src/core/routing/colors';
import { DEFAULT_ROUTING_CONFIG, mergeConfig } from '../../src/core/routing/config';
import { buildRoutingProblem, describeGroup, toIndex, toPoint } from '../../src/core/routing/problem';
import { circuit, comp, hole, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

describe('mergeConfig', () => {
  it('fills defaults and applies partial overrides', () => {
    const c = mergeConfig({ weights: { via: 9 }, timeBudgetMs: 100 });
    expect(c.weights).toEqual({ distance: 1, wire: 6, via: 9, crossing: 1000, congestion: 2 });
    expect(c.timeBudgetMs).toBe(100);
    expect(c.negotiation).toEqual(DEFAULT_ROUTING_CONFIG.negotiation);
    expect(mergeConfig()).toEqual(DEFAULT_ROUTING_CONFIG);
  });

  it('merges the IC placement settings', () => {
    expect(mergeConfig().placement).toEqual({ candidatesPerIc: 3, maxPasses: 2, timeBudgetMs: 20000, candidateIterations: 30 });
    expect(mergeConfig({ placement: { maxPasses: 1 } }).placement).toEqual({ candidatesPerIc: 3, maxPasses: 1, timeBudgetMs: 20000, candidateIterations: 30 });
  });
});

describe('buildRoutingProblem', () => {
  const problem = buildRoutingProblem(acceptanceCircuit(), DEFAULT_ROUTING_CONFIG);
  const idx = (name: string) => {
    const p = hole(name);
    return toIndex(problem, p.x, p.y);
  };

  it('knows which groups hold pins, which are rails, and which net owns each terminal group', () => {
    expect(problem.pinGroups.has('b1:c10-bot')).toBe(true); // U1 第 1 腳 F10
    expect(problem.pinGroups.has('b1:c40-top')).toBe(false);
    expect(problem.railGroups.has('b1:rail-T+')).toBe(true);
    expect(problem.railGroups.has('b1:c10-bot')).toBe(false);
    for (const net of problem.nets) for (const g of net.terminalGroups) expect(problem.groupOwner.get(g)).toBe(net.netId);
  });

  it('converts between lattice indices and points', () => {
    expect(toIndex(problem, 12, 4)).toBe(3 * 63 + 11);
    expect(toPoint(problem, 3 * 63 + 11)).toEqual({ boardId: 'b1', x: 12, y: 4 });
  });

  it('blocks component pins and bodies but not free holes', () => {
    expect(problem.blocked[idx('E10')]).toBe(1);
    expect(problem.blocked[toIndex(problem, 12, 9)]).toBe(1);
    expect(problem.blocked[idx('G31')]).toBe(1);
    expect(problem.blocked[idx('H31')]).toBe(0);
    expect(problem.blocked[idx('A10')]).toBe(0);
  });

  it('lists free holes per conductive group in index order', () => {
    expect(problem.freeHoles.get('b1:c10-top')).toEqual(['A10', 'B10', 'C10', 'D10'].map(idx));
    expect(problem.freeHoles.get('b1:c30-bot')).toEqual(['F30', 'H30', 'I30', 'J30'].map(idx));
  });

  it('routes power nets first and records their terminal groups', () => {
    expect(problem.nets.slice(0, 2).map((n) => n.netId).sort()).toEqual(['GND', 'VCC']);
    const vcc = problem.nets.find((n) => n.netId === 'VCC')!;
    expect(vcc.terminalGroups).toEqual(['b1:c10-top', 'b1:rail-T+']);
    expect(vcc.clusters).toEqual([['b1:c10-top'], ['b1:rail-T+']]);
    expect(vcc.startCluster).toBe(1);
    expect(vcc.color).toBe(POWER_COLOR);
    const gnd = problem.nets.find((n) => n.netId === 'GND')!;
    expect(gnd.terminalGroups).toEqual(['b1:c10-bot', 'b1:c11-bot', 'b1:c16-bot', 'b1:c41-bot', 'b1:rail-B-']);
    expect(gnd.color).toBe(GROUND_COLOR);
  });

  it('colours routable signal nets from the palette in net order', () => {
    expect(problem.nets.find((n) => n.netId === 'NET_1')!.color).toBe(SIGNAL_PALETTE[0]);
    expect(problem.nets.find((n) => n.netId === 'NET_2')!.color).toBe(SIGNAL_PALETTE[1]);
  });

  it('marks free holes of routed terminal groups for the congestion cost', () => {
    expect(problem.terminalHole[idx('A10')]).toBe(1);
    expect(problem.terminalHole[idx('A40')]).toBe(0);
    expect(problem.terminalHole[idx('E10')]).toBe(0);
  });

  it('keeps a pin-less power rail that the user bridged', () => {
    const c = circuit([comp('V1', 'vcc', 'T+5'), comp('R1', 'resistor', 'G30')], [wire('w1', 'T+7', 'B+7'), wire('w2', 'B+30', 'J30')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    expect(p.nets.find((n) => n.netId === 'VCC')!.terminalGroups).toEqual(['b1:c30-bot', 'b1:rail-B+', 'b1:rail-T+']);
  });

  it('treats a push button as one cluster and starts from the cluster with the most pins', () => {
    const c = circuit(
      [comp('SW1', 'pushbutton', 'F4'), comp('D1', 'led', 'C20'), comp('D2', 'led', 'C30')],
      [wire('w1', 'A4', 'A20'), wire('w2', 'B20', 'A30')],
    );
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.terminalGroups.includes('b1:c4-top'))!;
    expect(net.clusters).toEqual([['b1:c20-top'], ['b1:c30-top'], ['b1:c4-bot', 'b1:c4-top']]);
    expect(net.startCluster).toBe(2);
  });

  it('describes groups for students', () => {
    expect(describeGroup('b1:c12-top')).toBe('第 12 欄上半（A–E）');
    expect(describeGroup('b1:c12-bot')).toBe('第 12 欄下半（F–J）');
    expect(describeGroup('b1:rail-T+')).toBe('T+ 電源軌');
  });

  it('needs every board in one board group for a single problem', () => {
    const c = acceptanceCircuit();
    c.boards.push({ id: 'b2', layoutId: 'MB102', x: 0, y: 400, groupId: null });
    expect(() => buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG)).toThrow('exactly one board group');
  });

  it('adds the board prefix to group descriptions on request', () => {
    expect(describeGroup('b2:c7-bot', true)).toBe('b2 第 7 欄下半（F–J）');
  });
});
