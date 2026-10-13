import { memo } from 'react';
import { getLayout } from '../../core/breadboard/registry';
import { localPx, PITCH, type BoardFrame } from '../../editor/geometry';
import { BOARD } from '../../render/theme';

const P = PITCH;
/** 孔的大小：比格距小很多，板面看起來比較清爽（實際麵包板的孔約 0.8 mm 見方，格距 2.54 mm）。 */
const HOLE = 0.3 * P;
const COLUMN_LABELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

/**
 * 麵包板底圖：板身、電源軌色線、中央凹槽、830 個孔與標籤。靜態圖層，不隨互動重繪。
 * 有多塊板時，左上角印出板子 ID（label）。
 */
export const BoardBackground = memo(function BoardBackground({ frame, label }: { frame: BoardFrame; label?: string }) {
  const { board, width, height } = frame;
  const layout = getLayout(board.layoutId);
  const rails = layout.rows.filter((r) => r.kind === 'rail');
  const terminals = layout.rows.filter((r) => r.kind === 'terminal');
  const xLeft = localPx(0.5, 0).x;
  const xRight = localPx(board.width + 0.5, 0).x;
  // 每個插孔區的凹槽：E 列與 F 列之間。
  const channels = layout.rows.flatMap((r) => {
    if (r.kind !== 'terminal' || r.label !== 'E') return [];
    const f = layout.rows.find((x) => x.kind === 'terminal' && x.label === 'F' && x.area === r.area);
    return f ? [{ key: r.area ?? 0, top: localPx(0, r.y + 0.62).y, bottom: localPx(0, f.y - 0.62).y, area: r.area }] : [];
  });
  // 欄號：每個插孔區 A 列的上一列與 J 列的下一列。
  const numberRows = layout.rows.flatMap((r) => (r.kind === 'terminal' && r.label === 'A' ? [r.y - 1] : r.kind === 'terminal' && r.label === 'J' ? [r.y + 1] : []));
  const POST_FILL = { red: '#d32f2f', black: '#212121', yellow: '#f9a825', green: '#2e7d32' };

  return (
    <g transform={`translate(${frame.x} ${frame.y})`} data-board={frame.id}>
      <rect x={3} y={5} width={width} height={height} rx={0.55 * P} fill={BOARD.shadow} fillOpacity={0.35} />
      <rect x={0} y={0} width={width} height={height} rx={0.55 * P} fill={BOARD.body} stroke={BOARD.edge} strokeWidth={1.5} />

      {label && (
        <text x={0.3 * P} y={0.62 * P} fill={BOARD.label} fontSize={0.55 * P} fontWeight={700} dominantBaseline="central" data-board-label={label}>
          {label}
        </text>
      )}

      {/* 每個插孔區的中央凹槽（EIC-1106 另外印區號） */}
      {channels.map((c) => (
        <g key={c.key}>
          <rect x={xLeft} y={c.top} width={xRight - xLeft} height={c.bottom - c.top} rx={2} fill={BOARD.channel} />
          <line x1={xLeft} x2={xRight} y1={c.top + 1} y2={c.top + 1} stroke={BOARD.channelLine} strokeWidth={1.5} />
          <line x1={xLeft} x2={xRight} y1={c.bottom - 1} y2={c.bottom - 1} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1} />
          {c.area && (
            <text x={localPx(1.6, 0).x} y={(c.top + c.bottom) / 2} fill={BOARD.label} fontSize={0.55 * P} fontWeight={800} dominantBaseline="central" data-area={c.area}>
              {`區 ${c.area}`}
            </text>
          )}
        </g>
      ))}

      {/* 接線柱（EIC-1106） */}
      {(layout.posts ?? []).map((p) => {
        const c = localPx(p.x, p.y);
        return (
          <g key={p.name} data-post={p.color}>
            <circle cx={c.x} cy={c.y} r={0.48 * P} fill={POST_FILL[p.color]} stroke="#00000055" strokeWidth={1} />
            <text x={c.x + 0.8 * P} y={c.y} fill={BOARD.label} fontSize={0.5 * P} fontWeight={700} dominantBaseline="central">
              {`${p.name}${p.source === 'vcc' ? ' +5V' : p.source === 'gnd' ? ' GND' : ''}`}
            </text>
          </g>
        );
      })}

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
            {row.label.startsWith('P') && plus && (
              <text x={localPx(0.1, 0).x} y={localPx(0, row.y + 0.5).y} fill={BOARD.label} fontSize={0.42 * P} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                {row.label.slice(0, 2)}
              </text>
            )}
          </g>
        );
      })}

      {/* 排標籤 A–J（左右兩側） */}
      {terminals.map((row) =>
        row.kind === 'terminal' ? (
          <g key={`${row.area ?? 0}-${row.label}`} fill={BOARD.label} fontSize={0.5 * P} fontWeight={600} textAnchor="middle" dominantBaseline="central">
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
      {numberRows.map((y) => (
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
