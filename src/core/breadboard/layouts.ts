import type { BoardLayout, LayoutRow, TerminalRowLabel } from '../../types/board';

const RAIL_COLUMNS: number[] = [];
for (let group = 0; group < 10; group++) {
  for (let i = 0; i < 5; i++) RAIL_COLUMNS.push(3 + group * 6 + i);
}

const TOP_ROWS: TerminalRowLabel[] = ['A', 'B', 'C', 'D', 'E'];
const BOTTOM_ROWS: TerminalRowLabel[] = ['F', 'G', 'H', 'I', 'J'];

const rows: LayoutRow[] = [
  { y: 1, kind: 'rail', label: 'T-', holeColumns: RAIL_COLUMNS },
  { y: 2, kind: 'rail', label: 'T+', holeColumns: RAIL_COLUMNS },
  { y: 3, kind: 'surface' },
  ...TOP_ROWS.map((label, i): LayoutRow => ({ y: 4 + i, kind: 'terminal', label, half: 'top' })),
  { y: 9, kind: 'surface' },
  { y: 10, kind: 'surface' },
  ...BOTTOM_ROWS.map((label, i): LayoutRow => ({ y: 11 + i, kind: 'terminal', label, half: 'bot' })),
  { y: 16, kind: 'surface' },
  { y: 17, kind: 'rail', label: 'B+', holeColumns: RAIL_COLUMNS },
  { y: 18, kind: 'rail', label: 'B-', holeColumns: RAIL_COLUMNS },
];

/** MB-102：63 欄 × A–J，上下各兩條 50 孔全長導通的電源軌。 */
export const MB102_LAYOUT: BoardLayout = { id: 'MB102', width: 63, height: 18, rows };
