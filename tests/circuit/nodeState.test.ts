import { describe, expect, it } from 'vitest';
import { componentLabel, groupInfo, indexCircuit, pinDefinition, pinPoint, propsOf } from '../../src/core/circuit/circuitIndex';
import { getNodeState } from '../../src/core/circuit/nodeState';
import { circuit, comp, hole, pt, wire } from '../fixtures/build';

const c = circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'G30', { props: { resistance: 220 } })], [wire('w1', 'A20', 'A25')]);

describe('indexCircuit', () => {
  const index = indexCircuit(c);

  it('indexes pins and bodies by node id', () => {
    expect(index.pinsAt.get('b1:10,8')).toEqual([{ componentId: 'U1', pinNumber: 14 }]);
    expect(index.bodiesAt.get('b1:12,9')).toEqual(['U1']);
    expect(index.bodiesAt.get('b1:31,12')).toEqual(['R1']);
  });

  it('answers pin and group questions', () => {
    expect(pinPoint(index, { componentId: 'U1', pinNumber: 7 })).toEqual(hole('F16'));
    expect(pinDefinition(index, { componentId: 'U1', pinNumber: 7 })).toEqual({ number: 7, name: 'GND', role: 'ground' });
    expect(groupInfo(index, 'b1:rail-T+')?.kind).toBe('rail');
    expect(groupInfo(index, 'b9:rail-T+')).toBeUndefined();
    expect(propsOf(index.placedById.get('R1')!)).toEqual({ resistance: 220 });
    expect(componentLabel(index.placedById.get('U1')!)).toBe('74LS00 (U1)');
  });

  it('rejects unknown component definitions', () => {
    expect(() => indexCircuit(circuit([comp('X1', 'nope', 'A1')]))).toThrow('Unknown component definition');
  });
});

describe('getNodeState', () => {
  it('reports a component pin', () => {
    const s = getNodeState(c, hole('E10'))!;
    expect(s.name).toBe('E10');
    expect(s.groupId).toBe('b1:c10-top');
    expect(s.pin).toEqual({ componentId: 'U1', pinNumber: 14 });
    expect(s.occupied).toBe(true);
    expect(s.routable).toBe(false);
  });

  it('reports the IC body over the trench', () => {
    const s = getNodeState(c, pt(12, 9))!;
    expect(s.kind).toBe('surface');
    expect(s.blockedBy).toEqual(['U1']);
    expect(s.routable).toBe(false);
  });

  it('reports wire ends and wire passes', () => {
    expect(getNodeState(c, hole('A20'))!.wireEnds).toEqual(['w1']);
    const pass = getNodeState(c, hole('A22'))!;
    expect(pass.wirePasses).toEqual(['w1']);
    expect(pass.occupied).toBe(true);
    expect(pass.routable).toBe(true);
  });

  it('reports free holes and off-board points', () => {
    const free = getNodeState(c, hole('A40'))!;
    expect(free.occupied).toBe(false);
    expect(free.routable).toBe(true);
    expect(getNodeState(c, pt(0, 0))).toBeNull();
  });
});
