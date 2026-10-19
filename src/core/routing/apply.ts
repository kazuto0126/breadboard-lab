import type { Circuit } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { RoutingResult } from '../../types/routing';
import { applyMoves } from '../icPlacement/relocate';

/** 子專案 34：拿掉、補上 5V / GND 符號；沒有變動時沿用原本的陣列。 */
function withPowerSymbols(components: ComponentInstance[], power: RoutingResult['powerSymbols']): ComponentInstance[] {
  if (!power || (power.added.length === 0 && power.removed.length === 0)) return components;
  return [...components.filter((c) => !power.removed.includes(c.id)), ...power.added.map((c) => ({ ...c, anchor: { ...c.anchor } }))];
}

/**
 * 回傳新的 Circuit：導線全部換成佈線結果，有 moves 時 IC 一併搬到新位置；有 powerSymbols 時（子專案 34）
 * 拿掉、補上 5V / GND 符號。原本的 circuit 不會被修改。
 */
export function applyRouting(circuit: Circuit, result: RoutingResult): Circuit {
  if (result.status !== 'success') throw new Error('Only a successful routing result can be applied');
  return {
    ...circuit,
    components: withPowerSymbols(applyMoves(circuit.components, result.moves ?? []), result.powerSymbols),
    wires: result.wires.map((w) => ({
      ...w,
      start: { ...w.start },
      end: { ...w.end },
      path: w.path.map((p) => ({ ...p })),
    })),
  };
}
