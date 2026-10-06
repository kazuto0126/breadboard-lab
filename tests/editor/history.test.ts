import { describe, expect, it } from 'vitest';
import { emptyHistory, record, redo, redoLabel, undo, undoLabel } from '../../src/editor/history';

describe('history', () => {
  it('undoes and redoes in order with labels', () => {
    let h = emptyHistory<number>();
    h = record(h, 0, '放置 U1');
    h = record(h, 1, '移動 U1');
    let present = 2;
    expect(undoLabel(h)).toBe('移動 U1');
    expect(redoLabel(h)).toBeNull();

    const u1 = undo(h, present)!;
    expect(u1.state).toBe(1);
    expect(u1.label).toBe('移動 U1');
    h = u1.history;
    present = u1.state;
    const u2 = undo(h, present)!;
    expect(u2.state).toBe(0);
    h = u2.history;
    present = u2.state;
    expect(undo(h, present)).toBeNull();
    expect(redoLabel(h)).toBe('放置 U1');

    const r1 = redo(h, present)!;
    expect(r1.state).toBe(1);
    h = r1.history;
    present = r1.state;
    const r2 = redo(h, present)!;
    expect(r2.state).toBe(2);
    expect(redo(r2.history, r2.state)).toBeNull();
  });

  it('clears the redo stack when a new action is recorded', () => {
    let h = record(emptyHistory<string>(), 'a', 'x');
    const step = undo(h, 'b')!;
    h = record(step.history, step.state, 'y');
    expect(h.future).toEqual([]);
    expect(h.past.map((e) => e.state)).toEqual(['a']);
  });

  it('keeps at most `limit` entries', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 10; i++) h = record(h, i, `step ${i}`, 3);
    expect(h.past.map((e) => e.state)).toEqual([7, 8, 9]);
  });
});
