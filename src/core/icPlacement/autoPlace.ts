import { buildLattice, type Lattice } from '../breadboard/lattice';
import { indexCircuit } from '../circuit/circuitIndex';
import { getComponentDefinition } from '../circuit/library';
import { compareIds, extractNets } from '../circuit/nets';
import { connectPowerToNearestRails } from '../circuit/powerRails';
import { autoRoute } from '../routing/autoRoute';
import { mergeConfig } from '../routing/config';
import type { Circuit, Net } from '../../types/circuit';
import type { DeepPartial, IcMove, IcPlacement, RoutingConfig, RoutingResult } from '../../types/routing';
import { icCandidates } from './candidates';
import { estimateNets } from './estimate';
import { applyMoves, placeAt, placementOf, relocatedCircuit, samePinPartition, samePlacement } from './relocate';

/** 子專案 48：重排目前的擺法最多用掉這次「可移動 IC」時間的幾成。 */
const RETRY_SHARE = 0.4;

/** 規格 1 節的好壞順序：接不完的 Net 少 → 交叉少 → 線少 → 總長短。a 比 b 好才回傳 true（同分是 false）。 */
export function isBetterRouting(a: RoutingResult, b: RoutingResult): boolean {
  const key = (r: RoutingResult) => [r.failedNets.length, r.metrics.crossings, r.metrics.wireCount, r.metrics.totalLength];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
  return false;
}

/**
 * 規格 2026-10-10 ic-placement：「AI 佈線（可移動 IC）」。起點是「IC 都不動」的佈線；每顆 IC 輪流試粗估最好的幾個位置、
 * 實際佈線，比目前最好的結果好才採用。回傳的結果一定有 moves（沒有搬動時是空陣列）。
 * 子專案 41：from 是同一個電路之前的結果（例如轉成麵包板的快速試），從它接著搬，不重做已經做過的。
 */
export function autoPlaceAndRoute(circuit: Circuit, overrides?: DeepPartial<RoutingConfig>, from?: RoutingResult): RoutingResult {
  const started = performance.now();
  const config = mergeConfig(overrides);
  const { candidatesPerIc, maxPasses, timeBudgetMs } = config.placement;
  const outOfTime = () => performance.now() - started > timeBudgetMs;
  const nets = extractNets(circuit);
  const lattice = buildLattice(circuit.boards);
  const original = new Map(circuit.components.map((c) => [c.id, placementOf(c)]));

  const route = (moves: IcMove[], options?: DeepPartial<RoutingConfig>): RoutingResult | null => {
    const relocated = relocatedCircuit(circuit, nets, moves);
    if (moves.length > 0 && !samePinPartition(nets, extractNets(relocated))) return null;
    if (!config.placement.nearestPowerRail) return autoRoute(relocated, options);
    // 子專案 34：IC 搬好之後，電源腳改接那時最近的軌（補上 / 拿掉符號），結果帶回符號的變動。
    const power = connectPowerToNearestRails(relocated);
    return { ...autoRoute(power.circuit, options), powerSymbols: { added: power.added, removed: power.removed } };
  };

  let moves: IcMove[] = from?.moves ?? [];
  let best = from ?? route(moves, overrides)!;
  // 子專案 48：接著之前的結果排時（轉成麵包板的快速試只給很短的時間），大電路的協商常常在時間到時還沒收斂
  // （排不完的線是 TIME_LIMIT）。先用比較長的時間把目前的擺法重排一次，搬 IC 才有好的比較基準。
  // 從頭開始時不重排：第一次佈線本來就用完整的時間，重排只會佔掉搬 IC 的時間。
  const unfinished = (r: RoutingResult) => r.failedNets.some((f) => f.reason === 'TIME_LIMIT');
  if (from && unfinished(best) && !outOfTime()) {
    const longer = route(moves, { ...overrides, timeBudgetMs: Math.max(config.timeBudgetMs, timeBudgetMs * RETRY_SHARE) });
    if (longer && isBetterRouting(longer, best)) best = longer;
  }
  // 候選位置的協商輪數上限：佈不出來的位置會一直協商到上限，要很快放棄（規格 3.3）。
  // 子專案 41：找到更好的結果就跟著它重算（目前最好的只要幾輪就排完時，要一百多輪的位置通常排不完，不用等到上限）。
  const optionsFor = (r: RoutingResult): DeepPartial<RoutingConfig> => ({ ...overrides, negotiation: { ...overrides?.negotiation, maxIterations: Math.min(config.negotiation.maxIterations, Math.max(config.placement.candidateIterations, 2 * r.stats.iterations)) } });
  let candidateOptions = optionsFor(best);
  for (let pass = 0; pass < maxPasses && !outOfTime(); pass++) {
    let improved = false;
    for (const id of movableIcs(circuit, nets)) {
      if (outOfTime()) break;
      const layout: Circuit = { ...circuit, components: applyMoves(circuit.components, moves), wires: [] };
      for (const to of rankCandidates(layout, nets, id, lattice, config).slice(0, candidatesPerIc)) {
        if (outOfTime()) break;
        const next = withMove(moves, id, original.get(id)!, to);
        const result = route(next, candidateOptions);
        if (result && isBetterRouting(result, best)) {
          best = result;
          moves = next;
          candidateOptions = optionsFor(best);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { ...best, moves, stats: { ...best.stats, elapsedMs: Math.round(performance.now() - started) } };
}

/** 會動的 IC：接到其他元件的腳多的先，同分依元件 ID。 */
function movableIcs(circuit: Circuit, nets: Net[]): string[] {
  const linked = new Map<string, number>();
  for (const net of nets) {
    if (new Set(net.pins.map((p) => p.componentId)).size < 2) continue;
    for (const p of net.pins) linked.set(p.componentId, (linked.get(p.componentId) ?? 0) + 1);
  }
  return circuit.components
    .filter((c) => getComponentDefinition(c.defId)?.category === 'ic')
    .map((c) => c.id)
    .sort((a, b) => (linked.get(b) ?? 0) - (linked.get(a) ?? 0) || compareIds(a, b));
}

/** 這顆 IC 的合法位置（不含目前的位置）依粗估由小到大；同分維持 icCandidates 的順序。 */
function rankCandidates(layout: Circuit, nets: Net[], id: string, lattice: Lattice, config: RoutingConfig): IcPlacement[] {
  const here = placementOf(layout.components.find((c) => c.id === id)!);
  const mine = nets.filter((n) => n.pins.some((p) => p.componentId === id));
  return icCandidates(layout, nets, id)
    .filter((p) => !samePlacement(p, here))
    .map((p, order) => {
      const components = layout.components.map((c) => (c.id === id ? placeAt(c, p) : c));
      return { p, order, cost: estimateNets(indexCircuit({ ...layout, components }), lattice, mine, config.weights) };
    })
    .sort((a, b) => a.cost - b.cost || a.order - b.order)
    .map((x) => x.p);
}

/** 把 id 搬到 to（搬回原位就刪掉這筆）；依元件 ID 排序，結果固定。 */
function withMove(moves: IcMove[], id: string, from: IcPlacement, to: IcPlacement): IcMove[] {
  const rest = moves.filter((m) => m.componentId !== id);
  const next = samePlacement(from, to) ? rest : [...rest, { componentId: id, from, to }];
  return next.sort((a, b) => compareIds(a.componentId, b.componentId));
}
