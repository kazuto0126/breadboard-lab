// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ComponentGlyph } from '../../src/app/board/ComponentGlyph';
import { GOLD, resistorBands } from '../../src/app/board/resistorBands';
import type { ComponentInstance } from '../../src/types/component';
import { comp } from '../fixtures/build';

afterEach(cleanup);

const draw = (instance: ComponentInstance) =>
  render(
    <svg>
      <ComponentGlyph instance={instance} />
    </svg>,
  ).container;

describe('resistorBands', () => {
  it('reads the colour code', () => {
    expect(resistorBands(220)).toEqual(['#d32f2f', '#d32f2f', '#8b4513', GOLD]);
    expect(resistorBands(1000)).toEqual(['#8b4513', '#000000', '#d32f2f', GOLD]);
    expect(resistorBands(4700)).toEqual(['#fbc02d', '#7b1fa2', '#d32f2f', GOLD]);
    expect(resistorBands(100000)).toEqual(['#8b4513', '#000000', '#fbc02d', GOLD]);
    expect(resistorBands(5)).toEqual(['#000000', '#388e3c', '#000000', GOLD]);
  });
});

describe('ComponentGlyph', () => {
  it('draws a DIP IC with its part number and every pin', () => {
    const svg = draw(comp('U1', '74LS00', 'F10'));
    expect(svg.textContent).toContain('74LS00');
    expect(svg.querySelectorAll('[data-pin]')).toHaveLength(14);
  });

  it('draws resistor colour bands from the resistance', () => {
    const svg = draw(comp('R1', 'resistor', 'A30', { props: { resistance: 220 } }));
    expect([...svg.querySelectorAll('[data-band]')].map((b) => b.getAttribute('fill'))).toEqual(resistorBands(220));
  });

  it('labels LED anode and cathode and uses the LED colour', () => {
    const svg = draw(comp('D1', 'led', 'C40', { props: { color: 'green' } }));
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).toEqual(expect.arrayContaining(['A', 'K']));
    expect(svg.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('labels power terminals', () => {
    expect(draw(comp('V1', 'vcc', 'T+5')).textContent).toContain('VCC 5V');
    expect(draw(comp('G1', 'gnd', 'B-5')).textContent).toContain('GND');
    expect(draw(comp('P1', 'dc-power', 'T-10', { rotation: 90 })).textContent).toContain('5V');
  });

  it('draws one lever per DIP switch position', () => {
    expect(draw(comp('SW1', 'dipsw-8', 'F5')).querySelectorAll('[data-switch]')).toHaveLength(8);
    expect(draw(comp('SW1', 'dipsw-4', 'F5')).querySelectorAll('[data-switch]')).toHaveLength(4);
  });

  it('draws a push button with four pins', () => {
    expect(draw(comp('BTN1', 'pushbutton', 'F4')).querySelectorAll('[data-pin]')).toHaveLength(4);
  });

  it('draws nothing for unknown parts', () => {
    expect(draw(comp('X1', 'nope', 'A1')).querySelector('g')).toBeNull();
  });
});
