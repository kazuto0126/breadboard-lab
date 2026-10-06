import { describe, expect, it } from 'vitest';
import { analyzeCircuit, groupIdAt, netOfPin, occupancyOf } from '../../src/editor/analysis';
import { acceptanceCircuit } from '../fixtures/circuits';
import { hole } from '../fixtures/build';

describe('analyzeCircuit', () => {
  it('derives nets, lookups, issues and the routing score', () => {
    const c = acceptanceCircuit();
    const a = analyzeCircuit(c);
    expect(a.nets.map((n) => n.name)).toEqual(expect.arrayContaining(['VCC', 'GND']));
    expect(netOfPin(a, { componentId: 'U1', pinNumber: 14 })!.name).toBe('VCC');
    expect(netOfPin(a, { componentId: 'U1', pinNumber: 7 })!.name).toBe('GND');
    expect(a.netByWire.get('w1')!.name).toBe('VCC');
    expect(a.netByGroup.get(groupIdAt(c, hole('J12'))!)).toBe(netOfPin(a, { componentId: 'U1', pinNumber: 3 }));
    // 範例中使用者的手動接線刻意有重疊，留給 AI 標準佈線整理。
    expect(a.issues.map((e) => e.code)).toContain('WIRE_OVERLAP');
    expect(a.errorCount).toBe(a.issues.filter((e) => e.severity === 'error').length);
    expect(a.warningCount).toBe(a.issues.filter((e) => e.severity === 'warning').length);
    expect(a.valid).toBe(false);
    expect(a.routing.score).toBeGreaterThanOrEqual(0);
  });

  it('caches by circuit reference', () => {
    const c = acceptanceCircuit();
    expect(analyzeCircuit(c)).toBe(analyzeCircuit(c));
    expect(analyzeCircuit({ ...c })).not.toBe(analyzeCircuit(c));
    expect(occupancyOf(c, 'b1')).toBe(occupancyOf(c, 'b1'));
  });

  it('finds the group under a point', () => {
    const c = acceptanceCircuit();
    expect(groupIdAt(c, hole('A12'))).toBe('b1:c12-top');
    expect(groupIdAt(c, { boardId: 'b1', x: 12, y: 9 })).toBeNull();
    expect(groupIdAt(c, { boardId: 'zz', x: 1, y: 1 })).toBeNull();
  });
});
