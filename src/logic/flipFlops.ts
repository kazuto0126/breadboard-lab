import { BLOCK_PINS, HALF_CHIP } from './blocks';
import type { BlockChip, LogicDiagram, LogicNode, LogicWire } from './types';

/**
 * 子專案 51（規格 2026-10-25 single-flip-flops 第 3 節）：轉成麵包板前把單顆正反器兩顆一組合成一片 IC
 * （DFF → 74LS74、JKFF → 74LS76）：依位置（上到下、左到右）配對，第一顆用第 1 組的腳、第二顆用第 2 組。
 * 合好的 IC 沿用第一顆的 id；沒有單顆正反器時回傳原本的圖。
 */
export function packFlipFlops(d: LogicDiagram): LogicDiagram {
  /** 單顆正反器 id → 合成的 IC 與用第幾組。 */
  const into = new Map<string, { id: string; chip: BlockChip; half: BlockChip; group: 1 | 2 }>();
  const packed: LogicNode[] = [];
  for (const [half, chip] of Object.entries(HALF_CHIP) as Array<[BlockChip, BlockChip]>) {
    const singles = d.nodes.filter((n) => n.kind === 'BLOCK' && n.chip === half).sort((a, b) => a.y - b.y || a.x - b.x);
    for (let k = 0; k < singles.length; k += 2) {
      const first = singles[k];
      packed.push({ id: first.id, kind: 'BLOCK', x: first.x, y: first.y, chip });
      singles.slice(k, k + 2).forEach((n, g) => into.set(n.id, { id: first.id, chip, half, group: g === 0 ? 1 : 2 }));
    }
  }
  if (into.size === 0) return d;
  const wires = d.wires.map((w): LogicWire => {
    const src = into.get(w.from);
    const dst = into.get(w.to.node);
    const next: LogicWire = { ...w };
    if (src) {
      const fromPin = BLOCK_PINS[src.chip].outputs.indexOf(`${src.group}${BLOCK_PINS[src.half].outputs[w.fromPin ?? 0]}`);
      next.from = src.id;
      if (fromPin > 0) next.fromPin = fromPin;
      else delete next.fromPin;
    }
    if (dst) next.to = { node: dst.id, pin: BLOCK_PINS[dst.chip].inputs.indexOf(`${dst.group}${BLOCK_PINS[dst.half].inputs[w.to.pin]}`) };
    return next;
  });
  return { ...d, nodes: [...d.nodes.filter((n) => !into.has(n.id)), ...packed], wires };
}
