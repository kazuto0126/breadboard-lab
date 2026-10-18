import { describe, expect, it } from 'vitest';
import { removeNodes } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { parseLogicDiagram } from '../../src/logic/file';
import { addLogicNote, moveLogicNote, removeLogicNote, setLogicNoteColor, setLogicNoteTarget, setLogicNoteText } from '../../src/logic/notes';
import { emptyDiagram } from '../../src/logic/types';

describe('notes on the logic diagram (sub-project 29)', () => {
  it('adds notes on whole grid cells with new ids', () => {
    const a = addLogicNote(emptyDiagram(), 3.4, 5.6);
    expect(a.id).toBe('n1');
    expect(a.diagram.notes).toEqual([{ id: 'n1', x: 3, y: 6, text: '', color: 'yellow' }]);
    const b = addLogicNote(a.diagram, 0, 0);
    expect(b.id).toBe('n2');
  });

  it('moves, edits, recolours, points and removes, keeping the same diagram when nothing changes', () => {
    let d = addLogicNote(majorityDiagram(), 0, 0).diagram;
    d = setLogicNoteText(d, 'n1', '  多數決  ');
    expect(d.notes![0].text).toBe('多數決');
    expect(setLogicNoteText(d, 'n1', '多數決')).toBe(d);
    d = moveLogicNote(d, 'n1', 10.2, 4.7);
    expect(d.notes![0]).toMatchObject({ x: 10, y: 5 });
    d = setLogicNoteColor(d, 'n1', 'green');
    d = setLogicNoteTarget(d, 'n1', 'g4');
    expect(d.notes![0]).toMatchObject({ color: 'green', target: 'g4' });
    expect(setLogicNoteTarget(d, 'n1', 'zz')).toBe(d);
    // 刪掉被指向的閘：便條留著，指向拿掉。
    expect(removeNodes(d, ['g4']).notes![0]).not.toHaveProperty('target');
    const gone = removeLogicNote(d, 'n1');
    expect(gone).not.toHaveProperty('notes');
  });

  it('round-trips through the file format and checks it', () => {
    let d = addLogicNote(majorityDiagram(), 2, 3).diagram;
    d = setLogicNoteTarget(setLogicNoteText(d, 'n1', '輸出'), 'n1', 'o1');
    const back = parseLogicDiagram(JSON.parse(JSON.stringify(d)));
    expect(back.ok && back.diagram.notes).toEqual([{ id: 'n1', x: 2, y: 3, text: '輸出', color: 'yellow', target: 'o1' }]);
    const bad = (notes: unknown) => parseLogicDiagram({ version: 1, nodes: [], wires: [], notes });
    expect(bad([{ id: 'n1', x: 0, y: 0, text: '', color: 'purple' }])).toEqual({ ok: false, error: '便條 n1 的顏色不認得（purple）' });
    expect(bad([{ id: 'n1', x: 0.5, y: 0, text: '', color: 'yellow' }])).toEqual({ ok: false, error: '便條 n1 的位置要是整數' });
    expect(bad([{ id: 'n1', x: 0, y: 0, text: '', color: 'yellow' }, { id: 'n1', x: 0, y: 0, text: '', color: 'yellow' }])).toEqual({ ok: false, error: '便條 id n1 重複' });
    // 指向不存在的元件：忽略指向。
    const loose = bad([{ id: 'n1', x: 0, y: 0, text: 'x', color: 'yellow', target: 'g9' }]);
    expect(loose.ok && loose.diagram.notes![0]).not.toHaveProperty('target');
  });
});
