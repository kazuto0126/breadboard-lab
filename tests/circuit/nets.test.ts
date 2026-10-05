import { describe, expect, it } from 'vitest';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets, netByPin, terminalClusters, terminalGroupIds } from '../../src/core/circuit/nets';
import { UnionFind } from '../../src/core/circuit/unionFind';
import { circuit, comp, wire } from '../fixtures/build';

describe('UnionFind', () => {
  it('merges sets and always keeps the smallest id as root', () => {
    const uf = new UnionFind();
    uf.union('b', 'c');
    uf.union('a', 'c');
    expect(uf.find('c')).toBe('a');
    expect(uf.find('b')).toBe('a');
    expect(uf.find('z')).toBe('z');
  });
});

describe('extractNets', () => {
  it('only connects wire endpoints, not the holes a wire passes over', () => {
    const c = circuit(
      [comp('R1', 'resistor', 'C10'), comp('R2', 'resistor', 'C20'), comp('D1', 'led', 'A16')],
      [wire('w1', 'A14', 'A20')],
    );
    const nets = extractNets(c);
    const joined = nets.find((n) => n.pins.some((p) => p.componentId === 'R1' && p.pinNumber === 2))!;
    expect(joined.pins).toEqual([
      { componentId: 'R1', pinNumber: 2 },
      { componentId: 'R2', pinNumber: 1 },
    ]);
    expect(joined.groupIds).toEqual(['b1:c14-top', 'b1:c20-top']);
    expect(nets.find((n) => n.pins.some((p) => p.componentId === 'D1' && p.pinNumber === 1))!.pins).toHaveLength(1);
  });

  it('keeps the two leads of a resistor apart but merges push-button internals', () => {
    const nets = extractNets(circuit([comp('R1', 'resistor', 'A30'), comp('SW1', 'pushbutton', 'F4')]));
    expect(nets.filter((n) => n.pins.some((p) => p.componentId === 'R1'))).toHaveLength(2);
    const sw = nets.filter((n) => n.pins.some((p) => p.componentId === 'SW1'));
    expect(sw).toHaveLength(2);
    expect(sw[0].groupIds).toEqual(['b1:c4-bot', 'b1:c4-top']);
    expect(sw[0].pins).toEqual([
      { componentId: 'SW1', pinNumber: 1 },
      { componentId: 'SW1', pinNumber: 2 },
    ]);
  });

  it('names power, ground and signal nets in a stable order', () => {
    const c = circuit(
      [comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'B-5'), comp('V2', 'vcc', 'A40'), comp('R1', 'resistor', 'A10')],
      [wire('w1', 'T+9', 'C10')],
    );
    const nets = extractNets(c);
    expect(nets.map((n) => [n.id, n.kind])).toEqual([
      ['GND', 'ground'],
      ['VCC', 'power'],
      ['NET_1', 'signal'],
      ['VCC_2', 'power'],
    ]);
    expect(extractNets(c)).toEqual(nets);
    expect(netByPin(nets).get('R1#1')!.id).toBe('VCC');
  });

  it('ignores pins that are not on a hole', () => {
    expect(extractNets(circuit([comp('D1', 'led', [12, 9])]))).toEqual([]);
  });

  it('keeps a pin-less power rail as a terminal group, but not an empty column', () => {
    const c = circuit([comp('V1', 'vcc', 'T+5')], [wire('w1', 'T+7', 'B+7'), wire('w2', 'T+9', 'A30')]);
    const vcc = extractNets(c).find((n) => n.id === 'VCC')!;
    expect(vcc.groupIds).toEqual(['b1:c30-top', 'b1:rail-B+', 'b1:rail-T+']);
    expect(terminalGroupIds(vcc, indexCircuit(c))).toEqual(['b1:rail-B+', 'b1:rail-T+']);
  });

  it('clusters terminal groups that a component already connects internally', () => {
    const c = circuit([comp('G1', 'gnd', 'T-3'), comp('SW1', 'pushbutton', 'F4')], [wire('w1', 'T-4', 'A4')]);
    const index = indexCircuit(c);
    const gnd = extractNets(c).find((n) => n.id === 'GND')!;
    expect(terminalGroupIds(gnd, index)).toEqual(['b1:c4-bot', 'b1:c4-top', 'b1:rail-T-']);
    expect(terminalClusters(gnd, index)).toEqual([['b1:c4-bot', 'b1:c4-top'], ['b1:rail-T-']]);
  });
});
