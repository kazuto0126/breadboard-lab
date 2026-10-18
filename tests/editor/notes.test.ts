import { describe, expect, it } from 'vitest';
import { removeItems } from '../../src/editor/commands';
import { parseHoleLabel } from '../../src/editor/analysis';
import { addNote, moveNote, NOTE_MAX, removeNote, setNoteColor, setNoteHole, setNoteTarget, setNoteText } from '../../src/editor/notes';
import { circuit, comp } from '../fixtures/build';

const base = () => circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'A30')]);

describe('notes on the board', () => {
  it('adds notes snapped to the 0.1 inch grid with new ids', () => {
    const a = addNote(base(), 10, 20);
    expect(a.id).toBe('n1');
    expect(a.circuit.notes).toEqual([{ id: 'n1', x: 10.16, y: 20.32, text: '', color: 'yellow' }]);
    const b = addNote(a.circuit, -5.2, 0);
    expect(b.id).toBe('n2');
    expect(b.circuit.notes![1]).toMatchObject({ x: -5.08, y: 0 });
  });

  it('moves, edits, recolours and removes, keeping the same circuit when nothing changes', () => {
    let { circuit: c } = addNote(base(), 0, 0);
    expect(moveNote(c, 'n1', 1, 1)).toBe(c); // 對齊後還是 0, 0
    c = moveNote(c, 'n1', 25.4, 2.54);
    expect(c.notes![0]).toMatchObject({ x: 25.4, y: 2.54 });
    c = setNoteText(c, 'n1', '  先接電源\n再接 LED  ');
    expect(c.notes![0].text).toBe('先接電源\n再接 LED');
    expect(setNoteText(c, 'n1', '先接電源\n再接 LED')).toBe(c);
    expect(setNoteText(c, 'n1', 'x'.repeat(300)).notes![0].text).toHaveLength(NOTE_MAX);
    c = setNoteColor(c, 'n1', 'blue');
    expect(c.notes![0].color).toBe('blue');
    expect(setNoteColor(c, 'n1', 'blue')).toBe(c);
    expect(setNoteTarget(c, 'n1', 'U9')).toBe(c); // 沒有這個元件
    c = setNoteTarget(c, 'n1', 'U1');
    expect(c.notes![0].target).toBe('U1');
    c = setNoteTarget(c, 'n1', null);
    expect(c.notes![0]).not.toHaveProperty('target');
    expect(removeNote(c, 'n9')).toBe(c);
    expect(removeNote(c, 'n1')).not.toHaveProperty('notes');
  });

  it('drops the pointer when the target component is deleted', () => {
    let { circuit: c } = addNote(base(), 0, 0);
    c = setNoteTarget(c, 'n1', 'U1');
    const after = removeItems(c, { componentIds: ['U1'] });
    expect(after.notes![0]).not.toHaveProperty('target');
    expect(removeItems(c, { componentIds: ['R1'] }).notes).toBe(c.notes);
  });
});

describe('notes in saved files', () => {
  it('round-trips notes, leaves the field out when there are none, and checks the format', async () => {
    const { parseCircuitData, toCircuitFile } = await import('../../src/editor/fileFormat');
    let { circuit: c } = addNote(base(), 5.08, 7.62);
    c = setNoteTarget(setNoteText(c, 'n1', '先接電源'), 'n1', 'U1');
    const back = parseCircuitData(JSON.parse(JSON.stringify(toCircuitFile(c, 'x', new Date(0)))));
    expect(back.ok && back.circuit.notes).toEqual([{ id: 'n1', x: 5.08, y: 7.62, text: '先接電源', color: 'yellow', target: 'U1' }]);
    const plain = parseCircuitData(JSON.parse(JSON.stringify(toCircuitFile(base(), 'x', new Date(0)))));
    expect(plain.ok && plain.circuit).not.toHaveProperty('notes');

    const file = JSON.parse(JSON.stringify(toCircuitFile(c, 'x', new Date(0))));
    file.circuit.notes[0].target = 'U9';
    file.circuit.notes[0].text = 'y'.repeat(250);
    const loose = parseCircuitData(file);
    expect(loose.ok && loose.circuit.notes![0]).not.toHaveProperty('target');
    expect(loose.ok && loose.circuit.notes![0].text).toHaveLength(NOTE_MAX);
    file.circuit.notes[0].color = 'purple';
    expect(parseCircuitData(file)).toMatchObject({ ok: false, error: 'circuit.notes[0].color：顏色不認得（purple）' });
    file.circuit.notes = [{ id: 'n1', x: 0, y: 0, text: '', color: 'yellow' }, { id: 'n1', x: 0, y: 0, text: '', color: 'yellow' }];
    expect(parseCircuitData(file)).toMatchObject({ ok: false, error: expect.stringContaining('便條') });
  });
});

describe('notes do not touch the circuit', () => {
  it('leaves nets and routing alone and survives applying a routing', async () => {
    const { autoRoute } = await import('../../src/core/routing/autoRoute');
    const { applyRouting } = await import('../../src/core/routing/apply');
    const { analyzeCircuit } = await import('../../src/editor/analysis');
    const { straightWire } = await import('../fixtures/build');
    const plain = circuit([comp('R1', 'resistor', 'A10'), comp('R2', 'resistor', 'H20')], [straightWire('w1', 'B14', 'I20')]);
    const noted = setNoteText(addNote(plain, 40, 10).circuit, 'n1', '看這裡');
    expect(analyzeCircuit(noted).nets).toEqual(analyzeCircuit(plain).nets);
    const r = autoRoute(noted);
    expect(r.wires).toEqual(autoRoute(plain).wires);
    expect(applyRouting(noted, r).notes).toBe(noted.notes);
  });
});

describe('notes pointing at a hole (sub-project 29)', () => {
  it('points at a hole instead of a component, and the two replace each other', () => {
    let { circuit: c } = addNote(base(), 0, 0);
    c = setNoteTarget(c, 'n1', 'U1');
    c = setNoteHole(c, 'n1', { boardId: 'b1', x: 12, y: 15 });
    expect(c.notes![0]).toMatchObject({ targetHole: { boardId: 'b1', x: 12, y: 15 } });
    expect(c.notes![0]).not.toHaveProperty('target');
    c = setNoteTarget(c, 'n1', 'U1');
    expect(c.notes![0]).not.toHaveProperty('targetHole');
    c = setNoteHole(c, 'n1', { boardId: 'b1', x: 12, y: 15 });
    expect(setNoteHole(c, 'n1', null).notes![0]).not.toHaveProperty('targetHole');
    // 不存在的板子不變。
    expect(setNoteHole(c, 'n1', { boardId: 'b9', x: 1, y: 1 })).toBe(c);
  });

  it('reads hole names, with the board id when there are several boards', () => {
    expect(parseHoleLabel(base(), 'f12')).toEqual({ ok: true, point: expect.objectContaining({ boardId: 'b1' }) });
    expect(parseHoleLabel(base(), 'Z99')).toEqual({ ok: false, error: '孔位 Z99 不存在' });
  });

  it('round-trips the hole in files and drops it when its board is removed', async () => {
    const { parseCircuitData, toCircuitFile } = await import('../../src/editor/fileFormat');
    const { addBoard, removeBoard } = await import('../../src/editor/boards');
    let { circuit: c } = addNote(base(), 0, 0);
    c = setNoteHole(c, 'n1', { boardId: 'b1', x: 12, y: 15 });
    const back = parseCircuitData(JSON.parse(JSON.stringify(toCircuitFile(c, 'x', new Date(0)))));
    expect(back.ok && back.circuit.notes![0].targetHole).toEqual({ boardId: 'b1', x: 12, y: 15 });
    const added = addBoard(c, 'MB102')!;
    const two = added.circuit;
    const b2 = added.id;
    const pointed = setNoteHole(two, 'n1', { boardId: b2, x: 3, y: 3 });
    expect(removeBoard(pointed, b2)!.notes![0]).not.toHaveProperty('targetHole');
  });
});
