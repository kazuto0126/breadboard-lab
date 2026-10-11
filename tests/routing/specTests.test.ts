import { describe, expect, it } from 'vitest';
import { buildLattice } from '../../src/core/breadboard/lattice';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { analyzeWireInteractions, cellsUnder } from '../../src/core/circuit/wireGeometry';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

describe('需求文件第三十三章 Test 1–6', () => {
  it('Test 1：每條線都是水平或垂直的直線（轉彎靠轉接排）', () => {
    const c = circuit([comp('R1', 'resistor', 'C10'), comp('R2', 'resistor', 'H30')], [wire('u1', 'A14', 'J30')]);
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.wires.length).toBeGreaterThanOrEqual(1);
    for (const w of r.wires) {
      expect(w.straight).toBe(true);
      expect(w.start.x === w.end.x || w.start.y === w.end.y).toBe(true);
    }
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('Test 2：兩條線不能重疊', () => {
    const c = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'D12'), comp('D4', 'led', 'D28')],
      [wire('u1', 'A10', 'A30'), wire('u2', 'B12', 'B28')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.wires).toHaveLength(2);
    expect(analyzeWireInteractions(r.wires).overlaps).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('Test 3：可能交叉時選擇不交叉的路徑', () => {
    // VCC：T+ 與 B+ 兩條軌要接通（必然是一條垂直線）；訊號：第 1 欄下半 ↔ 第 63 欄下半（橫跨整塊板）。
    const c = circuit(
      [comp('V1', 'vcc', 'T+3'), comp('D1', 'led', 'H1'), comp('D2', 'led', 'H62')],
      [wire('u1', 'T+4', 'B+4'), wire('u2', 'J1', 'J63')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.metrics.crossings).toBe(0);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('Test 4：導線不能穿過 IC', () => {
    const c = circuit([comp('U1', '74LS00', 'F8'), comp('D1', 'led', 'H5'), comp('D2', 'led', 'B25')], [wire('u1', 'J5', 'A25')]);
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    const icCells = new Set(indexCircuit(c).placedById.get('U1')!.footprint.blocked.map(nodeIdOf));
    const lattice = buildLattice(c.boards);
    expect(r.wires.flatMap((w) => [w.start, w.end, ...cellsUnder(w, lattice)]).some((p) => icCells.has(nodeIdOf(p)))).toBe(false);
  });

  it('Test 5：多個 Net 全部完成', () => {
    const c = acceptanceCircuit();
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.failedNets).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('Test 6：沒有合法路徑時回報 "No valid routing solution."，而且不輸出錯誤線路', () => {
    const c = circuit(
      [
        comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
        comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
        comp('D1', 'led', 'E20'),
        comp('D2', 'led', 'C40'),
      ],
      [wire('u1', 'A20', 'A40')],
    );
    const r = autoRoute(c);
    expect(r.message).toBe('No valid routing solution.');
    expect(r.status).toBe('failed');
    expect(r.wires).toEqual([]);
  });
});
