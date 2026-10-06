import { memo, type MouseEvent, type PointerEvent, type Ref } from 'react';
import type { Circuit, Wire } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { Viewport } from '../model/editorTypes';
import { BoardBase } from './BoardBase';
import { ComponentGlyph } from './ComponentGlyph';
import { OverlayLayer, type OverlayData } from './OverlayLayer';
import { WireLayer } from './WireLayer';

export type { OverlayData } from './OverlayLayer';

export interface BoardHandlers {
  onPointerDown?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (e: PointerEvent<SVGSVGElement>) => void;
  onContextMenu?: (e: MouseEvent<SVGSVGElement>) => void;
}

export interface BoardSvgProps {
  circuit: Circuit;
  viewport: Viewport;
  invalidWireIds?: ReadonlySet<string>;
  dimmedWireIds?: ReadonlySet<string>;
  animation?: { order: string[]; stepMs: number } | null;
  fadingWires?: Wire[];
  overlay?: OverlayData | null;
  svgRef?: Ref<SVGSVGElement>;
  handlers?: BoardHandlers;
  label?: string;
}

const ComponentLayer = memo(function ComponentLayer({ components }: { components: ComponentInstance[] }) {
  return (
    <>
      {components.map((c) => (
        <g key={c.id} data-component-id={c.id}>
          <ComponentGlyph instance={c} />
        </g>
      ))}
    </>
  );
});

export function BoardSvg({
  circuit,
  viewport,
  invalidWireIds,
  dimmedWireIds,
  animation = null,
  fadingWires,
  overlay = null,
  svgRef,
  handlers,
  label = '麵包板',
}: BoardSvgProps) {
  return (
    <svg
      ref={svgRef}
      data-testid="board-svg"
      aria-label={label}
      width="100%"
      height="100%"
      style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
      {...handlers}
    >
      <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
        <g data-layer="board">
          <BoardBase />
        </g>
        <g data-layer="components">
          <ComponentLayer components={circuit.components} />
        </g>
        <g data-layer="wires">
          <WireLayer wires={circuit.wires} invalidIds={invalidWireIds} dimmedIds={dimmedWireIds} animation={animation} fading={fadingWires} />
        </g>
        {overlay && (
          <g data-layer="overlay">
            <OverlayLayer circuit={circuit} {...overlay} />
          </g>
        )}
      </g>
    </svg>
  );
}
