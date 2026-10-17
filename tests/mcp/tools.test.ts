import { describe, expect, it } from 'vitest';
import { checkPlacement } from '../../src/editor/placement';
import { addWire, checkCircuit, circuitSummary, listParts, newLabFile, parseHole, placePart, remove, setPart, type LabFile, type ToolResult } from '../../src/mcp/tools';
import { emptyDiagram } from '../../src/logic/types';
import { board, circuit } from '../fixtures/build';

/** 成功時回傳新的檔案；失敗就讓測試失敗並印出原因。 */
function okFile(r: ToolResult): LabFile {
  if (r.error || !r.file) throw new Error(`tool failed: ${r.text}`);
  return r.file;
}
function failed(r: ToolResult): string {
  expect(r.error).toBe(true);
  expect(r.file).toBeUndefined();
  return r.text;
}

describe('hole names', () => {
  it('reads hole names, and asks for a board id when there are several boards', () => {
    const one = newLabFile('x', 'MB102').circuit;
    expect(parseHole(one, 'F10')).toEqual({ ok: true, point: { boardId: 'b1', x: 10, y: expect.any(Number) } });
    expect(parseHole(one, 'b1:F10')).toMatchObject({ ok: true });
    expect(parseHole(one, 'Z99')).toEqual({ ok: false, error: '孔位 Z99 不存在' });
    const two = circuit([], [], [board('b1', 0, 0), board('b2', 0, 50.8)]);
    expect(parseHole(two, 'F10')).toEqual({ ok: false, error: '有好幾塊麵包板，孔位前面要加板子 ID（例如 b2:F10）' });
    expect(parseHole(two, 'b2:F10')).toMatchObject({ ok: true, point: { boardId: 'b2' } });
    expect(parseHole(two, 'b9:F10')).toEqual({ ok: false, error: '沒有麵包板 b9' });
  });
});

describe('reading and checking', () => {
  it('summarises the circuit the same way as the brief sent to Gemini', () => {
    let f = newLabFile('x', 'MB102');
    f = okFile(placePart(f, { part: '74LS00', hole: 'F10' }));
    const text = circuitSummary(f).text;
    expect(text).toContain('【電路摘要】');
    expect(text).toContain('第 14 腳 VCC @ E10');
  });

  it('lists problems with why and how to fix them', () => {
    let f = newLabFile('x', 'MB102');
    f = okFile(placePart(f, { part: '74LS00', hole: 'F10' }));
    const text = checkCircuit(f).text;
    expect(text).toMatch(/錯誤 \d+ 個、警告 \d+ 個/);
    expect(text).toContain('VCC 未連接');
    expect(text).toContain('為什麼：');
    expect(text).toContain('建議：');
    expect(checkCircuit(newLabFile('x', 'MB102')).text).toContain('沒有元件');
  });

  it('lists parts, with pins when the list is short', () => {
    const all = listParts({}).text;
    expect(all).toContain('74LS00');
    expect(all).toContain('resistor-220');
    expect(all).toContain('dipsw-4');
    const nand = listParts({ query: '74LS00' }).text;
    expect(nand).toContain('腳位：1 1A、2 1B、3 1Y');
    expect(failed(listParts({ query: 'zzz' }))).toBe('找不到符合「zzz」的元件');
  });
});

describe('editing', () => {
  it('starts an empty circuit on the chosen board', () => {
    expect(newLabFile('lab', 'EIC1106')).toEqual({ name: 'lab', circuit: expect.objectContaining({ boards: [expect.objectContaining({ layoutId: 'EIC1106' })], components: [], wires: [] }), logic: emptyDiagram() });
  });

  it('places parts where asked, explains why a spot does not work, and finds a spot by itself', () => {
    let f = newLabFile('x', 'MB102');
    const r = placePart(f, { part: '74LS00', hole: 'F10' });
    expect(r.text).toMatch(/^放好 U1（74LS00）：第 1 腳 1A @ F10、/);
    f = okFile(r);
    expect(failed(placePart(f, { part: '74LS04', hole: 'F12' }))).toMatch(/^74LS04 不能放在 F12：.*已經被別的元件或導線佔用/);
    expect(failed(placePart(f, { part: '74LS04', hole: 'A10' }))).toContain('IC 要跨過中間的凹槽');
    expect(failed(placePart(f, { part: 'nope', hole: 'A1' }))).toBe('沒有元件 nope；用 list_parts 查元件名稱');
    expect(failed(placePart(f, { part: 'led-red', hole: 'A1', id: 'U1' }))).toBe('ID U1 已經有元件了');
    // 沒給孔位：自動找一個合法的位置。
    const auto = okFile(placePart(f, { part: '74LS04' }));
    const u2 = auto.circuit.components.find((c) => c.id === 'U2')!;
    expect(checkPlacement(auto.circuit, u2).ok).toBe(true);
    // 指定 ID、旋轉
    const led = okFile(placePart(f, { part: 'led-red', hole: 'A30', id: 'LED_X', rotation: 90 }));
    expect(led.circuit.components.at(-1)).toMatchObject({ id: 'LED_X', defId: 'led', rotation: 90 });
  });

  it('adds straight wires and explains the ones that are not allowed', () => {
    let f = okFile(placePart(newLabFile('x', 'MB102'), { part: '74LS00', hole: 'F10' }));
    const r = addWire(f, { from: 'T+10', to: 'A10' });
    expect(r.text).toBe('接好 w1：T+10 → A10');
    f = okFile(r);
    expect(f.circuit.wires[0]).toMatchObject({ id: 'w1', straight: true });
    expect(failed(addWire(f, { from: 'F5', to: 'F20' }))).toMatch(/^不能接 F5 → F20：/);
    expect(failed(addWire(f, { from: 'A10', to: 'A10' }))).toBe('不能接 A10 → A10：起點和終點是同一個孔');
    expect(failed(addWire(f, { from: 'A3', to: 'Q9' }))).toBe('孔位 Q9 不存在');
  });

  it('sets names, values, colours and switch states, and removes things', () => {
    let f = newLabFile('x', 'MB102');
    f = okFile(placePart(f, { part: 'dipsw-4', hole: 'F30' }));
    f = okFile(placePart(f, { part: 'resistor-220', hole: 'A40' }));
    f = okFile(placePart(f, { part: 'led-red', hole: 'A50' }));
    f = okFile(setPart(f, { id: 'SW1', labels: ['A', 'B'], switches: [true, false, true, false] }));
    expect(f.circuit.components[0].props).toMatchObject({ labels: ['A', 'B'], switchStates: [true, false, true, false] });
    f = okFile(setPart(f, { id: 'R1', resistance: 330 }));
    expect(f.circuit.components[1].props.resistance).toBe(330);
    f = okFile(setPart(f, { id: 'D1', color: 'blue', labels: ['X'] }));
    expect(f.circuit.components[2].props).toMatchObject({ color: 'blue', labels: ['X'] });
    expect(failed(setPart(f, { id: 'R1', color: 'blue' }))).toBe('R1 不是 LED，不能設顏色');
    expect(failed(setPart(f, { id: 'SW1', switches: [true] }))).toBe('SW1 有 4 個開關，switches 要給 4 個');
    expect(failed(setPart(f, { id: 'Z9', labels: ['A'] }))).toBe('沒有元件 Z9');
    f = okFile(addWire(f, { from: 'J30', to: 'J40' }));
    f = okFile(remove(f, { id: 'w1' }));
    expect(f.circuit.wires).toEqual([]);
    f = okFile(remove(f, { id: 'R1' }));
    expect(f.circuit.components.map((c) => c.id)).toEqual(['SW1', 'D1']);
    expect(failed(remove(f, { id: 'R1' }))).toBe('沒有元件或導線 R1');
  });
});

describe('routing and simulation', () => {
  const lab = (c: LabFile['circuit'], logic = emptyDiagram()): LabFile => ({ name: 'x', circuit: c, logic });

  it('routes and describes the result; apply false leaves the file alone', async () => {
    const { acceptanceCircuit } = await import('../fixtures/circuits');
    const { autoRoute } = await import('../../src/mcp/tools');
    const r = autoRoute(lab(acceptanceCircuit()), {});
    expect(r.text).toMatch(/^佈線成功：\d+ 條線/);
    expect(okFile(r).circuit.wires.every((w) => w.source === 'auto')).toBe(true);
    const preview = autoRoute(lab(acceptanceCircuit()), { apply: false });
    expect(preview.file).toBeUndefined();
    expect(preview.error).toBeUndefined();
    expect(preview.text).toContain('沒有寫回檔案');
    expect(autoRoute(lab(acceptanceCircuit()), { move_ics: true }).text).toMatch(/^佈線成功/);
  });

  it('simulates with switch settings that are not saved', async () => {
    const { simulate } = await import('../../src/mcp/tools');
    const { handWired } = await import('../fixtures/handWired');
    const f = lab(handWired({ chip: '74LS86' }));
    // A = 1、B = 0 → XOR = 1；SW1 第 2 個開關是 LED 的致能（ON）。
    const on = simulate(f, { switches: { SW1: [true, true, false, false], SW2: [false, false, false, false] } });
    expect(on.file).toBeUndefined();
    expect(on.text).toContain('亮的 LED：D1');
    const off = simulate(f, { switches: { SW1: [true, true, false, false], SW2: [false, false, true, false] } });
    expect(off.text).toContain('沒有 LED 亮（D1 不亮）');
    expect(failed(simulate(f, { switches: { SW9: [true] } }))).toBe('沒有指撥開關 SW9');
    expect(failed(simulate(f, { switches: { SW1: [true] } }))).toBe('SW1 有 4 個開關，要給 4 個');
  });

  it('reports ICs without power and reads 7-segment displays', async () => {
    const { simulate } = await import('../../src/mcp/tools');
    let f = okFile(placePart(newLabFile('x', 'MB102'), { part: '74LS00', hole: 'F10' }));
    f = okFile(placePart(f, { part: 'vcc', hole: 'T+3' }));
    expect(simulate(f, {}).text).toContain('沒有供電：U1');
    const { toBreadboard } = await import('../../src/logic/toBreadboard');
    const { bcdDiagram } = await import('../../src/logic/examples');
    const r = toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(simulate(lab(r.circuit), {}).text).toContain('DS1 顯示 0');
    // 全暗時說明原因：輸入 15，或根本沒有接到 74LS47。
    const sw = r.circuit.components.find((c) => c.defId.startsWith('dipsw'))!;
    const width = (sw.props.switchStates as boolean[]).length;
    expect(simulate(lab(r.circuit), { switches: { [sw.id]: Array(width).fill(true) } }).text).toContain('DS1 全暗：U1（74LS47）的輸入 DCBA 是 1111');
    const noDecoder = { ...r.circuit, components: r.circuit.components.filter((c) => c.defId !== '74LS47') };
    expect(simulate(lab(noDecoder), {}).text).toContain('DS1 全暗：a–g 都沒有被拉到 0');
  });
});

describe('logic diagram tools', () => {
  const xorRaw = {
    version: 1,
    nodes: [
      { id: 'i1', kind: 'INPUT', name: 'A' },
      { id: 'i2', kind: 'INPUT', name: 'B' },
      { id: 'g1', kind: 'XOR', inputs: 2 },
      { id: 'o1', kind: 'OUTPUT', name: 'X' },
    ],
    wires: [
      { id: 'w1', from: 'i1', to: { node: 'g1', pin: 0 } },
      { id: 'w2', from: 'i2', to: { node: 'g1', pin: 1 } },
      { id: 'w3', from: 'g1', to: { node: 'o1', pin: 0 } },
    ],
  };

  it('lays out nodes without positions by depth and keeps the ones that have them', async () => {
    const { logicSet } = await import('../../src/mcp/tools');
    const f = okFile(logicSet(newLabFile('x', 'MB102'), { diagram: xorRaw }));
    const at = (id: string) => f.logic.nodes.find((n) => n.id === id)!;
    expect([at('i1').x, at('g1').x, at('o1').x]).toEqual([2, 12, 22]);
    expect(at('i1').y).not.toBe(at('i2').y);
    const placed = { ...xorRaw, nodes: xorRaw.nodes.map((n) => (n.id === 'g1' ? { ...n, x: 30, y: 5 } : n)) };
    expect(okFile(logicSet(newLabFile('x', 'MB102'), { diagram: placed })).logic.nodes.find((n) => n.id === 'g1')).toMatchObject({ x: 30, y: 5 });
    expect(logicSet(newLabFile('x', 'MB102'), { diagram: xorRaw }).text).toContain('輸入 2 個、閘 1 個、輸出 1 個');
    const broken = { ...xorRaw, wires: [...xorRaw.wires, { id: 'w4', from: 'zz', to: { node: 'o1', pin: 0 } }] };
    expect(failed(logicSet(newLabFile('x', 'MB102'), { diagram: broken }))).toMatch(/^邏輯圖有問題：/);
  });

  it('keeps the truth table task that is already in the file', async () => {
    const { logicSet } = await import('../../src/mcp/tools');
    const { createTask } = await import('../../src/logic/task');
    const made = createTask(['A', 'B'], ['X']);
    if (!made.ok) throw new Error(made.reason);
    const withTask = { ...newLabFile('x', 'MB102'), logic: { version: 1 as const, nodes: [], wires: [], task: made.task } };
    const r = logicSet(withTask, { diagram: xorRaw });
    expect(okFile(r).logic.task).toEqual(made.task);
    expect(r.text).toContain('保留檔案裡的真值表題目');
  });

  it('prints the truth table', async () => {
    const { logicSet, logicTruthTable } = await import('../../src/mcp/tools');
    const f = okFile(logicSet(newLabFile('x', 'MB102'), { diagram: xorRaw }));
    const text = logicTruthTable(f).text;
    expect(text).toContain('A B | X');
    expect(text).toContain('0 1 | 1');
    expect(text).toContain('1 1 | 0');
    expect(failed(logicTruthTable(newLabFile('x', 'MB102')))).toBe('檔案裡還沒有邏輯圖；用 logic_set 寫入');
  });

  it('converts to a breadboard, routes it and checks it by name', async () => {
    const { logicToBreadboard } = await import('../../src/mcp/tools');
    const { majorityDiagram } = await import('../../src/logic/examples');
    const r = logicToBreadboard({ ...newLabFile('x', 'MB102'), logic: majorityDiagram() }, {});
    const f = okFile(r);
    expect(f.circuit.components.map((c) => c.id)).toEqual(expect.arrayContaining(['SW1', 'U1', 'U2', 'D1']));
    expect(r.text).toContain('74LS08 × 1');
    expect(r.text).toContain('8 種輸入組合，麵包板的模擬結果和真值表全部一致');
    expect(failed(logicToBreadboard(newLabFile('x', 'MB102'), {}))).toBe('檔案裡還沒有邏輯圖；用 logic_set 寫入');
  }, 120_000);

  it('checks a hand-wired board against the diagram by name', async () => {
    const { checkAgainstDiagram } = await import('../../src/mcp/tools');
    const { handWired, gateDiagram } = await import('../fixtures/handWired');
    const named = { sw1: ['A'], sw2: ['', '', 'B'], led: ['X'] };
    const ok = checkAgainstDiagram({ name: 'x', circuit: handWired({ chip: '74LS86', labels: named }), logic: gateDiagram('XOR') });
    expect(ok.text).toContain('全部一致');
    expect(ok.text).toContain('A → SW1 第 1 個開關（ON = 1）');
    const bad = checkAgainstDiagram({ name: 'x', circuit: handWired({ chip: '74LS86', labels: named }), logic: gateDiagram('AND') });
    expect(bad.text).toContain('有 3 列不一致');
    expect(bad.text).toContain('A B = 1 1：應該 X = 1，麵包板 X = 0');
    const none = checkAgainstDiagram({ name: 'x', circuit: handWired({ chip: '74LS86' }), logic: gateDiagram('XOR') });
    expect(none.text).toContain('把開關、LED 的名稱設成邏輯圖上的名稱');
  });
});
