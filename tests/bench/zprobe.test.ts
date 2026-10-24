import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { applyRouting } from '../../src/core/routing/apply';
import { serializeCircuitFile } from '../../src/editor/fileFormat';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { convertAndRoute, convertAndRouteParallel } from '../../src/logic/convertRoute';
import { taskFromExpressions } from '../../src/logic/expression';
import { designFromTask } from '../../src/logic/design';
import type { ConvertOptions } from '../../src/logic/toBreadboard';
import type { LogicDiagram } from '../../src/logic/types';

const fromExpr = (lines: string[], form: 'sop' | 'pos' = 'sop'): LogicDiagram => {
  const r = taskFromExpressions(lines.join('\n')); if (!r.ok) throw new Error(r.reason);
  return designFromTask(r.task, form).diagram;
};
const cases: Array<[string, () => LogicDiagram, Partial<ConvertOptions>]> = [
  ['6in 4out 70s', () => fromExpr(['W = A B C + D E F', "X = A' B + C' D + E' F", 'Y = A D + B E + C F', "Z = A' F' + B' E'"]), { totalMs: 70000 } as never],
  ['6in 4out 120s', () => fromExpr(['W = A B C + D E F', "X = A' B + C' D + E' F", 'Y = A D + B E + C F', "Z = A' F' + B' E'"]), { totalMs: 120000 } as never],
  ['5in 4out 120s', () => fromExpr(["W = (A + B)(C + D')", "X = (A' + E)(B + C)", 'Y = A B + D E', "Z = C' E + A D'"]), { totalMs: 120000 } as never],
  ['6in 3out', () => fromExpr(['X = A B + C D + E F', "Y = A' C E + B D' F", "Z = A C' + B' E + D F'"]), {}],
  ['6in 4out', () => fromExpr(['W = A B C + D E F', "X = A' B + C' D + E' F", 'Y = A D + B E + C F', "Z = A' F' + B' E'"]), {}],
  ['5in 4out', () => fromExpr(["W = (A + B)(C + D')", "X = (A' + E)(B + C)", 'Y = A B + D E', "Z = C' E + A D'"]), {}],
];
for (const [name, d, o] of cases)
  it(name, async () => {
    const t = performance.now();
    const opts = { switchTo: 'vcc', board: 'auto', pulls: true, ...o } as ConvertOptions;
    const lanes = Number(process.env.LANES ?? 1);
    const r = lanes > 1 ? await convertAndRouteParallel(d(), opts, async (jobs) => jobs.map((j) => autoPlaceAndRoute(j.circuit, j.config, j.from)), lanes, { totalMs: (o as { totalMs?: number }).totalMs }) : convertAndRoute(d(), opts, { totalMs: (o as { totalMs?: number }).totalMs });
    if (!r.ok) { console.log(`PROBE ${name}: FAIL ${r.reason}`); return; }
    const m = r.routed.metrics;
    for (const f of r.routed.failedNets) console.log('PROBE FAILNET', f.reason, f.detail);
    writeFileSync(`C:/Users/lingz/AppData/Local/Temp/claude/D--project-digitaldesign/66824cad-2901-40c8-9213-c5ebf31981f6/scratchpad/${name.replace(/ /g,'_')}.json`, serializeCircuitFile(applyRouting(r.result.circuit, { ...r.routed, status: 'success' }), name, undefined, d()));
    console.log(`PROBE ${name}: ${r.result.bom.layout} ${r.routed.status} failed=${r.routed.failedNets.length} ${m.wireCount} wires boards=${r.result.bom.boards} tried=${r.tried} ${Math.round(performance.now() - t)}ms`);
  }, 300_000);
