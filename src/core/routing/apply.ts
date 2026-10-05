import type { Circuit } from '../../types/circuit';
import type { RoutingResult } from '../../types/routing';

/** 回傳新的 Circuit，導線全部換成佈線結果；原本的 circuit 不會被修改。 */
export function applyRouting(circuit: Circuit, result: RoutingResult): Circuit {
  if (result.status !== 'success') throw new Error('Only a successful routing result can be applied');
  return {
    ...circuit,
    wires: result.wires.map((w) => ({
      ...w,
      start: { ...w.start },
      end: { ...w.end },
      path: w.path.map((p) => ({ ...p })),
    })),
  };
}
