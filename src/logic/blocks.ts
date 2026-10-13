import type { BlockChip } from './types';

/** 規格（2026-10-13 logic-blocks）第 3 節：方塊的腳（上到下）；名稱和元件定義的腳名一樣。 */
export const BLOCK_PINS: Record<BlockChip, { inputs: string[]; outputs: string[] }> = {
  '74LS83': { inputs: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C0'], outputs: ['S1', 'S2', 'S3', 'S4', 'C4'] },
  '74LS151': { inputs: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'B', 'C', '/G'], outputs: ['Y', 'W'] },
  '74LS153': { inputs: ['1C0', '1C1', '1C2', '1C3', '2C0', '2C1', '2C2', '2C3', 'A', 'B', '/1G', '/2G'], outputs: ['1Y', '2Y'] },
  '74LS138': { inputs: ['A', 'B', 'C', 'G1', '/G2A', '/G2B'], outputs: ['/Y0', '/Y1', '/Y2', '/Y3', '/Y4', '/Y5', '/Y6', '/Y7'] },
  '74LS85': { inputs: ['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'IA<B', 'IA=B', 'IA>B'], outputs: ['OA<B', 'OA=B', 'OA>B'] },
};

export const BLOCK_CHIPS = Object.keys(BLOCK_PINS) as BlockChip[];

/** 元件庫與畫布上的中文名稱。 */
export const BLOCK_NAMES: Record<BlockChip, string> = {
  '74LS83': '4 位元加法器',
  '74LS151': '8 選 1 多工器',
  '74LS153': '雙 4 選 1 多工器',
  '74LS138': '3 對 8 解碼器',
  '74LS85': '4 位元比較器',
};

export const isBlockChip = (v: unknown): v is BlockChip => typeof v === 'string' && v in BLOCK_PINS;
