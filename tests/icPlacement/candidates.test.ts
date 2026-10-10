import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { groupOfPoint, indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { icCandidates } from '../../src/core/icPlacement/candidates';
import { placeAt } from '../../src/core/icPlacement/relocate';
import type { Circuit } from '../../src/types/circuit';
import type { IcPlacement } from '../../src/types/routing';
import { board, circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit, twoBoardCircuit } from '../fixtures/circuits';

const candidates = (c: Circuit, id = 'U1') => icCandidates(c, extractNets(c), id);

/** IC 放在 p 時，每支腳所在的導通群組與它佔用的格點。 */
function footprintAt(c: Circuit, id: string, p: IcPlacement) {
  const components = c.components.map((k) => (k.id === id ? placeAt(k, p) : k));
  const index = indexCircuit({ ...c, components });
  const fp = index.placedById.get(id)!.footprint;
  return {
    groups: fp.pins.map((pin) => groupOfPoint(index, pin.point)!),
    cells: [...fp.pins.map((pin) => pin.point), ...fp.blocked].map(nodeIdOf),
  };
}

describe('icCandidates', () => {
  it('lets an IC alone straddle the channel in both directions', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')]);
    const list = candidates(c);
    expect(list).toHaveLength(114);
    expect(list).toContainEqual({ boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0 });
    expect(list).toContainEqual({ boardId: 'b1', anchor: { x: 16, y: 8 }, rotation: 180 });
    expect(list.every((p) => (p.rotation === 0 ? p.anchor.y === 11 : p.rotation === 180 && p.anchor.y === 8))).toBe(true);
    for (const p of list) expect(new Set(footprintAt(c, 'U1', p).groups).size).toBe(14);
  });

  it('gives an IC that starts turned the same choices', () => {
    const turned = circuit([comp('U1', '74LS00', 'E16', { rotation: 180 })]);
    expect(candidates(turned)).toEqual(candidates(circuit([comp('U1', '74LS00', 'F10')])));
  });

  it('never overlaps another component', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('U2', '74LS04', 'F30')]);
    const u2 = footprintAt(c, 'U2', { boardId: 'b1', anchor: { x: 30, y: 11 }, rotation: 0 }).cells;
    const list = candidates(c);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(footprintAt(c, 'U1', p).cells.some((cell) => u2.includes(cell))).toBe(false);
  });

  it('never puts a pin into a strip of another net', () => {
    const c = acceptanceCircuit();
    for (const p of candidates(c)) expect(footprintAt(c, 'U1', p).groups).not.toContain('b1:c34-bot');
  });

  it('may share a strip with a pin of the same net', () => {
    const c = circuit(
      [comp('U1', '74LS00', 'F20'), comp('CLK1', 'clock', 'J3'), comp('CLK2', 'clock', 'J40')],
      [wire('w1', 'I3', 'J20')],
    );
    const list = candidates(c);
    expect(list).toContainEqual({ boardId: 'b1', anchor: { x: 3, y: 11 }, rotation: 0 });
    for (const p of list) expect(footprintAt(c, 'U1', p).groups).not.toContain('b1:c40-bot');
  });

  it('moves to another board of the same group, never to a separate board', () => {
    expect(candidates(twoBoardCircuit()).some((p) => p.boardId === 'b2')).toBe(true);
    const apart = circuit([comp('U1', '74LS00', 'F10')], [], [board('b1'), board('b3', 100, 0)]);
    const list = candidates(apart);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.boardId === 'b1')).toBe(true);
  });
});
