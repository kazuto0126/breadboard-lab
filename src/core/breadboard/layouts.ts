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
export const MB102_LAYOUT: BoardLayout = { id: 'MB102', name: 'MB-102', width: 63, height: 18, rows };

const terminalArea = (area: number, top: number): LayoutRow[] => [
  ...TOP_ROWS.map((label, i): LayoutRow => ({ y: top + i, kind: 'terminal', label, half: 'top', area })),
  ...BOTTOM_ROWS.map((label, i): LayoutRow => ({ y: top + 7 + i, kind: 'terminal', label, half: 'bot', area })),
];
const railPair = (n: 1 | 2 | 3 | 4 | 5, y: number): LayoutRow[] => [
  { y, kind: 'rail', label: `P${n}+`, holeColumns: RAIL_COLUMNS },
  { y: y + 1, kind: 'rail', label: `P${n}-`, holeColumns: RAIL_COLUMNS },
];

/**
 * EIC-1106（2390 孔）：由上到下 接線柱、P1、P2、插孔區 1、P3、插孔區 2、P4、插孔區 3、P5（規格 2026-10-11 eic-board 第 2 節）。
 * 每個插孔區和 MB-102 相同（63 欄 × A–J，中間凹槽）；每條電源軌 + − 兩列、各 50 孔、整條相通。
 */
export const EIC1106_LAYOUT: BoardLayout = {
  id: 'EIC1106',
  name: 'EIC-1106',
  width: 63,
  height: 56,
  rows: [
    ...railPair(1, 4),
    ...railPair(2, 7),
    ...terminalArea(1, 10),
    ...railPair(3, 23),
    ...terminalArea(2, 26),
    ...railPair(4, 39),
    ...terminalArea(3, 42),
    ...railPair(5, 55),
  ],
  posts: [
    { x: 20, y: 2, name: '紅', color: 'red', source: 'vcc' },
    { x: 28, y: 2, name: '黑', color: 'black', source: 'gnd' },
    { x: 36, y: 2, name: '黃', color: 'yellow' },
    { x: 44, y: 2, name: '綠', color: 'green' },
  ],
};

