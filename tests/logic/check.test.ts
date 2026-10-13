import { describe, expect, it } from 'vitest';
import { checkDiagram } from '../../src/logic/check';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

const ok = (r: { diagram: LogicDiagram }) => r.diagram;

describe('checkDiagram', () => {
  it('finds nothing wrong with figure 2-5', () => {
    expect(checkDiagram(majorityDiagram())).toEqual([]);
  });

  it('lists open pins, unused outputs and missing terminals', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'AND', 4, 0));
    const codes = checkDiagram(d).map((i) => [i.code, i.severity, i.message]);
    expect(codes).toEqual([
      ['LOGIC_NO_IO', 'warning', '邏輯圖還沒有輸入端'],
      ['LOGIC_NO_IO', 'warning', '邏輯圖還沒有輸出端'],
      ['LOGIC_INPUT_OPEN', 'warning', 'g1（AND）第 1 個輸入沒有接線，值不確定'],
      ['LOGIC_INPUT_OPEN', 'warning', 'g1（AND）第 2 個輸入沒有接線，值不確定'],
      ['LOGIC_UNUSED', 'warning', 'g1（AND）的輸出沒有接到任何地方'],
    ]);
    d = ok(addNode(d, 'OUTPUT', 12, 1));
    expect(checkDiagram(d).some((i) => i.code === 'LOGIC_OUTPUT_OPEN' && i.message === '輸出 X 沒有接到任何閘')).toBe(true);
  });

  it('reports loops as errors first', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'OR', 0, 0));
    d = ok(addNode(d, 'OR', 10, 0));
    d = ok(connect(d, 'g1', { node: 'g2', pin: 0 }));
    d = ok(connect(d, 'g2', { node: 'g1', pin: 0 }));
    const [first] = checkDiagram(d);
    expect(first).toMatchObject({ code: 'LOGIC_LOOP', severity: 'error' });
    expect(first.message).toMatch(/^g1、g2 形成迴圈/);
  });
});
