import { describe, expect, it } from 'vitest';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { checkRoutingLegality, mismatchedNets } from '../../src/core/routing/legality';
import type { Wire } from '../../src/types/circuit';
import { circuit, comp, straightWire, wire, type Where } from '../fixtures/build';

// NET_1 = D1 陽極（第 10 欄上半）↔ D2 陽極（第 30 欄上半）；其他腳各自一個 Net。
const base = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'C50')], [wire('u1', 'A10', 'A30')]);
const NET = 'NET_1';
const auto = (id: string, from: Where, to: Where, netId: string = NET): Wire => ({ ...straightWire(id, from, to), source: 'auto', netId });
const codes = (wires: Wire[]) => checkRoutingLegality(base, wires).map((v) => v.code);

describe('checkRoutingLegality (straight wires)', () => {
  it('uses the expected reference net names', () => {
    expect(extractNets(base).map((n) => n.id)).toEqual(['NET_1', 'NET_2', 'NET_3', 'NET_4', 'NET_5']);
  });

  it('accepts one horizontal wire, and a turn through a free strip', () => {
    expect(codes([auto('a1', 'B10', 'B30')])).toEqual([]);
    expect(codes([auto('a1', 'A10', 'A20'), auto('a2', 'E20', 'E30')])).toEqual([]);
  });

  it('flags old path wires, diagonal wires and wires inside one strip', () => {
    expect(codes([{ ...wire('a1', 'B10', 'B30'), source: 'auto', netId: NET }])).toContain('PATH_INVALID');
    expect(codes([auto('a1', 'B10', 'D30')])).toContain('PATH_INVALID');
    expect(codes([auto('a1', 'A10', 'E10')])).toContain('PATH_INVALID');
  });

  it('flags endpoints on pins, in a foreign group, shared, or without a net', () => {
    expect(codes([auto('a1', 'C10', 'C30')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B50')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'B10', 'B20')])).toContain('ENDPOINT_INVALID');
    expect(codes([{ ...auto('a1', 'B10', 'B30'), netId: undefined }])).toContain('ENDPOINT_INVALID');
  });

  // 子專案 47（規格 2026-10-25 convert-improvements 第 4 節）：沒有接電源、沒有元件腳的電源軌可以當訊號通道；有電源符號的軌不行。
  it('accepts a signal through an empty rail, but not through a rail with a power symbol', () => {
    expect(codes([auto('a1', 'A10', 'T+10'), auto('a2', 'T+30', 'A30')])).toEqual([]);
    const powered = circuit([...base.components, comp('V1', 'vcc', 'T+3')], base.wires);
    expect(checkRoutingLegality(powered, [auto('a1', 'A10', 'T+10'), auto('a2', 'T+30', 'A30')]).map((v) => v.code)).toContain('ENDPOINT_INVALID');
  });

  it('flags wires that pass over a pin or another wire end', () => {
    expect(codes([auto('a1', 'C5', 'C15')])).toContain('THROUGH_OBSTACLE');
    expect(codes([auto('a1', 'B10', 'B20'), auto('a2', 'A20', 'J20')])).toContain('THROUGH_OBSTACLE');
  });

  // 子專案 39（規格 2026-10-20 wiring-rules）：交叉也不行。
  it('flags crossing wires', () => {
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'A20', 'J20', 'NET_3')])).toContain('CROSSING');
    expect(codes([auto('a1', 'B10', 'B30')])).not.toContain('CROSSING');
  });

  it('flags overlapping wires', () => {
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'B12', 'B40')])).toContain('OVERLAP');
  });

  it('flags missing and merged connections, including a strip shared by two nets', () => {
    expect(codes([])).toContain('NET_MISMATCH');
    const index = indexCircuit(base);
    const reference = extractNets(base);
    expect(mismatchedNets(index, reference, [])).toEqual(['NET_1']);
    const sharing: Wire[] = [auto('a1', 'A10', 'A20'), auto('a2', 'E20', 'E30'), auto('a3', 'B50', 'B20', 'NET_4')];
    expect(codes(sharing)).toContain('NET_MISMATCH');
  });
});
