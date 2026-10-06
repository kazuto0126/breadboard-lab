import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import {
  checklistProgress,
  checklistRows,
  colorName,
  isChecked,
  naturalCompare,
  pruneChecklist,
  setChecked,
  wireKey,
} from '../../src/editor/checklist';
import { setWireColor } from '../../src/editor/commands';
import { EXAMPLES } from '../../src/editor/examples';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

describe('接線清單的順序', () => {
  it('lists power first, then ground, then signals, in natural order', () => {
    const rows = checklistRows(acceptanceCircuit(), {});
    expect(rows.map((r) => [r.wireId, r.kind])).toEqual([
      ['w1', 'power'],
      ['w2', 'ground'],
      ['w3', 'ground'],
      ['w4', 'ground'],
      ['w7', 'ground'],
      ['w6', 'signal'], // NET_1
      ['w5', 'signal'], // NET_2
    ]);
    expect(rows[0]).toMatchObject({ from: 'T+6', to: 'A10', length: 6, netName: 'VCC', colorName: '其他', done: false });
  });

  it('orders an AI-routed circuit the same way', () => {
    const c = acceptanceCircuit();
    const routed = applyRouting(c, autoRoute(c));
    const kinds = checklistRows(routed, {}).map((r) => r.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => ['power', 'ground', 'signal'].indexOf(a!) - ['power', 'ground', 'signal'].indexOf(b!)));
    expect(new Set(kinds)).toEqual(new Set(['power', 'ground', 'signal']));
  });

  it('puts wires that touch no pins last and sorts names naturally', () => {
    const c = circuit([comp('V1', 'vcc', 'T+5')], [wire('w10', 'A40', 'A45'), wire('w9', 'A30', 'A35'), wire('w2', 'T+6', 'A6')]);
    expect(checklistRows(c, {}).map((r) => [r.wireId, r.kind])).toEqual([
      ['w2', 'power'],
      ['w9', null],
      ['w10', null],
    ]);
    expect(naturalCompare('NET_2', 'NET_10')).toBeLessThan(0);
    expect(naturalCompare('w9', 'w10')).toBeLessThan(0);
  });

  it('names colours in Chinese and boards in multi-board circuits', () => {
    expect(colorName('#D32F2F')).toBe('紅');
    expect(colorName('#123456')).toBe('其他');
    const twoBoards = EXAMPLES.find((e) => e.id === 'two-boards')!.build();
    const crossing = checklistRows(twoBoards, {}).filter((r) => r.from.split(':')[0] !== r.to.split(':')[0]);
    expect(crossing.length).toBeGreaterThan(0);
    for (const r of crossing) expect([r.from, r.to].every((h) => /^b[12]:/.test(h))).toBe(true);
  });
});

describe('勾選狀態', () => {
  const c = acceptanceCircuit();
  const w5 = c.wires.find((w) => w.id === 'w5')!;

  it('ticks and unticks a wire', () => {
    const ticked = setChecked({}, w5, true);
    expect(ticked).toEqual({ w5: wireKey(w5) });
    expect(isChecked(ticked, w5)).toBe(true);
    expect(setChecked(ticked, w5, true)).toBe(ticked);
    expect(setChecked(ticked, w5, false)).toEqual({});
    expect(checklistProgress(ticked, c)).toEqual({ done: 1, total: 7 });
    expect(checklistRows(c, ticked).find((r) => r.wireId === 'w5')?.done).toBe(true);
  });

  it('forgets a tick when the wire is re-routed or recoloured, and remembers it again after undo', () => {
    const ticked = setChecked({}, w5, true);
    const recoloured = setWireColor(c, ['w5'], '#6a1b9a');
    expect(isChecked(ticked, recoloured.wires.find((w) => w.id === 'w5')!)).toBe(false);
    const rerouted = { ...c, wires: c.wires.map((w) => (w.id === 'w5' ? wire('w5', 'J12', 'I12', 'I30', 'J30') : w)) };
    expect(checklistProgress(ticked, rerouted).done).toBe(0);
    expect(checklistProgress(ticked, c).done).toBe(1);
  });

  it('drops stale ticks before saving', () => {
    const state = { ...setChecked({}, w5, true), gone: 'x', w6: 'stale' };
    expect(pruneChecklist(state, c)).toEqual({ w5: wireKey(w5) });
  });
});
