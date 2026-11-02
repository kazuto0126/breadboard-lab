import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { EXAMPLES } from '../../src/editor/examples';
import {
  emptyCircuit,
  FILE_FORMAT,
  parseCircuitData,
  parseCircuitText,
  serializeCircuitFile,
  toCircuitFile,
} from '../../src/editor/fileFormat';
import { normalizeBoardGroups } from '../../src/editor/boards';
import { board, circuit, holeOn, latticeWire, pt, straightWire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';
import { holeName } from '../../src/core/breadboard/naming';
import { getBoard } from '../../src/core/breadboard/registry';
import { resolveFootprint } from '../../src/core/circuit/footprint';
import { getComponentDefinition } from '../../src/core/circuit/library';

function expectError(raw: unknown, fragment: string) {
  const result = parseCircuitData(raw);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
}

describe('circuit files', () => {
  it('round-trips a circuit with its name', () => {
    const circuit = acceptanceCircuit();
    const text = serializeCircuitFile(circuit, '我的電路', new Date('2026-10-06T00:00:00Z'));
    const parsed = parseCircuitText(text);
    expect(parsed).toEqual({ ok: true, circuit, name: '我的電路' });
    expect(JSON.parse(text)).toMatchObject({ format: FILE_FORMAT, version: 2, savedAt: '2026-10-06T00:00:00.000Z' });
  });

  it('accepts a bare circuit object and an empty circuit', () => {
    expect(parseCircuitData(acceptanceCircuit())).toEqual({ ok: true, circuit: acceptanceCircuit(), name: null });
    const empty = emptyCircuit();
    expect(parseCircuitData(empty)).toEqual({ ok: true, circuit: empty, name: null });
    expect(validateCircuit(empty).map((e) => e.code)).toEqual(['CIRCUIT_VALID']);
  });

  it('keeps every example loadable', () => {
    for (const example of EXAMPLES) {
      const circuit = example.build();
      expect(parseCircuitText(JSON.stringify(toCircuitFile(circuit, example.name)))).toEqual({ ok: true, circuit, name: example.name });
    }
  });

  it('explains what is wrong with a broken file', () => {
    expect(parseCircuitText('{oops').ok).toBe(false);
    expectError(42, 'JSON 物件');
    expectError({ format: 'something-else' }, '不是 Breadboard Lab');
    expectError({ format: FILE_FORMAT, version: 9, circuit: {} }, '檔案版本');
    const good = acceptanceCircuit();
    expectError({ ...good, version: 2 }, 'circuit.version');
    expectError({ ...good, boards: [...good.boards, { ...good.boards[0], id: 'b2' }] }, '重疊');
    expectError({ ...good, boards: [...good.boards, { ...good.boards[0], y: 50.8 }] }, '麵包板 ID「b1」重複');
    expectError({ ...good, boards: [] }, '至少要有一塊');
    expectError({ ...good, boards: Array.from({ length: 9 }, (_, i) => ({ ...good.boards[0], id: `b${i + 1}`, y: i * 60 })) }, '最多 8 塊');
    expectError({ ...good, components: [{ ...good.components[0], defId: '74LS999' }] }, '74LS999');
    expectError({ ...good, components: [{ ...good.components[0], rotation: 45 }] }, 'rotation');
    expectError({ ...good, components: [{ ...good.components[0], anchor: { x: 1.5, y: 2 } }] }, 'anchor.x');
    expectError({ ...good, components: [good.components[0], good.components[0]] }, '重複');
    expectError({ ...good, components: [{ ...good.components[4], props: { color: 'pink' } }] }, 'LED 顏色');
    expectError({ ...good, wires: [{ ...good.wires[0], path: [good.wires[0].path[0]] }] }, '兩個點');
    expectError({ ...good, wires: [{ ...good.wires[0], start: { boardId: 'zz', x: 1, y: 1 } }] }, '找不到麵包板');
    expectError({ ...good, wires: [{ ...good.wires[0], source: 'robot' }] }, 'source');
  });

  it('loads several boards and derives their board groups from the layout', () => {
    const boards = [board('b1'), board('b2', 0, 20), board('b3', 0, 45)].map((b) => ({ ...b, groupId: 'whatever' }));
    const parsed = parseCircuitData({ ...emptyCircuit(), boards });
    expect(parsed.ok && parsed.circuit.boards.map((b) => [b.id, b.y, b.groupId])).toEqual([
      ['b1', 0, 'g-b1'],
      ['b2', 50.8, 'g-b1'],
      ['b3', 114.3, null],
    ]);
    const stacked = [board('b1'), board('b2', 0, 20)];
    const c = normalizeBoardGroups(circuit([], [latticeWire(stacked, 'w1', holeOn('b1', 'J12'), holeOn('b2', 'A12'))], stacked));
    expect(parseCircuitText(serializeCircuitFile(c, 'two'))).toEqual({ ok: true, circuit: c, name: 'two' });
  });

  it('keeps the wiring checklist in saved files and ignores broken entries', () => {
    const circuit = acceptanceCircuit();
    const file = toCircuitFile(circuit, 'list', new Date('2026-10-06T00:00:00Z'), { w1: 'b1:6,2>b1:10,4|8|#888888' });
    expect(parseCircuitText(JSON.stringify(file))).toEqual({ ok: true, circuit, name: 'list', checklist: file.checklist });
    expect(toCircuitFile(circuit, 'empty', undefined, {})).not.toHaveProperty('checklist');
    const broken = parseCircuitData({ ...toCircuitFile(circuit, 'x'), checklist: { w1: 3, w2: 'ok' } });
    expect(broken.ok && broken.checklist).toEqual({ w2: 'ok' });
    expect(parseCircuitData({ ...toCircuitFile(circuit, 'x'), checklist: ['nope'] })).toEqual({ ok: true, circuit, name: 'x' });
  });

  it('drops unknown props instead of keeping junk', () => {
    const good = acceptanceCircuit();
    const raw = { ...good, components: [{ ...good.components[3], props: { resistance: 330, flavour: 'mint' } }] };
    const parsed = parseCircuitData(raw);
    expect(parsed.ok && parsed.circuit.components[0].props).toEqual({ resistance: 330 });
  });

  // 子專案 57：EIC-1106 的電源軌改成 − 在上、+ 在下；舊檔（version 1）插在電源軌上的東西換到同極性的那一排。
  it('moves things on EIC-1106 rails to the same polarity when opening an old file (sub-project 57)', () => {
    const p = (x: number, y: number) => ({ boardId: 'b1', x, y });
    const old = {
      format: FILE_FORMAT,
      version: 1,
      name: '舊檔',
      circuit: {
        version: 1,
        boards: [{ id: 'b1', layoutId: 'EIC1106', x: 0, y: 0, groupId: null }],
        components: [
          { id: 'V1', defId: 'vcc', boardId: 'b1', anchor: { x: 3, y: 7 }, rotation: 0, props: {} }, // 舊的 P2+3
          { id: 'R1', defId: 'resistor', boardId: 'b1', anchor: { x: 10, y: 21 }, rotation: 90, span: 3, props: {} }, // 1-J10 → 舊的 P3-10
        ],
        wires: [
          { id: 'w1', color: '#d32f2f', source: 'manual', straight: true, start: p(5, 7), end: p(5, 10), path: [p(5, 7), p(5, 10)] }, // 舊的 P2+5 → 1-A5
          { id: 'w2', color: '#212121', source: 'manual', start: p(19, 24), end: p(22, 21), path: [p(19, 24), p(20, 24), p(21, 24), p(22, 24), p(22, 23), p(22, 22), p(22, 21)] }, // 舊的 P3-19 沿著軌走再往上
          { id: 'w3', color: '#888888', source: 'manual', straight: true, start: p(30, 4), end: p(30, 10), path: [p(30, 4), p(30, 10)] }, // 舊的 P1+30 → 1-A30（直直穿過 P1−）
        ],
        notes: [{ id: 'n1', x: 0, y: 0, text: '軌', color: 'yellow', targetHole: p(40, 56) }], // 舊的 P5-40
      },
    };
    const parsed = parseCircuitData(old);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const b = getBoard('EIC1106', 'b1');
    const name = (q: { x: number; y: number }) => holeName(b, { boardId: 'b1', x: q.x, y: q.y });
    const pins = (id: string) => {
      const c = parsed.circuit.components.find((x) => x.id === id)!;
      return resolveFootprint(c, getComponentDefinition(c.defId)!).pins.map((q) => name(q.point));
    };
    expect(pins('V1')).toEqual(['P2+3']);
    expect(pins('R1')).toEqual(['1-J10', 'P3-10']);
    const w = (id: string) => parsed.circuit.wires.find((x) => x.id === id)!;
    expect([name(w('w1').start), name(w('w1').end)]).toEqual(['P2+5', '1-A5']);
    expect(w('w2').path.map((q) => [q.x, q.y])).toEqual([[19, 23], [20, 23], [21, 23], [22, 23], [22, 22], [22, 21]]);
    expect([name(w('w3').start), name(w('w3').end)]).toEqual(['P1+30', '1-A30']);
    expect(parsed.circuit.notes?.[0].targetHole).toEqual(p(40, 55));
    // w2 是舊式在線裡轉彎的線（子專案 39 以前），規則檢查本來就不過；其他都要合法。
    const rest = { ...parsed.circuit, wires: parsed.circuit.wires.filter((x) => x.id !== 'w2') };
    expect(validateCircuit(rest).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  });

  it('leaves MB-102 boards and new files alone', () => {
    const c = circuit([], [straightWire('w1', 'T+5', 'A5')]);
    const v1 = { ...toCircuitFile(c, 'x'), version: 1 };
    expect(parseCircuitData(v1)).toMatchObject({ ok: true, circuit: c });
    const eic = { version: 1 as const, boards: [board('b1', 0, 0, 'EIC1106')], components: [], wires: [straightWire('w1', pt(3, 8), pt(3, 10))] };
    expect(parseCircuitData(toCircuitFile(eic, 'y'))).toMatchObject({ ok: true, circuit: eic });
  });
});
