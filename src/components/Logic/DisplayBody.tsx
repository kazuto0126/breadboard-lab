import type { Bit } from '../../logic/evaluate';
import { glyphOf } from '../../logic/sevenSeg';
import type { LogicNode } from '../../logic/types';
import { LOGIC_CELL as C } from '../../state/logic';

const PIN_ROWS = [0, 1, 3, 4];
const PIN_NAMES = ['A', 'B', 'C', 'D'];
const pinColor = (b: Bit | undefined) => (b === 1 ? '#dc2626' : b === 0 ? '#2563eb' : '#94a3b8');

/** 7 段的位置（相對於字的中心，單位是格子）：a 上、b 右上、c 右下、d 下、e 左下、f 左上、g 中間。 */
function segmentLines(cx: number, cy: number, w: number, h: number): Record<string, [number, number, number, number]> {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const t = cy - h / 2;
  const b = cy + h / 2;
  return {
    a: [l, t, r, t],
    b: [r, t, r, cy],
    c: [r, cy, r, b],
    d: [l, b, r, b],
    e: [l, cy, l, b],
    f: [l, t, l, cy],
    g: [l, cy, r, cy],
  };
}

/** 規格（2026-10-13 seven-seg）第 5 節：邏輯圖上的 7 段顯示器（4 × 5 格；左側 A–D 腳，中間依 74LS47 的字形點亮）。 */
export function DisplayBody({ node, value, inputs = [], selected = false }: { node: LogicNode; value?: number | 'X'; inputs?: Array<Bit | undefined>; selected?: boolean }) {
  const lit = new Set(value === undefined ? [] : [...glyphOf(value)]);
  const lines = segmentLines(2.35 * C, 2 * C, 1.25 * C, 2.9 * C);
  return (
    <g data-logic-display={node.id} data-value={value === undefined ? '' : String(value)}>
      {PIN_ROWS.map((y, i) => (
        <line key={i} x1={0} y1={y * C} x2={0.6 * C} y2={y * C} stroke={pinColor(inputs[i])} strokeWidth={2} />
      ))}
      <rect x={0.6 * C} y={-0.5 * C} width={3.2 * C} height={5 * C} rx={4} fill="#1f2937" stroke={selected ? '#0284c7' : '#0f172a'} strokeWidth={selected ? 2.4 : 1.6} />
      {PIN_ROWS.map((y, i) => (
        <text key={i} x={0.95 * C} y={y * C} fontSize={0.42 * C} fontWeight={700} fill="#cbd5e1" textAnchor="middle" dominantBaseline="central">
          {PIN_NAMES[i]}
        </text>
      ))}
      {Object.entries(lines).map(([s, [x1, y1, x2, y2]]) => (
        <line key={s} data-segment={s} data-lit={lit.has(s) ? 'true' : undefined} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit.has(s) ? '#ef4444' : '#374151'} strokeWidth={0.26 * C} strokeLinecap="round" />
      ))}
      <text x={2.2 * C} y={-0.95 * C} fontSize={0.5 * C} fontWeight={700} fill="#1e293b" textAnchor="middle" dominantBaseline="central">
        {node.name}
      </text>
    </g>
  );
}
