import { memo } from 'react';
import { MB102_LAYOUT } from '../../core/breadboard/layouts';
import { localPx, PITCH, type BoardFrame } from '../../editor/geometry';
import { BOARD } from '../../render/theme';

const P = PITCH;
const HOLE = 0.42 * P;
const COLUMN_LABELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

/** 麵包板底圖：板身、電源軌色線、中央凹槽、830 個孔與標籤。靜態圖層，不隨互動重繪。 */
export const BoardBackground = memo(function BoardBackground({ frame }: { frame: BoardFrame }) {
  const { board, width, height } = frame;
  const layout = MB102_LAYOUT;
  const rails = layout.rows.filter((r) => r.kind === 'rail');
  const terminals = layout.rows.filter((r) => r.kind === 'terminal');
  const xLeft = localPx(0.5, 0).x;
  const xRight = localPx(board.width + 0.5, 0).x;
  const channelTop = localPx(0, 8.62).y;
  const channelBottom = localPx(0, 10.38).y;

  return (
    <g transform={`translate(${frame.x} ${frame.y})`} data-board={frame.id}>
      <rect x={3} y={5} width={width} height={height} rx={0.55 * P} fill={BOARD.shadow} fillOpacity={0.35} />
      <rect x={0} y={0} width={width} height={height} rx={0.55 * P} fill={BOARD.body} stroke={BOARD.edge} strokeWidth={1.5} />

      {/* 中央凹槽 */}
      <rect x={xLeft} y={channelTop} width={xRight - xLeft} height={channelBottom - channelTop} rx={2} fill={BOARD.channel} />
      <line x1={xLeft} x2={xRight} y1={channelTop + 1} y2={channelTop + 1} stroke={BOARD.channelLine} strokeWidth={1.5} />
      <line x1={xLeft} x2={xRight} y1={channelBottom - 1} y2={channelBottom - 1} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1} />

      {/* 電源軌色線與 +/− 標記 */}
      {rails.map((row) => {
        if (row.kind !== 'rail') return null;
        const plus = row.label.endsWith('+');
        const color = plus ? BOARD.railPlus : BOARD.railMinus;
        const outerTop = row.label.startsWith('T') ? !plus : plus;
        const lineY = localPx(0, row.y + (outerTop ? -0.56 : 0.56)).y;
        const textY = localPx(0, row.y).y;
        const sign = plus ? '+' : '−';
        return (
          <g key={row.label}>
            <line x1={localPx(2.4, 0).x} x2={localPx(61.6, 0).x} y1={lineY} y2={lineY} stroke={color} strokeWidth={2} strokeLinecap="round" />
            <text x={localPx(1.2, 0).x} y={textY} fill={color} fontSize={0.75 * P} fontWeight={700} textAnchor="middle" dominantBaseline="central">
              {sign}
            </text>
            <text x={localPx(62.8, 0).x} y={textY} fill={color} fontSize={0.75 * P} fontWeight={700} textAnchor="middle" dominantBaseline="central">
              {sign}
            </text>
          </g>
        );
      })}

      {/* 排標籤 A–J（左右兩側） */}
      {terminals.map((row) =>
        row.kind === 'terminal' ? (
          <g key={row.label} fill={BOARD.label} fontSize={0.5 * P} fontWeight={600} textAnchor="middle" dominantBaseline="central">
            <text x={localPx(0.1, 0).x} y={localPx(0, row.y).y}>
              {row.label}
            </text>
            <text x={localPx(board.width + 0.9, 0).x} y={localPx(0, row.y).y}>
              {row.label}
            </text>
          </g>
        ) : null,
      )}

      {/* 欄號（印在電源軌與端子區之間的空隙列） */}
      {[3, 16].map((y) => (
        <g key={y} fill={BOARD.label} fontSize={0.42 * P} textAnchor="middle" dominantBaseline="central">
          {COLUMN_LABELS.map((x) => (
            <text key={x} x={localPx(x, 0).x} y={localPx(0, y).y}>
              {x}
            </text>
          ))}
        </g>
      ))}

      {/* 孔 */}
      <g fill={BOARD.hole}>
        {board.nodes.map((n) => {
          if (n.kind !== 'hole') return null;
          const c = localPx(n.x, n.y);
          return <rect key={n.id} data-hole={n.name ?? undefined} x={c.x - HOLE / 2} y={c.y - HOLE / 2} width={HOLE} height={HOLE} rx={1.4} />;
        })}
      </g>
    </g>
  );
});
