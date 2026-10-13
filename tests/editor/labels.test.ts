import { describe, expect, it } from 'vitest';
import { setLabel } from '../../src/editor/commands';
import { checklistRows } from '../../src/editor/checklist';
import { parseCircuitData, toCircuitFile } from '../../src/editor/fileFormat';
import { circuit, comp, straightWire } from '../fixtures/build';

describe('switch and LED names', () => {
  it('sets, clears and pads names', () => {
    let c = circuit([comp('SW1', 'dipsw-4', 'F10'), comp('D1', 'led', 'A30')]);
    c = setLabel(c, 'SW1', 2, '  Cin ');
    expect(c.components[0].props.labels).toEqual(['', '', 'Cin']);
    c = setLabel(c, 'SW1', 2, 'ABCDEFGHIJK');
    expect(c.components[0].props.labels).toEqual(['', '', 'ABCDEFGH']);
    c = setLabel(c, 'SW1', 2, '   ');
    expect(c.components[0].props.labels).toBeUndefined();
    c = setLabel(c, 'D1', 0, 'X');
    expect(c.components[1].props.labels).toEqual(['X']);
    expect(setLabel(c, 'SW1', 4, 'E')).toBe(c); // 4 位元開關沒有第 5 個
  });

  it('keeps names in saved files and checks their type', () => {
    const c = setLabel(circuit([comp('SW1', 'dipsw-4', 'F10')]), 'SW1', 0, 'A');
    const back = parseCircuitData(JSON.parse(JSON.stringify(toCircuitFile(c, 'x', new Date(0)))));
    expect(back.ok && back.circuit.components[0].props.labels).toEqual(['A']);
    const file = toCircuitFile(c, 'x', new Date(0));
    file.circuit.components[0].props.labels = [1, 2] as never;
    expect(parseCircuitData(file)).toMatchObject({ ok: false, error: expect.stringContaining('文字') });
    file.circuit.components[0].props.labels = ['ABCDEFGHIJ'];
    const cut = parseCircuitData(file);
    expect(cut.ok && cut.circuit.components[0].props.labels).toEqual(['ABCDEFGH']);
  });

  it('shows the names in the wiring checklist', () => {
    // 開關 1 的下側腳 1 在 F10，接到 J20（電阻）；開關 1 名稱 A。
    let c = circuit([comp('SW1', 'dipsw-4', 'F10'), comp('R1', 'resistor', 'J20', { span: 3 })], [straightWire('w1', 'J10', 'I20')]);
    c = setLabel(c, 'SW1', 0, 'A');
    expect(checklistRows(c, {})[0].labels).toEqual(['A']);
  });
});
