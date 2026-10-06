import { holeName } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { extractNets } from '../../core/circuit/nets';
import type { Circuit, Net } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { colorName } from '../model/colors';
import { naturalCompare } from '../model/naturalCompare';

export interface ChecklistRow {
  wireId: string;
  color: string;
  colorName: string;
  from: string;
  to: string;
  length: number;
  netId: string;
  kind: Net['kind'];
}

const KIND_RANK: Record<Net['kind'], number> = { power: 0, ground: 1, signal: 2 };

/** 規格第 9 節：只列 AI 佈線產生的導線；VCC → GND → 訊號，同類依 Net 名稱、導線 ID 的自然順序。 */
export function checklistOrder(circuit: Circuit): ChecklistRow[] {
  const boardInstance = circuit.boards[0];
  const board = boardInstance ? getBoard(boardInstance.layoutId, boardInstance.id) : null;
  const name = (p: GridPoint) => (board ? holeName(board, p) : null) ?? `(${p.x}, ${p.y})`;
  const kindOf = new Map(extractNets(circuit).map((n) => [n.id, n.kind] as const));
  return circuit.wires
    .filter((w) => w.source === 'auto' && w.netId !== undefined)
    .map((w) => ({
      wireId: w.id,
      color: w.color,
      colorName: colorName(w.color),
      from: name(w.start),
      to: name(w.end),
      length: w.path.length - 1,
      netId: w.netId!,
      kind: kindOf.get(w.netId!) ?? 'signal',
    }))
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || naturalCompare(a.netId, b.netId) || naturalCompare(a.wireId, b.wireId));
}

/** 每條導線的動畫時間：最多 250 ms，整段最多約 4 秒。 */
export function animationStepMs(count: number): number {
  return Math.min(250, 4000 / Math.max(1, count));
}
