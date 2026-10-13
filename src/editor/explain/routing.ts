import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { FailureReason, RoutingMetrics, RoutingResult } from '../../types/routing';
import { analyzeCircuit, groupIdAt, holeLabel } from '../analysis';

export const FAILURE_NAMES: Record<FailureReason, string> = {
  NO_FREE_HOLE: '沒有空孔可以接線',
  UNROUTABLE: '找不到可以走的路徑',
  ITERATION_LIMIT: '協商多輪仍無法避開其他導線',
  TIME_LIMIT: '超過計算時間',
  LEGALITY_CHECK: '沒有通過合法性檢查',
};

const CROWDED = '附近的線太擠：把元件拉開一點，或選「可移動 IC」再佈線一次';
const FAILURE_HINTS: Record<FailureReason, string> = {
  NO_FREE_HOLE: '腳旁邊的孔都滿了：把元件往旁邊移幾格，或換 EIC-1106 大型麵包板',
  UNROUTABLE: CROWDED,
  ITERATION_LIMIT: CROWDED,
  TIME_LIMIT: CROWDED,
  LEGALITY_CHECK: '結果沒通過檢查（程式的問題），請再佈線一次',
};

export interface RoutingSummary {
  status: RoutingResult['status'];
  /** 佈線前（使用者的線）與佈線結果的指標。 */
  before: RoutingMetrics;
  after: RoutingMetrics;
  /** 搬動的 IC：第 1 腳所在孔的名稱。 */
  moves: Array<{ componentId: string; from: string; to: string }>;
  /** 每個 Net 用了幾條 AI 導線；minimum 是直接接最少要幾條。依多出來的線由多到少排序。 */
  nets: Array<{ netId: string; name: string; wires: number; minimum: number; points: GridPoint[] }>;
  failed: Array<{ netId: string; reason: string; hint: string }>;
}

/** 規格（2026-10-13 routing-summary）第 2 節。circuit 是佈線後的電路。 */
export function summarizeRouting(circuit: Circuit, comparison: { beforeScore: { metrics: RoutingMetrics }; result: RoutingResult }): RoutingSummary {
  const { result } = comparison;
  const analysis = analyzeCircuit(circuit);
  const byNet = new Map<string, { netId: string; name: string; wires: number; minimum: number; points: GridPoint[] }>();
  for (const wire of circuit.wires) {
    if (wire.source !== 'auto') continue;
    const net = analysis.netByWire.get(wire.id);
    const id = net?.id ?? wire.netId ?? wire.id;
    let entry = byNet.get(id);
    if (!entry) {
      const groups = new Set<string>();
      for (const ref of net?.pins ?? []) {
        const instance = circuit.components.find((c) => c.id === ref.componentId);
        const def = instance && getComponentDefinition(instance.defId);
        const point = def && resolveFootprint(instance, def).pins.find((p) => p.pinNumber === ref.pinNumber)?.point;
        const g = point && groupIdAt(circuit, point);
        if (g) groups.add(g);
      }
      entry = { netId: id, name: net?.name ?? id, wires: 0, minimum: Math.max(0, groups.size - 1), points: [] };
      byNet.set(id, entry);
    }
    entry.wires++;
    entry.points.push(wire.start, wire.end);
  }
  const extra = (n: { wires: number; minimum: number }) => n.wires - n.minimum;
  const nets = [...byNet.values()].sort((a, b) => extra(b) - extra(a) || (a.netId < b.netId ? -1 : a.netId > b.netId ? 1 : 0));
  const at = (p: { boardId: string; anchor: { x: number; y: number } }) => holeLabel(circuit, { boardId: p.boardId, ...p.anchor });
  return {
    status: result.status,
    before: comparison.beforeScore.metrics,
    after: result.metrics,
    moves: (result.moves ?? []).map((m) => ({ componentId: m.componentId, from: at(m.from), to: at(m.to) })),
    nets,
    failed: result.failedNets.map((f) => ({ netId: f.netId, reason: FAILURE_NAMES[f.reason], hint: FAILURE_HINTS[f.reason] })),
  };
}

const MAX_LISTED = 5;

/** 給畫面與 AI 的白話句子。 */
export function routingSummaryText(s: RoutingSummary): string[] {
  const head = s.status === 'success' ? '佈線成功' : s.status === 'partial' ? '佈線只完成一部分' : '佈線失敗';
  const lines = [
    `${head}：${s.after.wireCount} 條線，總長 ${s.after.totalLength} 格，交叉 ${s.after.crossings} 處（佈線前：${s.before.wireCount} 條、${s.before.totalLength} 格、${s.before.crossings} 處）`,
  ];
  if (s.moves.length > 0) lines.push(`搬動了 ${s.moves.map((m) => `${m.componentId}（${m.from} → ${m.to}）`).join('、')}`);
  const bent = s.nets.filter((n) => n.wires > n.minimum).slice(0, MAX_LISTED);
  if (bent.length > 0) lines.push(`最繞的訊號：${bent.map((n) => `${n.name} 用了 ${n.wires} 條線（直接接最少 ${n.minimum} 條）`).join('；')}`);
  else if (s.nets.length > 0) lines.push('每個訊號都用最少的線直接接上');
  for (const f of s.failed) lines.push(`${f.netId} 接不通：${f.reason}。${f.hint}`);
  return lines;
}
