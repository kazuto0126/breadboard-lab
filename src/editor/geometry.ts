import { unitsFromMm } from '../core/breadboard/lattice';
import { getBoard } from '../core/breadboard/registry';
import type { Breadboard, BreadboardInstance } from '../types/board';
import type { Circuit } from '../types/circuit';
import type { GridPoint } from '../types/geometry';

/** 1 格（0.1 吋 = 2.54 mm）在世界座標中的像素數。 */
export const PITCH = 20;
/**
 * 板邊到第 1 欄 / 第 1 列格點的距離（格）。四周各留 1.5 格，板子剛好是 (欄數 + 2) × (列數 + 2) 格，
 * 每個格點都在一格的正中央；多塊板貼合時，所有格點落在同一張全域格子上。
 */
export const PAD_X = 1.5;
export const PAD_Y = 1.5;
/** BreadboardInstance.x / y 以 mm 記錄；換算成世界座標像素。 */
export const MM_TO_PX = PITCH / 2.54;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 一塊板在世界座標中的位置與大小。 */
export interface BoardFrame {
  id: string;
  board: Breadboard;
  instance: BreadboardInstance;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 板內格點（可為小數）→ 板子自己的像素座標。 */
export function localPx(gx: number, gy: number): Point {
  return { x: (gx - 1 + PAD_X) * PITCH, y: (gy - 1 + PAD_Y) * PITCH };
}

export function boardSize(board: Pick<Breadboard, 'width' | 'height'>): { width: number; height: number } {
  return { width: (board.width - 1 + 2 * PAD_X) * PITCH, height: (board.height - 1 + 2 * PAD_Y) * PITCH };
}

export function boardFrames(circuit: Pick<Circuit, 'boards'>): BoardFrame[] {
  return circuit.boards.map((instance) => {
    const board = getBoard(instance.layoutId, instance.id);
    // 位置一律對齊格點（與核心引擎的全域格子一致）。
    return { id: instance.id, board, instance, x: unitsFromMm(instance.x) * PITCH, y: unitsFromMm(instance.y) * PITCH, ...boardSize(board) };
  });
}

export function frameOf(frames: BoardFrame[], boardId: string): BoardFrame | undefined {
  return frames.find((f) => f.id === boardId);
}

/** 格點 → 世界座標。板子不存在時回傳 null。 */
export function toWorld(frames: BoardFrame[], p: GridPoint): Point | null {
  const frame = frameOf(frames, p.boardId);
  if (!frame) return null;
  const local = localPx(p.x, p.y);
  return { x: frame.x + local.x, y: frame.y + local.y };
}

export interface GridHit {
  boardId: string;
  /** 連續的格點座標（可為小數），用來讓元件跟著游標置中。 */
  fx: number;
  fy: number;
  /** 最近的格點（可能落在板邊留白，x 為 0 或欄數 + 1、y 為 0 或列數 + 1）。 */
  x: number;
  y: number;
}

/** 世界座標 → 所在板子上的格點；不在任何板子上時回傳 null。 */
export function fromWorld(frames: BoardFrame[], wx: number, wy: number): GridHit | null {
  for (const frame of frames) {
    const lx = wx - frame.x;
    const ly = wy - frame.y;
    if (lx < 0 || ly < 0 || lx > frame.width || ly > frame.height) continue;
    const fx = lx / PITCH - PAD_X + 1;
    const fy = ly / PITCH - PAD_Y + 1;
    const x = Math.min(frame.board.width + 1, Math.max(0, Math.round(fx)));
    const y = Math.min(frame.board.height + 1, Math.max(0, Math.round(fy)));
    return { boardId: frame.id, fx, fy, x, y };
  }
  return null;
}

/** 所有板子的外框；沒有板子時回傳 null。 */
export function worldBounds(frames: BoardFrame[]): Rect | null {
  if (frames.length === 0) return null;
  const x = Math.min(...frames.map((f) => f.x));
  const y = Math.min(...frames.map((f) => f.y));
  const right = Math.max(...frames.map((f) => f.x + f.width));
  const bottom = Math.max(...frames.map((f) => f.y + f.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** 一組格點的外框（世界座標），每邊再往外留 pad 格。 */
export function gridBounds(frames: BoardFrame[], points: GridPoint[], pad = 0.5): Rect | null {
  const world = points.map((p) => toWorld(frames, p)).filter((p): p is Point => p !== null);
  if (world.length === 0) return null;
  const x = Math.min(...world.map((p) => p.x)) - pad * PITCH;
  const y = Math.min(...world.map((p) => p.y)) - pad * PITCH;
  const right = Math.max(...world.map((p) => p.x)) + pad * PITCH;
  const bottom = Math.max(...world.map((p) => p.y)) + pad * PITCH;
  return { x, y, width: right - x, height: bottom - y };
}
