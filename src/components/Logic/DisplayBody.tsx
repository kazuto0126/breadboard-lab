import type { Bit } from '../../logic/evaluate';
import { glyphOf } from '../../logic/sevenSeg';
import { inputPins, nodeSize } from '../../logic/shapes';
import type { LogicNode } from '../../logic/types';
import { LOGIC_CELL as C } from '../../state/logic';

const BCD_NAMES = ['A', 'B', 'C', 'D', 'DP'];
const SEGMENT_PIN_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
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

/**
 * 規格（2026-10-13 seven-seg）第 5 節：邏輯圖上的 7 段顯示器（4 × 5 格；左側 A–D 腳，中間依 74LS47 的字形點亮）。
 * 下方寫出目前的數字：10–15 是 74LS47 的怪字形，15 更是全暗，只看字形分不出來。
 * 子專案 32：第 5 隻腳 DP（小數點，在 B 和 C 中間）；每段直接控制時 8 隻腳 a–g、dp，亮的段由 lit 決定。
 */
export function DisplayBody({
  node,
  value,
  dp,
  lit: litSegments,
  inputs = [],
  selected = false,
}: {
  node: LogicNode;
  value?: number | 'X';
  dp?: Bit;
  lit?: string[] | 'X';
  inputs?: Array<Bit | undefined>;
  selected?: boolean;
}) {
  const { h } = nodeSize(node);
  const rows = inputPins({ ...node, x: 0, y: 0 }).map((p) => p.y);
  const names = node.segments ? SEGMENT_PIN_NAMES : BCD_NAMES;
  const lit = new Set(node.segments ? (litSegments === undefined || litSegments === 'X' ? [] : litSegments) : value === undefined ? [] : [...glyphOf(value)]);
  const dot = node.segments ? lit.has('dp') : dp === 1;
  const cy = ((h - 1) / 2) * C;
  const lines = segmentLines(2.35 * C, cy, 1.25 * C, Math.min(2.9, h - 2.1) * C);
  return (
    <g data-logic-display={node.id} data-value={value === undefined ? '' : String(value)} data-dp={dot ? 'true' : undefined}>
      {rows.map((y, i) => (
        <line key={i} x1={0} y1={y * C} x2={0.6 * C} y2={y * C} stroke={pinColor(inputs[i])} strokeWidth={2} />
      ))}
      <rect x={0.6 * C} y={-0.5 * C} width={3.2 * C} height={h * C} rx={4} fill="#1f2937" stroke={selected ? '#0284c7' : '#0f172a'} strokeWidth={selected ? 2.4 : 1.6} />
      {rows.map((y, i) => (
        <text key={i} x={0.95 * C} y={y * C} fontSize={(names[i].length > 1 ? 0.32 : 0.42) * C} fontWeight={700} fill="#cbd5e1" textAnchor="middle" dominantBaseline="central">
          {names[i]}
        </text>
      ))}
      {Object.entries(lines).map(([s, [x1, y1, x2, y2]]) => (
        <line key={s} data-segment={s} data-lit={lit.has(s) ? 'true' : undefined} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit.has(s) ? '#ef4444' : '#374151'} strokeWidth={0.26 * C} strokeLinecap="round" />
      ))}
      {/* 小數點 */}
      <circle data-segment="dp" data-lit={dot ? 'true' : undefined} cx={3.25 * C} cy={cy + Math.min(2.9, h - 2.1) * C * 0.5} r={0.16 * C} fill={dot ? '#ef4444' : '#374151'} />
      <text x={2.2 * C} y={-0.95 * C} fontSize={0.5 * C} fontWeight={700} fill="#1e293b" textAnchor="middle" dominantBaseline="central">
        {node.name}
      </text>
      {!node.segments && typeof value === 'number' && (
        <text data-display-number x={2.2 * C} y={(h - 0.05) * C} fontSize={0.42 * C} fill="#475569" textAnchor="middle" dominantBaseline="central">
          = {value}
          {dot ? '.' : ''}
        </text>
      )}
    </g>
  );
}
