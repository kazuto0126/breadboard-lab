import { describe, expect, it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { applyRouting } from '../../src/core/routing/apply';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { majorityDiagram } from '../../src/logic/examples';
import { toBreadboard } from '../../src/logic/toBreadboard';

describe('buttons as inputs (sub-project 30)', () => {
  it.each(['vcc', 'gnd'] as const)('uses one named button per input and still matches the truth table (buttons to %s)', (switchTo) => {
    const r = toBreadboard(majorityDiagram(), { switchTo, board: 'auto', inputs: 'button' });
    if (!r.ok) throw new Error(r.reason);
    const buttons = r.circuit.components.filter((c) => c.defId === 'pushbutton');
    expect(buttons.map((b) => [b.id, b.props.labels])).toEqual([
      ['BTN1', ['A']],
      ['BTN2', ['B']],
      ['BTN3', ['C']],
    ]);
    expect(r.circuit.components.some((c) => c.defId.startsWith('dipsw'))).toBe(false);
    expect(r.bom).toMatchObject({ switch: null, buttons: 3 });
    expect(checkAgainstDiagram(majorityDiagram(), r.circuit)).toMatchObject({ kind: 'done', result: { rows: 8, mismatches: [] } });
    const routed = autoPlaceAndRoute(r.circuit);
    expect(routed.status).toBe('success');
    const check = checkAgainstDiagram(majorityDiagram(), applyRouting(r.circuit, routed));
    expect(check).toMatchObject({ kind: 'done', result: { rows: 8, mismatches: [] } });
    expect(check.kind === 'done' && check.mapping).toContain(`A → BTN1（按下 = ${switchTo === 'vcc' ? 1 : 0}）`);
  }, 60_000);

  it('explains a named button that is not on a power rail', async () => {
    const { circuit, comp, wire } = await import('../fixtures/build');
    const { addNode, connect } = await import('../../src/logic/edit');
    const { emptyDiagram } = await import('../../src/logic/types');
    // 按鈕 A 只接到 74LS04 的輸入，另一側沒有接 +5 V 或 GND。
    const c = circuit(
      [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('U1', '74LS04', 'F10'), comp('BTN1', 'pushbutton', 'F30', { props: { labels: ['A'] } })],
      [wire('v', 'T+10', 'A10'), wire('g', 'B-16', 'J16'), wire('b2', 'J32', 'J10')],
    );
    let d = emptyDiagram();
    for (const [kind, x, y] of [['INPUT', 0, 0], ['NOT', 6, 0], ['OUTPUT', 12, 0]] as const) {
      const r = addNode(d, kind, x, y);
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    for (const [from, node] of [['i1', 'g1'], ['g1', 'o1']] as const) {
      const r = connect(d, from, { node, pin: 0 });
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    const check = checkAgainstDiagram(d, c);
    expect(check.kind === 'incomplete' && check.issues).toContain('BTN1（A）沒有接到 +5 V 或 GND');
  });
});
