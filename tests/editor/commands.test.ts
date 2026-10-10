import { describe, expect, it } from 'vitest';
import {
  addComponent,
  addWire,
  moveComponent,
  moveWireEnd,
  removeItems,
  replaceWires,
  rotateComponent,
  setComponentSpan,
  setWireColor,
  toggleSwitch,
  updateComponentProps,
} from '../../src/editor/commands';
import { circuit, comp, hole, wire } from '../fixtures/build';

describe('component commands', () => {
  it('adds a component with the next id without touching the original circuit', () => {
    const before = circuit([comp('R1', 'resistor', 'A10')]);
    const snapshot = JSON.stringify(before);
    const { circuit: after, id } = addComponent(before, { defId: 'resistor', rotation: 0, props: { resistance: 220 } }, 'b1', {
      x: 20,
      y: 4,
    });
    expect(id).toBe('R2');
    expect(after.components).toHaveLength(2);
    expect(after.components[1]).toEqual({ id: 'R2', defId: 'resistor', boardId: 'b1', anchor: { x: 20, y: 4 }, rotation: 0, props: { resistance: 220 } });
    expect(after.wires).toBe(before.wires);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('moves and rotates components', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'A30')]);
    const moved = moveComponent(c, 'U1', { x: 20, y: 11 });
    expect(moved.components[0].anchor).toEqual({ x: 20, y: 11 });
    expect(moved.components[1]).toBe(c.components[1]);
    expect(moveComponent(c, 'nope', { x: 1, y: 1 })).toBe(c);

    const rotated = rotateComponent(c, 'U1')!;
    expect(rotated.components[0].rotation).toBe(180);
    expect(rotateComponent(c, 'nope')).toBeNull();
  });

  it('flips a crowded IC in place, since 180° uses exactly the same holes', () => {
    const c = circuit([
      comp('U1', '74LS00', 'F10'),
      comp('U2', '74LS00', 'F17'),
      comp('U3', '74LS00', 'F3'),
      comp('R1', 'resistor', 'A10'),
      comp('R2', 'resistor', 'J10'),
    ]);
    const once = rotateComponent(c, 'U1')!;
    expect(once.components[0]).toMatchObject({ rotation: 180, anchor: { x: 16, y: 8 } });
    const twice = rotateComponent(once, 'U1')!;
    expect(twice.components[0]).toMatchObject({ rotation: 0, anchor: { x: 10, y: 11 } });
  });

  it('removes components and wires', () => {
    const c = circuit([comp('R1', 'resistor', 'A10'), comp('D1', 'led', 'A20')], [wire('w1', 'B1', 'B5'), wire('w2', 'C1', 'C5')]);
    const after = removeItems(c, { componentIds: ['R1'], wireIds: ['w2'] });
    expect(after.components.map((x) => x.id)).toEqual(['D1']);
    expect(after.wires.map((x) => x.id)).toEqual(['w1']);
    expect(removeItems(c, {}).components).toBe(c.components);
  });

  it('updates props, span and switch states', () => {
    const c = circuit([comp('R1', 'resistor', 'A10'), comp('SW1', 'dipsw-4', 'F5')]);
    expect(updateComponentProps(c, 'R1', { resistance: 330 }).components[0].props).toEqual({ resistance: 330 });
    expect(setComponentSpan(c, 'R1', 3)!.components[0].span).toBe(3);
    expect(setComponentSpan(c, 'R1', 0)).toBeNull();
    expect(setComponentSpan(c, 'R1', 60)).toBeNull(); // 超出板子
    expect(setComponentSpan(c, 'SW1', 3)).toBeNull(); // 不是兩腳元件
    const toggled = toggleSwitch(c, 'SW1', 2);
    expect(toggled.components[1].props.switchStates).toEqual([false, false, true, false]);
    expect(toggleSwitch(toggled, 'SW1', 2).components[1].props.switchStates).toEqual([false, false, false, false]);
    expect(toggleSwitch(c, 'SW1', 9)).toBe(c);
  });
});

describe('wire commands', () => {
  it('adds a straight manual wire and moves its ends', () => {
    const c = circuit([]);
    const { circuit: after, id } = addWire(c, hole('A1'), hole('C4'), '#2e7d32');
    expect(id).toBe('w1');
    expect(after.wires[0]).toEqual({ id: 'w1', color: '#2e7d32', source: 'manual', straight: true, start: hole('A1'), end: hole('C4'), path: [hole('A1'), hole('C4')] });
    const moved = moveWireEnd(after, 'w1', 'end', hole('E9'));
    expect(moved.wires[0]).toMatchObject({ straight: true, start: hole('A1'), end: hole('E9'), path: [hole('A1'), hole('E9')] });
    const auto = { ...after, wires: [{ ...wire('w9', 'A1', 'A3', 'C3'), source: 'auto' as const }] };
    expect(moveWireEnd(auto, 'w9', 'start', hole('E1')).wires[0]).toMatchObject({ source: 'manual', straight: true, start: hole('E1'), end: hole('C3') });
    expect(moveWireEnd(after, 'nope', 'end', hole('E9'))).toBe(after);
  });

  it('recolours and replaces wires', () => {
    const c = circuit([], [wire('w1', 'B1', 'B5'), wire('w2', 'C1', 'C5')]);
    const recoloured = setWireColor(c, ['w2'], '#d32f2f');
    expect(recoloured.wires.map((w) => w.color)).toEqual(['#888888', '#d32f2f']);
    expect(replaceWires(c, []).wires).toEqual([]);
  });
});
