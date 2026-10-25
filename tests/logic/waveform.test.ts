import { describe, expect, it } from 'vitest';
import { sequenceTable, type SequenceTable } from '../../src/logic/evaluate';
import { decadeCounterDiagram, rippleCounterDiagram } from '../../src/logic/examples';
import { waveLanes, waveText } from '../../src/logic/waveform';

/** 子專案 50（規格 2026-10-25 waveform）：時序表畫成波形。 */
const table = (t: SequenceTable) => {
  if (!t.ok) throw new Error(t.reason);
  return t;
};

describe('waveLanes', () => {
  it('has the clock, then each output and display in table order', () => {
    const rip = table(sequenceTable(rippleCounterDiagram(), 8));
    const lanes = waveLanes(rip);
    expect(lanes.map((l) => [l.name, l.kind])).toEqual([['CLK', 'clock'], ['Q0', 'bit'], ['Q1', 'bit'], ['Q2', 'bit']]);
    expect(lanes[1].values).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0]);
    expect(lanes[3].values).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0]);
    // 時脈：第 0 格之前沒有脈衝，之後每格前一個。
    expect(lanes[0].values).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 1]);
    const dec = waveLanes(table(sequenceTable(decadeCounterDiagram(), 10)));
    expect(dec[1]).toMatchObject({ name: 'S1', kind: 'value', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0] });
  });
});

describe('waveText', () => {
  it('draws one line per output with ‾ for 1 and _ for 0', () => {
    const text = waveText(table(sequenceTable(rippleCounterDiagram(), 8)));
    expect(text.split('\n')).toEqual(['CLK .||||||||', 'Q0  _‾_‾_‾_‾_', 'Q1  __‾‾__‾‾_', 'Q2  ____‾‾‾‾_']);
  });

  it('writes ? for unknown values and leaves displays out', () => {
    const t: SequenceTable = { ok: true, clock: 'C', outputs: ['X', 'S1'], display: [false, true], rows: [{ pulse: 0, out: ['X', 0] }, { pulse: 1, out: [1, 3] }] };
    expect(waveText(t).split('\n')).toEqual(['C .|', 'X ?‾']);
  });
});
