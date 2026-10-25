import type { BlockChip } from './types';

/** 規格（2026-10-13 logic-blocks）第 3 節：方塊的腳（上到下）；名稱和元件定義的腳名一樣。 */
export const BLOCK_PINS: Record<BlockChip, { inputs: string[]; outputs: string[] }> = {
  '74LS83': { inputs: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C0'], outputs: ['S1', 'S2', 'S3', 'S4', 'C4'] },
  '74LS151': { inputs: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'B', 'C', '/G'], outputs: ['Y', 'W'] },
  '74LS153': { inputs: ['1C0', '1C1', '1C2', '1C3', '2C0', '2C1', '2C2', '2C3', 'A', 'B', '/1G', '/2G'], outputs: ['1Y', '2Y'] },
  '74LS138': { inputs: ['A', 'B', 'C', 'G1', '/G2A', '/G2B'], outputs: ['/Y0', '/Y1', '/Y2', '/Y3', '/Y4', '/Y5', '/Y6', '/Y7'] },
  '74LS85': { inputs: ['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'IA<B', 'IA=B', 'IA>B'], outputs: ['OA<B', 'OA=B', 'OA>B'] },
  // 子專案 46（規格 2026-10-24 sequential-logic）：時序 IC。
  '74LS74': { inputs: ['1D', '1CLK', '1/PRE', '1/CLR', '2D', '2CLK', '2/PRE', '2/CLR'], outputs: ['1Q', '1/Q', '2Q', '2/Q'] },
  '74LS76': { inputs: ['1J', '1CLK', '1K', '1/PRE', '1/CLR', '2J', '2CLK', '2K', '2/PRE', '2/CLR'], outputs: ['1Q', '1/Q', '2Q', '2/Q'] },
  '74LS90': { inputs: ['CKA', 'CKB', 'R0(1)', 'R0(2)', 'R9(1)', 'R9(2)'], outputs: ['QA', 'QB', 'QC', 'QD'] },
  '74LS93': { inputs: ['CKA', 'CKB', 'R0(1)', 'R0(2)'], outputs: ['QA', 'QB', 'QC', 'QD'] },
  '74LS161': { inputs: ['CLK', '/CLR', '/LOAD', 'ENP', 'ENT', 'A', 'B', 'C', 'D'], outputs: ['QA', 'QB', 'QC', 'QD', 'RCO'] },
  '74LS193': { inputs: ['UP', 'DOWN', 'CLR', '/LOAD', 'A', 'B', 'C', 'D'], outputs: ['QA', 'QB', 'QC', 'QD', '/CO', '/BO'] },
  // 子專案 51（規格 2026-10-25 single-flip-flops）：單顆正反器（74LS74 / 76 的一組）。
  DFF: { inputs: ['D', 'CLK', '/PRE', '/CLR'], outputs: ['Q', '/Q'] },
  JKFF: { inputs: ['J', 'CLK', 'K', '/PRE', '/CLR'], outputs: ['Q', '/Q'] },
};

/**
 * 子專案 46：時序 IC 的輸入可以不接，用這裡的值（轉成麵包板時接到 +5 V / GND）：清除、預設、載入不用；資料接 0；時脈接 +5 V。
 * 組合邏輯的 IC 沒有這張表（每隻輸入都要接）。
 */
export const BLOCK_DEFAULTS: Partial<Record<BlockChip, Record<string, 0 | 1>>> = {
  '74LS74': { '1D': 0, '1CLK': 1, '1/PRE': 1, '1/CLR': 1, '2D': 0, '2CLK': 1, '2/PRE': 1, '2/CLR': 1 },
  '74LS76': { '1J': 0, '1CLK': 1, '1K': 0, '1/PRE': 1, '1/CLR': 1, '2J': 0, '2CLK': 1, '2K': 0, '2/PRE': 1, '2/CLR': 1 },
  '74LS90': { CKA: 1, CKB: 1, 'R0(1)': 0, 'R0(2)': 0, 'R9(1)': 0, 'R9(2)': 0 },
  '74LS93': { CKA: 1, CKB: 1, 'R0(1)': 0, 'R0(2)': 0 },
  '74LS161': { CLK: 1, '/CLR': 1, '/LOAD': 1, ENP: 1, ENT: 1, A: 0, B: 0, C: 0, D: 0 },
  '74LS193': { UP: 1, DOWN: 1, CLR: 0, '/LOAD': 1, A: 0, B: 0, C: 0, D: 0 },
  DFF: { D: 0, CLK: 1, '/PRE': 1, '/CLR': 1 },
  JKFF: { J: 0, CLK: 1, K: 0, '/PRE': 1, '/CLR': 1 },
};

/**
 * 子專案 51：單顆正反器用哪顆 IC（模擬用那顆 IC 第 1 組的腳；轉成麵包板時兩顆合用一片，第二顆用第 2 組）。
 * 腳名就是 IC 的腳名去掉組別（1D → D）。
 */
export const HALF_CHIP: Partial<Record<BlockChip, BlockChip>> = { DFF: '74LS74', JKFF: '74LS76' };

/** 子專案 46：時序 IC（有狀態、看時脈邊緣）。 */
export const isSequentialChip = (chip: BlockChip | undefined): boolean => chip !== undefined && chip in BLOCK_DEFAULTS;

/** 子專案 46：時序 IC 的時脈腳（時序表、檢查用）。 */
export const CLOCK_PINS: Partial<Record<BlockChip, string[]>> = {
  '74LS74': ['1CLK', '2CLK'],
  '74LS76': ['1CLK', '2CLK'],
  '74LS90': ['CKA', 'CKB'],
  '74LS93': ['CKA', 'CKB'],
  '74LS161': ['CLK'],
  '74LS193': ['UP', 'DOWN'],
  DFF: ['CLK'],
  JKFF: ['CLK'],
};

export const BLOCK_CHIPS = Object.keys(BLOCK_PINS) as BlockChip[];

/** 元件庫與畫布上的中文名稱。 */
export const BLOCK_NAMES: Record<BlockChip, string> = {
  '74LS83': '4 位元加法器',
  '74LS151': '8 選 1 多工器',
  '74LS153': '雙 4 選 1 多工器',
  '74LS138': '3 對 8 解碼器',
  '74LS85': '4 位元比較器',
  '74LS74': '雙 D 型正反器',
  '74LS76': '雙 JK 正反器',
  '74LS90': '十進位計數器',
  '74LS93': '4 位元二進位計數器',
  '74LS161': '4 位元同步計數器',
  '74LS193': '上 / 下數計數器',
  DFF: 'D 型正反器（單顆）',
  JKFF: 'JK 正反器（單顆）',
};

export const isBlockChip = (v: unknown): v is BlockChip => typeof v === 'string' && v in BLOCK_PINS;
