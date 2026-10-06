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
import { acceptanceCircuit } from '../fixtures/circuits';

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
    expect(JSON.parse(text)).toMatchObject({ format: FILE_FORMAT, version: 1, savedAt: '2026-10-06T00:00:00.000Z' });
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
    expectError({ ...good, boards: [...good.boards, { ...good.boards[0], id: 'b2' }] }, '一塊麵包板');
    expectError({ ...good, components: [{ ...good.components[0], defId: '74LS999' }] }, '74LS999');
    expectError({ ...good, components: [{ ...good.components[0], rotation: 45 }] }, 'rotation');
    expectError({ ...good, components: [{ ...good.components[0], anchor: { x: 1.5, y: 2 } }] }, 'anchor.x');
    expectError({ ...good, components: [good.components[0], good.components[0]] }, '重複');
    expectError({ ...good, components: [{ ...good.components[4], props: { color: 'pink' } }] }, 'LED 顏色');
    expectError({ ...good, wires: [{ ...good.wires[0], path: [good.wires[0].path[0]] }] }, '兩個點');
    expectError({ ...good, wires: [{ ...good.wires[0], start: { boardId: 'zz', x: 1, y: 1 } }] }, '找不到麵包板');
    expectError({ ...good, wires: [{ ...good.wires[0], source: 'robot' }] }, 'source');
  });

  it('drops unknown props instead of keeping junk', () => {
    const good = acceptanceCircuit();
    const raw = { ...good, components: [{ ...good.components[3], props: { resistance: 330, flavour: 'mint' } }] };
    const parsed = parseCircuitData(raw);
    expect(parsed.ok && parsed.circuit.components[0].props).toEqual({ resistance: 330 });
  });
});
