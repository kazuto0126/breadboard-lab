// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BoardSvg, type OverlayData } from '../../src/app/board/BoardSvg';
import { invalidWireIds, markersFromErrors } from '../../src/app/board/markers';
import { netHighlightFor } from '../../src/app/board/netHighlight';
import { lPath } from '../../src/app/geometry/wirePath';
import type { CircuitError } from '../../src/types/circuit';
import { circuit, comp, hole, wire } from '../fixtures/build';

afterEach(cleanup);

const vp = { scale: 1, tx: 0, ty: 0 };
const overlay = (over: Partial<OverlayData> = {}): OverlayData => ({
  selection: null,
  net: null,
  markers: [],
  ghost: null,
  wirePreview: null,
  wireColor: '#d32f2f',
  previewWires: [],
  focusWireId: null,
  ...over,
});

describe('BoardSvg', () => {
  it('draws every hole with its name', () => {
    const { container } = render(<BoardSvg circuit={circuit([])} viewport={vp} />);
    expect(container.querySelectorAll('[data-hole]')).toHaveLength(830);
    expect(container.querySelector('[data-hole="A12"]')).not.toBeNull();
    expect(container.querySelector('[data-hole="T+3"]')).not.toBeNull();
  });

  it('draws components and wires in their own layers, without an overlay by default', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')], [wire('m1', 'A20', 'A30')]);
    const { container } = render(<BoardSvg circuit={c} viewport={vp} />);
    expect(container.querySelector('[data-layer="components"] [data-component-id="U1"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="wires"] [data-wire-id="m1"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="overlay"]')).toBeNull();
  });

  it('dashes invalid wires and dims checked ones', () => {
    const c = circuit([], [wire('m1', 'A20', 'A30'), wire('m2', 'B20', 'B30')]);
    const { container } = render(<BoardSvg circuit={c} viewport={vp} invalidWireIds={new Set(['m1'])} dimmedWireIds={new Set(['m2'])} />);
    const m1Paths = [...container.querySelectorAll('[data-wire-id="m1"] path')];
    expect(m1Paths.some((p) => p.getAttribute('stroke-dasharray') === '4 3')).toBe(true);
    expect(container.querySelector('[data-wire-id="m2"]')!.getAttribute('opacity')).toBe('0.35');
  });

  it('lifts the later wire where two wires cross', () => {
    const c = circuit([], [wire('h', 'C20', 'C30'), wire('v', [25, 3], 'E25')]);
    const { container } = render(<BoardSvg circuit={c} viewport={vp} />);
    expect(container.querySelectorAll('[data-crossing]')).toHaveLength(1);
  });

  it('staggers the drawing animation in the given order', () => {
    const c = circuit([], [wire('a', 'A20', 'A30'), wire('b', 'B20', 'B30')]);
    const { container } = render(<BoardSvg circuit={c} viewport={vp} animation={{ order: ['b', 'a'], stepMs: 100 }} />);
    expect(container.querySelector('[data-wire-id="b"]')!.getAttribute('data-delay')).toBe('0');
    expect(container.querySelector('[data-wire-id="a"]')!.getAttribute('data-delay')).toBe('100');
  });

  it('draws the overlay: selection, markers, ghost and previews', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')], [wire('m1', 'A20', 'A30')]);
    const data = overlay({
      selection: { kind: 'component', id: 'U1' },
      markers: [
        { point: hole('E10'), severity: 'error' },
        { point: hole('A40'), severity: 'warning' },
      ],
      ghost: { instance: comp('R1', 'resistor', 'A40'), valid: false, reason: 'x' },
      wirePreview: { start: hole('B20'), end: hole('B25'), path: lPath(hole('B20'), hole('B25'), true), valid: true },
      previewWires: [wire('w_NET_1_1', 'C20', 'C30')],
    });
    const { container } = render(<BoardSvg circuit={c} viewport={vp} overlay={data} />);
    const layer = container.querySelector('[data-layer="overlay"]')!;
    expect(layer.querySelector('[data-selection="component"]')).not.toBeNull();
    expect(layer.querySelectorAll('[data-marker="error"]')).toHaveLength(1);
    expect(layer.querySelectorAll('[data-marker="warning"]')).toHaveLength(1);
    expect(layer.querySelector('[data-ghost="invalid"]')).not.toBeNull();
    expect(layer.querySelector('[data-wire-preview]')).not.toBeNull();
    expect(layer.querySelector('[data-preview-wire="w_NET_1_1"]')).not.toBeNull();
  });
});

describe('markers', () => {
  const base = { componentIds: [] as string[], wireIds: [] as string[], netIds: [] as string[], message: '' };

  it('uses error points, falls back to pin 1, keeps the worst severity per point and skips info', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')]);
    const errors: CircuitError[] = [
      { ...base, code: 'INPUT_FLOATING', severity: 'warning', points: [hole('F11')] },
      { ...base, code: 'IC_POWER_MISSING', severity: 'error', points: [hole('F11')] },
      { ...base, code: 'NO_POWER_SOURCE', severity: 'error', points: [], componentIds: ['U1'] },
      { ...base, code: 'CIRCUIT_VALID', severity: 'info', points: [hole('A1')] },
    ];
    expect(markersFromErrors(errors, c)).toEqual([
      { point: hole('F11'), severity: 'error' },
      { point: hole('F10'), severity: 'error' },
    ]);
  });

  it('collects the wires that should be drawn as invalid', () => {
    const errors: CircuitError[] = [
      { ...base, code: 'WIRE_OVERLAP', severity: 'error', points: [], wireIds: ['m1', 'm2'] },
      { ...base, code: 'SHORT_CIRCUIT', severity: 'error', points: [], wireIds: ['m3'] },
    ];
    expect([...invalidWireIds(errors)]).toEqual(['m1', 'm2']);
  });
});

describe('netHighlightFor', () => {
  it('finds every wire and pin on the selected net', () => {
    const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('m1', 'A10', 'A30'), wire('m2', 'B11', 'B20')]);
    const fromPin = netHighlightFor({ kind: 'pin', componentId: 'D1', pinNumber: 1 }, c)!;
    expect([...fromPin.wireIds]).toEqual(['m1']);
    expect(fromPin.pinPoints).toEqual([hole('C10'), hole('C30')]);
    expect(netHighlightFor({ kind: 'wire', id: 'm1' }, c)!.netId).toBe(fromPin.netId);
    expect(netHighlightFor({ kind: 'component', id: 'D1' }, c)).toBeNull();
    expect(netHighlightFor(null, c)).toBeNull();
  });
});
