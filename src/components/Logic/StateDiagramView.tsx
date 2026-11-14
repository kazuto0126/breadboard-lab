import { useMemo } from 'react';
import { labelLegend, stateDiagram, stateLayout } from '../../logic/stateDiagram';
import type { StateTask } from '../../logic/stateTask';

/** 子專案 63（規格 2026-11-14 state-diagram 第 3 節）：狀態圖（只顯示，跟著狀態表即時更新）。 */
const SIZE = 300;
const R = 22;
/** 圓圈範圍外留的空間（回到自己的箭頭約 66、標籤再加一點）。 */
const PAD = 90;

type P = { x: number; y: number };
const add = (a: P, b: P, k = 1): P => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const unit = (a: P, b: P): P => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
};
const rotate = (u: P, deg: number): P => {
  const a = (deg * Math.PI) / 180;
  return { x: u.x * Math.cos(a) - u.y * Math.sin(a), y: u.x * Math.sin(a) + u.y * Math.cos(a) };
};

/** 兩個圓圈之間的箭頭：有反方向的箭頭時往旁邊彎，避免疊在一起。 */
function arc(a: P, b: P, bend: number) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const u = unit(a, b);
  const control = add(mid, { x: -u.y, y: u.x }, bend);
  const start = add(a, unit(a, control), R);
  const end = add(b, unit(b, control), R + 2);
  // 彎的箭頭標籤放在中間；直的放在靠起點的地方（經過圖中間的直線很多時，標籤才不會疊在一起）。
  const t = bend === 0 ? 0.3 : 0.5;
  const label = { x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x, y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y };
  return { d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, label: add(label, { x: -u.y, y: u.x }, bend === 0 ? 10 : Math.sign(bend) * 10) };
}

/** 回到自己的箭頭：畫在圓圈外側（離圖中心遠的那一邊）。 */
function loop(p: P, center: P) {
  const u = p.x === center.x && p.y === center.y ? { x: 0, y: -1 } : unit(center, p);
  const s = add(p, rotate(u, -35), R);
  const e = add(p, rotate(u, 35), R + 2);
  const c1 = add(p, rotate(u, -40), R + 42);
  const c2 = add(p, rotate(u, 40), R + 42);
  return { d: `M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${e.x} ${e.y}`, label: add(p, u, R + 40) };
}

export function StateDiagramView({ task }: { task: StateTask }) {
  const d = useMemo(() => stateDiagram(task), [task]);
  const at = useMemo(() => stateLayout(task.states, SIZE), [task.states]);
  const center = { x: SIZE / 2, y: SIZE / 2 };
  // 外框跟著圓圈的範圍，四周留給回到自己的箭頭與標籤。
  const xs = at.map((p) => p.x);
  const ys = at.map((p) => p.y);
  const view = [Math.min(...xs) - PAD, Math.min(...ys) - PAD, Math.max(...xs) - Math.min(...xs) + 2 * PAD, Math.max(...ys) - Math.min(...ys) + 2 * PAD];
  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="mb-1 text-xs font-semibold text-slate-200">狀態圖</div>
      <svg data-testid="state-diagram" viewBox={view.join(' ')} className="mx-auto block w-full max-w-sm" role="img" aria-label="狀態圖">
        <defs>
          <marker id="state-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>
        {d.edges.map((e) => {
          const self = e.from === e.to;
          const back = d.edges.some((o) => o.from === e.to && o.to === e.from);
          const g = self ? loop(at[e.from], center) : arc(at[e.from], at[e.to], back ? 28 : 0);
          return (
            <g key={`${e.from}-${e.to}`} data-state-edge={`${e.from}-${e.to}`}>
              <path d={g.d} fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#state-arrow)" />
              {e.labels.length > 0 && (
                <text x={g.label.x} y={g.label.y} textAnchor="middle" dominantBaseline="middle" className="fill-amber-200 font-mono" fontSize={11}>
                  {e.labels.join(', ')}
                </text>
              )}
            </g>
          );
        })}
        {at.map((p, s) => (
          <g key={s} data-state-node={s}>
            <circle cx={p.x} cy={p.y} r={R} fill="#0f172a" stroke={s === 0 ? '#38bdf8' : '#cbd5e1'} strokeWidth={s === 0 ? 2.5 : 1.5} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-slate-100" fontSize={d.moore ? 10 : 12}>
              {d.names[s]}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-slate-400">
        {labelLegend(task, d.moore)}；藍色圈是重設後的 S0。
        {d.dontCare.length > 0 && ` 下一個狀態是 X 的 ${d.dontCare.length} 列沒有畫箭頭。`}
      </p>
    </div>
  );
}
