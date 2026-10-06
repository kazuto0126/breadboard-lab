import { describe, expect, it } from 'vitest';
import {
  addWire,
  applyRoutingResult,
  clearChecklist,
  deleteComponent,
  deleteWire,
  flipWire,
  moveComponent,
  placeComponent,
  rotateComponent,
  setChecklistItem,
  updateComponentProps,
  type CommandResult,
} from '../../src/app/commands/commands';
import { circuitSignature, createProject, type ProjectFile } from '../../src/app/model/projectFile';
import { autoRoute } from '../../src/core/routing/autoRoute';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, hole, pt, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

const docWith = (c: Circuit): ProjectFile => ({ ...createProject(), circuit: c });

function ok(result: CommandResult): ProjectFile {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.doc;
}

describe('placeComponent', () => {
  it('places a part, snaps DIPs across the trench and selects it', () => {
    const result = placeComponent(createProject(), '74LS00', { x: 10, y: 3 });
    expect(result.ok && result.select).toEqual({ kind: 'component', id: 'U1' });
    expect(ok(result).circuit.components[0]).toMatchObject({ id: 'U1', defId: '74LS00', anchor: { x: 10, y: 11 }, rotation: 0 });
  });

  it('refuses a placement that collides with another part', () => {
    const doc = ok(placeComponent(createProject(), '74LS00', { x: 10, y: 11 }));
    expect(placeComponent(doc, '74LS04', { x: 10, y: 11 })).toEqual({ ok: false, reason: '第 1 腳會壓到 U1' });
  });

  it('refuses unknown parts', () => {
    expect(placeComponent(createProject(), 'nope', { x: 10, y: 4 })).toEqual({ ok: false, reason: '未知的元件 nope' });
  });
});

describe('moveComponent', () => {
  it('moves a part to a legal spot and refuses illegal ones', () => {
    const doc = docWith(circuit([comp('R1', 'resistor', 'A30')]));
    expect(ok(moveComponent(doc, 'R1', { x: 40, y: 4 })).circuit.components[0].anchor).toEqual({ x: 40, y: 4 });
    expect(moveComponent(doc, 'R1', { x: 20, y: 9 })).toEqual({ ok: false, reason: '第 1 腳沒有插在孔上' });
    expect(moveComponent(doc, 'R9', { x: 40, y: 4 })).toEqual({ ok: false, reason: '找不到元件 R9' });
  });
});

describe('rotateComponent', () => {
  it('rotates a resistor about its centre', () => {
    const doc = docWith(circuit([comp('R1', 'resistor', 'C20')]));
    expect(ok(rotateComponent(doc, 'R1')).circuit.components[0]).toMatchObject({ rotation: 90, anchor: { x: 22, y: 4 } });
  });

  it('refuses a rotation that would cover another part', () => {
    const doc = docWith(circuit([comp('R1', 'resistor', 'C20'), comp('D1', 'led', 'B22')]));
    expect(rotateComponent(doc, 'R1')).toEqual({ ok: false, reason: '會壓到 D1' });
  });
});

describe('delete', () => {
  it('deletes components and wires and clears the selection', () => {
    const doc = docWith(circuit([comp('U1', '74LS00', 'F10')], [wire('m1', 'A30', 'A40')]));
    const noPart = deleteComponent(doc, 'U1');
    expect(noPart.ok && noPart.select).toBeNull();
    expect(ok(noPart).circuit.components).toEqual([]);
    expect(ok(deleteWire(doc, 'm1')).circuit.wires).toEqual([]);
  });

  it('reports unknown ids', () => {
    const doc = createProject();
    expect(deleteComponent(doc, 'U1')).toEqual({ ok: false, reason: '找不到元件 U1' });
    expect(deleteWire(doc, 'm1')).toEqual({ ok: false, reason: '找不到導線 m1' });
  });
});

describe('addWire', () => {
  it('creates an L-shaped manual wire and selects it', () => {
    const result = addWire(createProject(), hole('A10'), hole('C12'), true, '#212121');
    expect(result.ok && result.select).toEqual({ kind: 'wire', id: 'm1' });
    const w = ok(result).circuit.wires[0];
    expect(w).toMatchObject({ id: 'm1', color: '#212121', source: 'manual', start: hole('A10'), end: hole('C12') });
    expect(w.path.map((p) => [p.x, p.y])).toEqual([[10, 4], [11, 4], [12, 4], [12, 5], [12, 6]]);
  });

  it('refuses a zero-length wire', () => {
    expect(addWire(createProject(), hole('A10'), hole('A10'), true, '#212121')).toEqual({ ok: false, reason: '起點和終點不能是同一個孔' });
  });

  it('refuses ends that are not free holes', () => {
    const doc = docWith(circuit([comp('U1', '74LS00', 'F10')]));
    expect(addWire(doc, hole('E10'), hole('A20'), true, '#212121')).toEqual({ ok: false, reason: '起點要接在空孔上' });
    expect(addWire(doc, hole('A20'), pt(20, 9), true, '#212121')).toEqual({ ok: false, reason: '終點要接在空孔上' });
  });
});

describe('flipWire', () => {
  it('flips a one-corner wire and refuses a straight one', () => {
    const doc = ok(addWire(createProject(), hole('A10'), hole('C12'), true, '#212121'));
    expect(ok(flipWire(doc, 'm1')).circuit.wires[0].path.map((p) => [p.x, p.y])).toEqual([[10, 4], [10, 5], [10, 6], [11, 6], [12, 6]]);
    const straight = docWith(circuit([], [wire('m1', 'A10', 'A20')]));
    expect(flipWire(straight, 'm1')).toEqual({ ok: false, reason: '只有一個轉角的導線才能翻轉' });
  });
});

describe('updateComponentProps', () => {
  it('changes resistance and span', () => {
    const doc = docWith(circuit([comp('R1', 'resistor', 'C20')]));
    expect(ok(updateComponentProps(doc, 'R1', { resistance: 220 })).circuit.components[0].props.resistance).toBe(220);
    expect(ok(updateComponentProps(doc, 'R1', { span: 2 })).circuit.components[0].span).toBe(2);
  });

  it('refuses a span that collides, a span on a non two-lead part, and a non-positive voltage', () => {
    const doc = docWith(circuit([comp('R1', 'resistor', 'C20'), comp('D1', 'led', 'C25'), comp('U1', '74LS00', 'F40'), comp('V1', 'vcc', 'T+5')]));
    expect(updateComponentProps(doc, 'R1', { span: 5 })).toEqual({ ok: false, reason: '第 2 腳會壓到 D1' });
    expect(updateComponentProps(doc, 'U1', { span: 2 })).toEqual({ ok: false, reason: '只有兩腳元件可以調整兩腳距離' });
    expect(updateComponentProps(doc, 'V1', { voltage: 0 })).toEqual({ ok: false, reason: '電壓必須大於 0' });
  });
});

describe('applyRoutingResult', () => {
  it('replaces the wires and records the routing', () => {
    const doc = docWith(acceptanceCircuit());
    const result = autoRoute(doc.circuit);
    const routed = ok(applyRoutingResult(doc, result, 12.5));
    expect(routed.circuit.wires.every((w) => w.source === 'auto')).toBe(true);
    expect(routed.routing).toEqual({
      before: doc.circuit.wires,
      beforeScore: 12.5,
      metrics: result.metrics,
      score: result.score,
      signature: circuitSignature(routed.circuit),
      checklist: {},
    });
  });

  it('refuses results that are not a full success', () => {
    const doc = docWith(acceptanceCircuit());
    const result = autoRoute(doc.circuit);
    expect(applyRoutingResult(doc, { ...result, status: 'partial' }, 0)).toEqual({ ok: false, reason: '只有完整成功的佈線結果才能套用' });
  });
});

describe('checklist', () => {
  it('ticks and clears items only when a routing exists', () => {
    const doc = docWith(acceptanceCircuit());
    expect(setChecklistItem(doc, 'w_GND_1', true)).toBe(doc);
    const routed = ok(applyRoutingResult(doc, autoRoute(doc.circuit), 0));
    const ticked = setChecklistItem(routed, 'w_GND_1', true);
    expect(ticked.routing!.checklist).toEqual({ w_GND_1: true });
    expect(clearChecklist(ticked).routing!.checklist).toEqual({});
  });
});
