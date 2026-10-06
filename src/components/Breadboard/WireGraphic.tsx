import { memo, type CSSProperties } from 'react';
import { PITCH, toWorld, type BoardFrame, type Point } from '../../editor/geometry';
import { levelColor, PART } from '../../render/theme';
import type { Wire } from '../../types/circuit';
import type { Level } from '../../types/logic';

const P = PITCH;

export function wirePoints(frames: BoardFrame[], wire: Wire): Point[] {
  return wire.path.map((p) => toWorld(frames, p)).filter((p): p is Point => p !== null);
}

export function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

interface Props {
  wire: Wire;
  frames: BoardFrame[];
  /** 自動佈線動畫：延遲與描線時間（ms）。 */
  anim?: { delay: number; duration: number };
  faded?: boolean;
  interactive?: boolean;
  /** 模擬中這條線所在節點的電位：兩端插針上色，HIGH / X 時線身中央加一條亮線。 */
  level?: Level;
}

/** 平貼板面的跳線：深色外框 + 彩色線身 + 兩端金屬插針。 */
export const WireGraphic = memo(function WireGraphic({ wire, frames, anim, faded, interactive = true, level }: Props) {
  const points = wirePoints(frames, wire);
  if (points.length < 2) return null;
  const attr = pointsAttr(points);
  const ends = [points[0], points[points.length - 1]];
  const drawStyle = anim
    ? ({ '--bbl-delay': `${anim.delay}ms`, '--bbl-duration': `${anim.duration}ms` } as CSSProperties)
    : undefined;
  const fadeStyle = anim ? ({ '--bbl-delay': `${anim.delay + anim.duration * 0.6}ms` } as CSSProperties) : undefined;
  return (
    <g data-wire-id={interactive ? wire.id : undefined} opacity={faded ? 0.18 : 1} style={interactive ? { cursor: 'pointer' } : undefined}>
      <polyline
        points={attr}
        fill="none"
        stroke="#000000"
        strokeOpacity={0.45}
        strokeWidth={0.44 * P}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={anim ? 1 : undefined}
        className={anim ? 'bbl-draw' : undefined}
        style={drawStyle}
      />
      <polyline
        points={attr}
        fill="none"
        stroke={wire.color}
        strokeWidth={0.3 * P}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={anim ? 1 : undefined}
        className={anim ? 'bbl-draw' : undefined}
        style={drawStyle}
      />
      {(level === 1 || level === 'X') && (
        <polyline
          points={attr}
          fill="none"
          stroke={levelColor(level)}
          strokeOpacity={0.9}
          strokeWidth={0.09 * P}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {ends.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={level !== undefined ? 0.2 * P : 0.16 * P}
          fill={levelColor(level) ?? PART.metal}
          stroke="#5f6368"
          strokeWidth={0.8}
          className={anim ? 'bbl-fade' : undefined}
          style={fadeStyle}
        />
      ))}
      {interactive && <polyline points={attr} fill="none" stroke="transparent" strokeWidth={0.8 * P} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
});
