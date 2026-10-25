import { useMemo, useState, type PointerEvent } from "react";
import type { OutValue, SequenceTable } from "../../logic/evaluate";
import { waveLanes, type WaveLane } from "../../logic/waveform";

/** 子專案 50（規格 2026-10-25 waveform 第 2 節）：時序表畫成波形。 */
const CELL = 20;
const LANE = 18;
const GAP = 12;
const LEFT = 52;

const text = (v: OutValue) => (v === "X" ? "?" : String(v));

/** 一條 0 / 1 線的路徑；不確定的格子另外畫（中間的灰線）。 */
function bitPath(values: OutValue[], top: number): string {
  let d = "";
  values.forEach((v, k) => {
    const x = LEFT + k * CELL;
    const y = v === 1 ? top : v === 0 ? top + LANE : top + LANE / 2;
    d += `${k === 0 ? "M" : " L"}${x},${y} L${x + CELL},${y}`;
  });
  return d;
}

/** 時脈：第 k 次脈衝畫在第 k − 1 格的後半，在第 k 格開頭落下。 */
function clockPath(count: number, top: number): string {
  let d = `M${LEFT},${top + LANE}`;
  for (let k = 1; k < count; k++) {
    const x = LEFT + k * CELL;
    d += ` L${x - CELL / 2},${top + LANE} L${x - CELL / 2},${top} L${x},${top} L${x},${top + LANE}`;
  }
  return `${d} L${LEFT + count * CELL},${top + LANE}`;
}

function Lane({ lane, top }: { lane: WaveLane; top: number }) {
  if (lane.kind === "clock")
    return (
      <path
        d={clockPath(lane.values.length, top)}
        fill="none"
        stroke="#38bdf8"
        strokeWidth={1.5}
      />
    );
  if (lane.kind === "value")
    return (
      <g>
        {lane.values.map((v, k) => {
          const x = LEFT + k * CELL;
          const t = text(v);
          return (
            <g key={k}>
              <polygon
                points={`${x + 2},${top + LANE / 2} ${x + 5},${top} ${x + CELL - 2},${top} ${x + CELL + 1},${top + LANE / 2} ${x + CELL - 2},${top + LANE} ${x + 5},${top + LANE}`}
                fill="#1e293b"
                stroke={v === "X" ? "#64748b" : "#a78bfa"}
              />
              <text
                x={x + CELL / 2 + 1}
                y={top + LANE - 5}
                fontSize={t.length > 2 ? 7 : 11}
                textAnchor="middle"
                fill={v === "X" ? "#94a3b8" : "#fcd34d"}
                fontFamily="monospace"
              >
                {t.length > 4 ? `${t.slice(0, 3)}…` : t}
              </text>
            </g>
          );
        })}
      </g>
    );
  return (
    <g>
      <path
        d={bitPath(lane.values, top)}
        fill="none"
        stroke="#34d399"
        strokeWidth={1.5}
      />
      {lane.values.map((v, k) =>
        v === 1 || v === 0 ? null : (
          <g key={k}>
            <line
              x1={LEFT + k * CELL}
              y1={top + LANE / 2}
              x2={LEFT + (k + 1) * CELL}
              y2={top + LANE / 2}
              stroke="#94a3b8"
              strokeWidth={3}
            />
            <text
              x={LEFT + k * CELL + CELL / 2}
              y={top + LANE / 2 - 3}
              fontSize={9}
              textAnchor="middle"
              fill="#94a3b8"
            >
              ?
            </text>
          </g>
        ),
      )}
    </g>
  );
}

export function Waveform({
  table,
}: {
  table: Extract<SequenceTable, { ok: true }>;
}) {
  const lanes = useMemo(() => waveLanes(table), [table]);
  const [at, setAt] = useState<number | null>(null);
  const count = table.rows.length;
  const width = LEFT + count * CELL + 4;
  const bottom = lanes.length * (LANE + GAP);
  const height = bottom + 14;
  /** 滑鼠或手指指著第幾格。 */
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const k = Math.floor(
      ((e.clientX - box.left) * (width / box.width) - LEFT) / CELL,
    );
    setAt(k >= 0 && k < count ? k : null);
  };
  const row = at === null ? null : table.rows[at];
  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          data-testid="waveform"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onPointerMove={point}
          onPointerDown={point}
          onPointerLeave={() => setAt(null)}
          className="touch-pan-x select-none"
        >
          {table.rows.map((r, k) => (
            <g key={r.pulse}>
              <line
                x1={LEFT + k * CELL}
                y1={0}
                x2={LEFT + k * CELL}
                y2={bottom}
                stroke="#1e293b"
              />
              <text
                x={LEFT + k * CELL + CELL / 2}
                y={bottom + 10}
                fontSize={9}
                textAnchor="middle"
                fill="#64748b"
              >
                {r.pulse}
              </text>
            </g>
          ))}
          {lanes.map((lane, i) => {
            const top = 4 + i * (LANE + GAP);
            return (
              <g key={i} data-lane={lane.name}>
                <text
                  x={2}
                  y={top + LANE - 4}
                  fontSize={11}
                  fill={lane.kind === "clock" ? "#7dd3fc" : "#fcd34d"}
                  fontFamily="monospace"
                >
                  {lane.name.length > 7
                    ? `${lane.name.slice(0, 6)}…`
                    : lane.name}
                </text>
                <Lane lane={lane} top={top} />
              </g>
            );
          })}
          {at !== null && (
            <rect
              x={LEFT + at * CELL}
              y={0}
              width={CELL}
              height={bottom}
              fill="#f87171"
              opacity={0.15}
              stroke="#f87171"
              strokeDasharray="3 2"
            />
          )}
        </svg>
      </div>
      <p
        data-testid="waveform-readout"
        className="mt-1 min-h-[1.25rem] font-mono text-xs text-slate-200"
      >
        {row === null ? (
          <span className="font-sans text-slate-400">
            把滑鼠移到圖上（平板用手指點）看每次脈衝後的值
          </span>
        ) : (
          `${row.pulse === 0 ? "重設後（還沒有脈衝）" : `第 ${row.pulse} 次脈衝後`}：${table.outputs.map((n, i) => `${n} = ${text(row.out[i])}`).join("、")}`
        )}
      </p>
    </div>
  );
}
