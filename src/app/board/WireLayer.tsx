import { memo, useMemo, type CSSProperties } from 'react';
import { nodeIdOf } from '../../core/breadboard/naming';
import { analyzeWireInteractions } from '../../core/circuit/wireGeometry';
import type { Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { UNIT } from '../interaction/viewport';

export function wirePathD(path: GridPoint[]): string {
  return path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x * UNIT} ${p.y * UNIT}`).join(' ');
}

/** 把 #rrggbb 調暗 amount（0–1）。 */
export function darken(hex: string, amount = 0.3): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#333333';
  const n = parseInt(m[1], 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount)).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

interface Crossing {
  key: string;
  d: string;
  color: string;
}

/** 交叉點上把後畫的那條線加一段淺色外框，看起來疊在上面。 */
function crossingSegments(wires: Wire[]): Crossing[] {
  const order = new Map(wires.map((w, i) => [w.id, i]));
  return analyzeWireInteractions(wires).crossings.flatMap(({ nodeId, wireIds }) => {
    const top = wireIds
      .map((id) => wires[order.get(id)!])
      .sort((a, b) => order.get(b.id)! - order.get(a.id)!)[0];
    const k = top.path.findIndex((p) => nodeIdOf(p) === nodeId);
    if (k <= 0 || k >= top.path.length - 1) return [];
    const p = top.path[k];
    const mid = (q: GridPoint) => `${((q.x + p.x) / 2) * UNIT} ${((q.y + p.y) / 2) * UNIT}`;
    return [{ key: `${nodeId}-${top.id}`, d: `M${mid(top.path[k - 1])} L${p.x * UNIT} ${p.y * UNIT} L${mid(top.path[k + 1])}`, color: top.color }];
  });
}

const EMPTY = new Set<string>();
const LINE = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export interface WireLayerProps {
  wires: Wire[];
  invalidIds?: ReadonlySet<string>;
  dimmedIds?: ReadonlySet<string>;
  animation?: { order: string[]; stepMs: number } | null;
  fading?: Wire[];
}

export const WireLayer = memo(function WireLayer({ wires, invalidIds = EMPTY, dimmedIds = EMPTY, animation = null, fading = [] }: WireLayerProps) {
  const crossings = useMemo(() => crossingSegments(wires), [wires]);
  const orderIndex = useMemo(() => new Map((animation?.order ?? []).map((id, i) => [id, i])), [animation]);
  return (
    <>
      {fading.map((w) => (
        <path key={`fade-${w.id}`} d={wirePathD(w.path)} stroke={w.color} strokeWidth={5.6} {...LINE} style={{ animation: 'bbl-fade 300ms linear forwards' }} />
      ))}
      {wires.map((w) => {
        const d = wirePathD(w.path);
        const index = animation ? orderIndex.get(w.id) : undefined;
        const length = (w.path.length - 1) * UNIT;
        const style: CSSProperties | undefined =
          animation && index !== undefined
            ? {
                strokeDasharray: length,
                strokeDashoffset: length,
                animation: `bbl-draw ${animation.stepMs}ms linear ${index * animation.stepMs}ms forwards`,
              }
            : undefined;
        const invalid = invalidIds.has(w.id);
        return (
          <g key={w.id} data-wire-id={w.id} data-delay={index !== undefined && animation ? index * animation.stepMs : undefined} opacity={dimmedIds.has(w.id) ? 0.35 : undefined}>
            <path d={d} stroke={darken(w.color)} strokeWidth={7} {...LINE} style={style} />
            <path d={d} stroke={invalid ? '#d32f2f' : w.color} strokeWidth={5.6} {...LINE} strokeDasharray={invalid && !style ? '4 3' : undefined} style={style} />
            {[w.start, w.end].map((p, i) => (
              <rect key={i} x={p.x * UNIT - 2} y={p.y * UNIT - 2} width={4} height={4} rx={0.6} fill="#c0c4c8" stroke="#80868b" strokeWidth={0.5} />
            ))}
          </g>
        );
      })}
      {crossings.map((c) => (
        <g key={c.key} data-crossing="">
          <path d={c.d} stroke="#ffffff" strokeWidth={9} {...LINE} />
          <path d={c.d} stroke={c.color} strokeWidth={5.6} {...LINE} />
        </g>
      ))}
    </>
  );
});
