import type { Circuit } from '../../types/circuit';
import type { RoutingResult } from '../../types/routing';
import { applyMoves } from '../icPlacement/relocate';

/** 回傳新的 Circuit：導線全部換成佈線結果，有 moves 時 IC 一併搬到新位置；原本的 circuit 不會被修改。 */
export function applyRouting(circuit: Circuit, result: RoutingResult): Circuit {
  if (result.status !== 'success') throw new Error('Only a successful routing result can be applied');
  return {
    ...circuit,
    components: applyMoves(circuit.components, result.moves ?? []),
    wires: result.wires.map((w) => ({
      ...w,
      start: { ...w.start },
      end: { ...w.end },
      path: w.path.map((p) => ({ ...p })),
    })),
  };
}
