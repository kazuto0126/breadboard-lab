// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardSvg } from '../../src/app/board/BoardSvg';
import { downloadText } from '../../src/app/persistence/download';
import { boardSvgMarkup } from '../../src/app/persistence/exportImage';
import { circuit, comp, wire } from '../fixtures/build';

afterEach(cleanup);

describe('boardSvgMarkup', () => {
  it('exports board, parts and wires without the overlay, animation, fading wires or dimming', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')], [wire('m1', 'A20', 'A30'), wire('m2', 'B20', 'B30')]);
    const { container } = render(
      <BoardSvg
        circuit={c}
        viewport={{ scale: 2, tx: 50, ty: 60 }}
        dimmedWireIds={new Set(['m2'])}
        animation={{ order: ['m1'], stepMs: 100 }}
        fadingWires={[wire('old', 'C20', 'C30')]}
        overlay={{
          selection: { kind: 'component', id: 'U1' },
          net: null,
          markers: [],
          ghost: null,
          wirePreview: null,
          wireColor: '#d32f2f',
          previewWires: [],
          focusWireId: null,
        }}
      />,
    );
    const markup = boardSvgMarkup(container.querySelector('svg')!);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('viewBox="0 0 640 190"');
    expect(markup).toContain('data-hole="A12"');
    expect(markup).toContain('data-component-id="U1"');
    expect(markup).toContain('data-wire-id="m1"');
    expect(markup).not.toContain('data-layer="overlay"');
    expect(markup).not.toContain('style=');
    expect(markup).not.toContain('data-fading');
    expect(markup).not.toMatch(/data-wire-id="m2"[^>]*opacity/);
    expect(markup).not.toContain('scale(2)');
  });
});

describe('downloadText', () => {
  it('downloads through a temporary link', () => {
    const clicked: string[] = [];
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(`${this.download}|${this.href}`);
    });
    downloadText('a.breadboard.json', '{}');
    expect(clicked).toEqual(['a.breadboard.json|blob:fake']);
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
  });
});
