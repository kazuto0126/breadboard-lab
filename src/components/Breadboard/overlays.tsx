import { memo } from 'react';
import { parseNodeId } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import { gridBounds, PITCH, toWorld, type BoardFrame, type Rect } from '../../editor/geometry';
import type { Circuit, Wire } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { pointsAttr, wirePoints } from './WireGraphic';

const P = PITCH;

export function groupRect(frames: BoardFrame[], circuit: Circuit, groupId: string): Rect | null {
  const boardId = groupId.slice(0, groupId.indexOf(':'));
  const instance = circuit.boards.find((b) => b.id === boardId);
  if (!instance) return null;
  const group = getBoard(instance.layoutId, instance.id).groups[groupId];
  if (!group) return null;
  return gridBounds(frames, group.nodeIds.map(parseNodeId), 0.4);
}

export function componentRect(frames: BoardFrame[], instance: ComponentInstance, pad = 0.6): Rect | null {
  const def = getComponentDefinition(instance.defId);
  if (!def) return null;
  const fp = resolveFootprint(instance, def);
  return gridBounds(frames, [...fp.pins.map((p) => p.point), ...fp.blocked], pad);
}

export function GroupStrip({ rect, color, opacity = 0.22 }: { rect: Rect | null; color: string; opacity?: number }) {
  if (!rect) return null;
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      rx={0.3 * P}
      fill={color}
      fillOpacity={opacity}
      stroke={color}
      strokeOpacity={0.7}
      strokeWidth={1.2}
      pointerEvents="none"
    />
  );
}

export function Outline({ rect, color, dashed = true, width = 2 }: { rect: Rect | null; color: string; dashed?: boolean; width?: number }) {
  if (!rect) return null;
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      rx={0.3 * P}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dashed ? '6 4' : undefined}
      pointerEvents="none"
    />
  );
}

export function Ring({ frames, point, color, r = 0.42, width = 2.2, fill }: { frames: BoardFrame[]; point: GridPoint; color: string; r?: number; width?: number; fill?: string }) {
  const c = toWorld(frames, point);
  if (!c) return null;
  return <circle cx={c.x} cy={c.y} r={r * P} fill={fill ?? 'none'} fillOpacity={fill ? 0.25 : undefined} stroke={color} strokeWidth={width} pointerEvents="none" />;
}

export function WireGlow({ frames, wire, color, width = 0.85, opacity = 0.45 }: { frames: BoardFrame[]; wire: Wire; color: string; width?: number; opacity?: number }) {
  const points = wirePoints(frames, wire);
  if (points.length < 2) return null;
  return (
    <polyline
      points={pointsAttr(points)}
      fill="none"
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={width * P}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}

export function PathPreview({ frames, path, color, valid }: { frames: BoardFrame[]; path: GridPoint[]; color: string; valid: boolean }) {
  const points = path.map((p) => toWorld(frames, p)).filter((p): p is NonNullable<typeof p> => p !== null);
  if (points.length < 2) return null;
  return (
    <polyline
      points={pointsAttr(points)}
      fill="none"
      stroke={valid ? color : '#ef4444'}
      strokeOpacity={0.9}
      strokeWidth={0.3 * P}
      strokeDasharray={`${0.5 * P} ${0.3 * P}`}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}

/** 每隻元件腳的透明點擊區：讓腳位可以被選取、提示（在元件圖層之上）。 */
export const PinTargets = memo(function PinTargets({ components, frames, hiddenId }: { components: ComponentInstance[]; frames: BoardFrame[]; hiddenId?: string }) {
  return (
    <g data-ui="pins">
      {components.map((c) => {
        if (c.id === hiddenId) return null;
        const def = getComponentDefinition(c.defId);
        if (!def) return null;
        return resolveFootprint(c, def).pins.map((pin) => {
          const w = toWorld(frames, pin.point);
          if (!w) return null;
          return (
            <circle
              key={`${c.id}#${pin.pinNumber}`}
              cx={w.x}
              cy={w.y}
              r={0.36 * P}
              fill="transparent"
              data-component-id={c.id}
              data-pin={pin.pinNumber}
              style={{ cursor: 'grab' }}
            />
          );
        });
      })}
    </g>
  );
});
