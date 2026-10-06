import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit, Wire } from '../../types/circuit';
import { boundsOf, componentCells } from '../geometry/componentShape';
import { UNIT } from '../interaction/viewport';
import type { Ghost, Selection, WirePreview } from '../model/editorTypes';
import { ComponentGlyph } from './ComponentGlyph';
import type { Marker } from './markers';
import type { NetHighlight } from './netHighlight';
import { wirePathD } from './WireLayer';

export interface OverlayData {
  selection: Selection | null;
  net: NetHighlight | null;
  markers: Marker[];
  ghost: Ghost | null;
  wirePreview: WirePreview | null;
  wireColor: string;
  previewWires: Wire[];
  focusWireId: string | null;
}

const SELECT = '#2196f3';
const NET = '#00bcd4';
const LINE = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function SelectionMark({ circuit, selection }: { circuit: Circuit; selection: Selection }) {
  switch (selection.kind) {
    case 'component': {
      const c = circuit.components.find((x) => x.id === selection.id);
      const def = c ? getComponentDefinition(c.defId) : undefined;
      if (!c || !def) return null;
      const b = boundsOf(componentCells(c, def));
      return (
        <rect
          data-selection="component"
          x={(b.minX - 0.6) * UNIT}
          y={(b.minY - 0.6) * UNIT}
          width={(b.maxX - b.minX + 1.2) * UNIT}
          height={(b.maxY - b.minY + 1.2) * UNIT}
          rx={2}
          fill="none"
          stroke={SELECT}
          strokeWidth={1.5}
        />
      );
    }
    case 'pin': {
      const c = circuit.components.find((x) => x.id === selection.componentId);
      const def = c ? getComponentDefinition(c.defId) : undefined;
      const pin = c && def ? resolveFootprint(c, def).pins.find((p) => p.pinNumber === selection.pinNumber) : undefined;
      if (!pin) return null;
      return <circle data-selection="pin" cx={pin.point.x * UNIT} cy={pin.point.y * UNIT} r={4.5} fill="none" stroke={SELECT} strokeWidth={1.5} />;
    }
    case 'wire': {
      const w = circuit.wires.find((x) => x.id === selection.id);
      if (!w) return null;
      return <path data-selection="wire" d={wirePathD(w.path)} stroke={SELECT} strokeWidth={11} opacity={0.35} {...LINE} />;
    }
    case 'hole':
      return (
        <rect
          data-selection="hole"
          x={selection.point.x * UNIT - 4}
          y={selection.point.y * UNIT - 4}
          width={8}
          height={8}
          fill="none"
          stroke={SELECT}
          strokeWidth={1.2}
        />
      );
  }
}

function GhostMark({ ghost }: { ghost: Ghost }) {
  const def = getComponentDefinition(ghost.instance.defId);
  if (!def) return null;
  const b = boundsOf(componentCells(ghost.instance, def));
  return (
    <g opacity={0.6} data-ghost={ghost.valid ? 'valid' : 'invalid'}>
      <ComponentGlyph instance={ghost.instance} />
      <rect
        x={(b.minX - 0.6) * UNIT}
        y={(b.minY - 0.6) * UNIT}
        width={(b.maxX - b.minX + 1.2) * UNIT}
        height={(b.maxY - b.minY + 1.2) * UNIT}
        rx={2}
        fill="none"
        stroke={ghost.valid ? '#16a34a' : '#dc2626'}
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
    </g>
  );
}

export function OverlayLayer({ circuit, selection, net, markers, ghost, wirePreview, wireColor, previewWires, focusWireId }: OverlayData & { circuit: Circuit }) {
  const focus = focusWireId ? circuit.wires.find((w) => w.id === focusWireId) : undefined;
  return (
    <g pointerEvents="none">
      {previewWires.map((w) => (
        <path key={w.id} data-preview-wire={w.id} d={wirePathD(w.path)} stroke={w.color} strokeWidth={5.6} opacity={0.4} {...LINE} />
      ))}
      {net &&
        circuit.wires
          .filter((w) => net.wireIds.has(w.id))
          .map((w) => <path key={`net-${w.id}`} d={wirePathD(w.path)} stroke={NET} strokeWidth={11} opacity={0.35} {...LINE} />)}
      {net &&
        net.pinPoints.map((p) => <circle key={`pin-${p.x},${p.y}`} cx={p.x * UNIT} cy={p.y * UNIT} r={4} fill="none" stroke={NET} strokeWidth={1.5} />)}
      {focus && <path d={wirePathD(focus.path)} stroke={SELECT} strokeWidth={11} opacity={0.35} {...LINE} />}
      {selection && <SelectionMark circuit={circuit} selection={selection} />}
      {markers.map((m) => (
        <g key={`${m.point.x},${m.point.y}`} data-marker={m.severity}>
          {m.severity === 'error' && <circle cx={m.point.x * UNIT} cy={m.point.y * UNIT} r={5} fill="none" stroke="#d32f2f" strokeWidth={1.2} />}
          <text
            x={m.point.x * UNIT + 4}
            y={m.point.y * UNIT - 4}
            fontSize={6}
            fill={m.severity === 'error' ? '#d32f2f' : '#f59e0b'}
            textAnchor="middle"
            dominantBaseline="central"
          >
            ⚠
          </text>
        </g>
      ))}
      {ghost && <GhostMark ghost={ghost} />}
      {wirePreview && (
        <path
          data-wire-preview=""
          d={wirePathD(wirePreview.path)}
          stroke={wireColor}
          strokeWidth={5.6}
          opacity={0.7}
          strokeDasharray={wirePreview.valid ? undefined : '4 3'}
          {...LINE}
        />
      )}
    </g>
  );
}
