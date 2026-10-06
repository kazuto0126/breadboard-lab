import { memo } from 'react';
import { getBoard } from '../../core/breadboard/registry';
import { UNIT } from '../interaction/viewport';

const board = getBoard('MB102', 'b1');
const holes = board.nodes.filter((n) => n.kind === 'hole');
const COLUMN_LABELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const ROW_LABELS: Array<{ y: number; text: string; color: string }> = [
  { y: 1, text: '−', color: '#1565c0' },
  { y: 2, text: '+', color: '#d32f2f' },
  ...['A', 'B', 'C', 'D', 'E'].map((text, i) => ({ y: 4 + i, text, color: '#6b7280' })),
  ...['F', 'G', 'H', 'I', 'J'].map((text, i) => ({ y: 11 + i, text, color: '#6b7280' })),
  { y: 17, text: '+', color: '#d32f2f' },
  { y: 18, text: '−', color: '#1565c0' },
];

/** 靜態底板：板面、電源軌色線、凹槽、830 個孔、欄號與列號。只畫一次。 */
export const BoardBase = memo(function BoardBase() {
  return (
    <g>
      <rect x={0} y={0} width={640} height={190} rx={8} fill="#f7f3e8" stroke="#d6cfbd" strokeWidth={1} />
      <rect x={10} y={86} width={620} height={18} fill="#e9e2d0" />
      <line x1={25} y1={5} x2={615} y2={5} stroke="#1565c0" strokeWidth={0.8} />
      <line x1={25} y1={25} x2={615} y2={25} stroke="#d32f2f" strokeWidth={0.8} />
      <line x1={25} y1={165} x2={615} y2={165} stroke="#d32f2f" strokeWidth={0.8} />
      <line x1={25} y1={185} x2={615} y2={185} stroke="#1565c0" strokeWidth={0.8} />
      {holes.map((n) => (
        <rect key={n.id} data-hole={n.name ?? undefined} x={n.x * UNIT - 2.5} y={n.y * UNIT - 2.5} width={5} height={5} rx={1} fill="#4a4a4a" />
      ))}
      {COLUMN_LABELS.flatMap((x) => [
        <text key={`t${x}`} x={x * UNIT} y={30} fontSize={4} fill="#6b7280" textAnchor="middle" dominantBaseline="central">
          {x}
        </text>,
        <text key={`b${x}`} x={x * UNIT} y={160} fontSize={4} fill="#6b7280" textAnchor="middle" dominantBaseline="central">
          {x}
        </text>,
      ])}
      {ROW_LABELS.flatMap((r) => [
        <text key={`l${r.y}`} x={4} y={r.y * UNIT} fontSize={5} fill={r.color} textAnchor="middle" dominantBaseline="central">
          {r.text}
        </text>,
        <text key={`r${r.y}`} x={636} y={r.y * UNIT} fontSize={5} fill={r.color} textAnchor="middle" dominantBaseline="central">
          {r.text}
        </text>,
      ])}
    </g>
  );
});
