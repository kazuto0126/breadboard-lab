import { describe, expect, it } from 'vitest';
import { parseHoleName } from '../../src/core/breadboard/naming';
import { getBoard } from '../../src/core/breadboard/registry';
import { groupOfPoint, indexCircuit, pinPoint } from '../../src/core/circuit/circuitIndex';
import { connectPowerToNearestRails, nearestRailGroup } from '../../src/core/circuit/powerRails';
import { circuit, comp, straightWire } from '../../src/editor/builder';
import type { Circuit } from '../../src/types/circuit';

/** 子專案 34（規格 2026-10-19 nearest-power-rails）：電源腳接最近的軌。 */

const groupOf = (layout: 'MB102' | 'EIC1106', name: string) => {
  const board = getBoard(layout, 'b1');
  const p = parseHoleName(board, name);
  if (!p) throw new Error(name);
  return board.nodes[(p.y - 1) * board.width + (p.x - 1)].groupId!;
};

/** 每條導線兩端的群組。 */
function wireGroups(c: Circuit): Array<[string, string]> {
  const index = indexCircuit(c);
  return c.wires.map((w) => [groupOfPoint(index, w.start)!, groupOfPoint(index, w.end)!]);
}
const isRail = (g: string) => g.includes(':rail-');
/** 符號（vcc / gnd）所在的軌。 */
function symbolRails(c: Circuit): string[] {
  const index = indexCircuit(c);
  return c.components
    .filter((x) => x.defId === 'vcc' || x.defId === 'gnd')
    .map((x) => `${x.defId}@${groupOfPoint(index, pinPoint(index, { componentId: x.id, pinNumber: 1 })!)}`)
    .sort();
}

describe('the nearest rail', () => {
  it('is the rail pair next to each half of an MB-102', () => {
    const board = getBoard('MB102', 'b1');
    expect(nearestRailGroup(board, groupOf('MB102', 'E10'), '+')).toBe('b1:rail-T+');
    expect(nearestRailGroup(board, groupOf('MB102', 'E10'), '-')).toBe('b1:rail-T-');
    expect(nearestRailGroup(board, groupOf('MB102', 'F10'), '+')).toBe('b1:rail-B+');
    expect(nearestRailGroup(board, groupOf('MB102', 'F10'), '-')).toBe('b1:rail-B-');
  });

  it('stays next to its own terminal area on an EIC-1106', () => {
    const board = getBoard('EIC1106', 'b1');
    expect(nearestRailGroup(board, groupOf('EIC1106', '2-E10'), '+')).toBe('b1:rail-P3+');
    expect(nearestRailGroup(board, groupOf('EIC1106', '2-F10'), '+')).toBe('b1:rail-P4+');
    expect(nearestRailGroup(board, groupOf('EIC1106', '1-A10'), '-')).toBe('b1:rail-P2-');
    expect(nearestRailGroup(board, groupOf('EIC1106', '3-J10'), '-')).toBe('b1:rail-P5-');
  });
});

describe('connecting power pins to the nearest rails', () => {
  it('moves far connections to the nearest rails, adds symbols there and drops unused ones', () => {
    // 74LS00 在 F10：第 14 腳 VCC 在 E10（上半部）、第 7 腳 GND 在 F16（下半部）；符號和連線都在遠的那一邊。
    const c = circuit(
      [comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'T-3')],
      [straightWire('w1', 'E10', 'B+5'), straightWire('w2', 'F16', 'T-5')],
    );
    const r = connectPowerToNearestRails(c);
    const pairs = wireGroups(r.circuit);
    expect(pairs.some(([a, b]) => isRail(a) && isRail(b))).toBe(false);
    expect(pairs.map((p) => [...p].sort().join(' '))).toEqual(
      expect.arrayContaining([`${groupOf('MB102', 'E10')} b1:rail-T+`, `${groupOf('MB102', 'F16')} b1:rail-B-`].map((s) => s.split(' ').sort().join(' '))),
    );
    expect(r.removed.sort()).toEqual(['G1', 'V1']);
    expect(r.added.map((x) => x.id).sort()).toEqual(['G2', 'V2']);
    expect(symbolRails(r.circuit)).toEqual(['gnd@b1:rail-B-', 'vcc@b1:rail-T+']);
    // 新的符號放在第 3 欄起第一個空孔。
    expect(r.added.every((x) => x.anchor.x >= 3)).toBe(true);
  });

  it('gives every group its own wire to the rail and keeps one symbol per rail', () => {
    const c = circuit(
      [comp('U1', '74LS00', 'F10'), comp('U2', '74LS00', 'F20'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')],
      [straightWire('w1', 'E10', 'D20'), straightWire('w2', 'C20', 'T+6'), straightWire('w3', 'F16', 'G26'), straightWire('w4', 'H26', 'B-6')],
    );
    const r = connectPowerToNearestRails(c);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    const pairs = wireGroups(r.circuit).map((p) => [...p].sort().join(' '));
    expect(pairs.sort()).toEqual(
      [
        [groupOf('MB102', 'E10'), 'b1:rail-T+'],
        [groupOf('MB102', 'E20'), 'b1:rail-T+'],
        [groupOf('MB102', 'F16'), 'b1:rail-B-'],
        [groupOf('MB102', 'F26'), 'b1:rail-B-'],
      ]
        .map((p) => p.sort().join(' '))
        .sort(),
    );
    expect(r.circuit.wires.every((w) => (w.color === '#d32f2f' || w.color === '#212121') && w.straight === true)).toBe(true);
  });

  it('leaves signal wires alone and changes nothing that is already nearest', () => {
    const signal = straightWire('sig', 'A12', 'A30');
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')], [straightWire('w1', 'E10', 'T+5'), straightWire('w2', 'F16', 'B-5'), signal]);
    const r = connectPowerToNearestRails(c);
    expect(r.circuit.wires).toContain(signal);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(connectPowerToNearestRails(r.circuit)).toMatchObject({ added: [], removed: [] });
  });
});
