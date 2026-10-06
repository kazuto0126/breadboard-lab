import { boardGroups, boardRects, type BoardMovePlan } from '../../editor/boards';
import { PITCH } from '../../editor/geometry';
import { UI } from '../../render/theme';
import type { BreadboardInstance } from '../../types/board';
import { boardGroupTitle } from '../common/describe';

const P = PITCH;

/** 每個 Board Group 的共同外框與「Board Group N · M Boards」標籤；選取組內的板子時外框加粗（38.10、38.16）。 */
export function GroupOutlines({ boards, activeBoardId }: { boards: BreadboardInstance[]; activeBoardId: string | null }) {
  const groups = boardGroups({ boards });
  if (groups.length === 0) return null;
  const pad = 0.4 * P;
  return (
    <g data-ui="board-groups" pointerEvents="none">
      {groups.map((g, i) => {
        const active = activeBoardId !== null && g.boardIds.includes(activeBoardId);
        return (
          <g key={g.id} data-board-group={g.id}>
            <rect
              x={g.x * P - pad}
              y={g.y * P - pad}
              width={g.width * P + 2 * pad}
              height={g.height * P + 2 * pad}
              rx={0.8 * P}
              fill="none"
              stroke={UI.group}
              strokeWidth={active ? 3 : 1.6}
              strokeOpacity={active ? 1 : 0.75}
              strokeDasharray={active ? undefined : `${0.5 * P} ${0.3 * P}`}
            />
            <text x={g.x * P} y={g.y * P - pad - 0.3 * P} fill={UI.group} fontSize={0.7 * P} fontWeight={600}>
              {boardGroupTitle(g, i)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** 拖曳中的板子：可以放的位置畫藍色虛線框，重疊或會拉斷導線時整塊變紅。 */
export function MovingBoards({ boards, ids, plan }: { boards: BreadboardInstance[]; ids: string[]; plan: BoardMovePlan }) {
  const rects = boardRects({ boards }).filter((r) => ids.includes(r.id));
  const blocked = plan.blocked !== null;
  const message = plan.blocked === 'overlap' ? '不能和其他麵包板重疊' : plan.blocked === 'wires' ? '有跨板導線，不能拆開' : null;
  return (
    <g data-ui="moving-boards" pointerEvents="none">
      {rects.map((r) => (
        <rect
          key={r.id}
          x={r.x * P}
          y={r.y * P}
          width={r.width * P}
          height={r.height * P}
          rx={0.55 * P}
          fill={blocked ? UI.bad : 'none'}
          fillOpacity={blocked ? 0.28 : undefined}
          stroke={blocked ? UI.bad : UI.select}
          strokeWidth={2.5}
          strokeDasharray={blocked ? undefined : `${0.4 * P} ${0.25 * P}`}
        />
      ))}
      {message && rects[0] && (
        <text
          x={(rects[0].x + rects[0].width / 2) * P}
          y={(rects[0].y + rects[0].height / 2) * P}
          fill="#fee2e2"
          stroke="#7f1d1d"
          strokeWidth={4}
          paintOrder="stroke"
          fontSize={P}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {message}
        </text>
      )}
    </g>
  );
}

/** 即將吸附時的淡藍色預覽線與「SNAP」標籤（38.16）。boards 是拖曳中（已位移）的板子位置。 */
export function SnapPreview({ boards, plan }: { boards: BreadboardInstance[]; plan: BoardMovePlan }) {
  const snap = plan.snap;
  if (!snap || plan.blocked) return null;
  const target = boardRects({ boards }).find((r) => r.id === snap.targetId);
  if (!target) return null;
  const left = target.x;
  const right = target.x + target.width;
  const top = target.y;
  const bottom = target.y + target.height;
  const [x1, y1, x2, y2] =
    snap.side === 'bottom'
      ? [left, bottom, right, bottom]
      : snap.side === 'top'
        ? [left, top, right, top]
        : snap.side === 'right'
          ? [right, top, right, bottom]
          : [left, top, left, bottom];
  const stacked = y1 === y2;
  const cx = ((x1 + x2) / 2) * P;
  const cy = ((y1 + y2) / 2) * P;
  return (
    <g data-ui="snap-preview" pointerEvents="none">
      <line x1={x1 * P} y1={y1 * P} x2={x2 * P} y2={y2 * P} stroke={UI.snap} strokeWidth={0.6 * P} strokeOpacity={0.3} strokeLinecap="round" />
      <line x1={x1 * P} y1={y1 * P} x2={x2 * P} y2={y2 * P} stroke={UI.snap} strokeWidth={3} strokeLinecap="round" />
      <g transform={`translate(${cx} ${cy})`}>
        <rect x={-2.2 * P} y={-0.65 * P} width={4.4 * P} height={1.3 * P} rx={0.65 * P} fill="#0c4a6e" stroke={UI.snap} strokeWidth={2} />
        <text fill="#e0f2fe" fontSize={0.7 * P} fontWeight={700} textAnchor="middle" dominantBaseline="central">
          {stacked ? '↕' : '↔'} SNAP
        </text>
      </g>
    </g>
  );
}

/** 選取的麵包板外框。 */
export function BoardSelection({ boards, id }: { boards: BreadboardInstance[]; id: string }) {
  const r = boardRects({ boards }).find((x) => x.id === id);
  if (!r) return null;
  const pad = 0.15 * P;
  return (
    <rect
      data-ui="board-selection"
      x={r.x * P - pad}
      y={r.y * P - pad}
      width={r.width * P + 2 * pad}
      height={r.height * P + 2 * pad}
      rx={0.65 * P}
      fill="none"
      stroke={UI.select}
      strokeWidth={2.5}
      pointerEvents="none"
    />
  );
}
