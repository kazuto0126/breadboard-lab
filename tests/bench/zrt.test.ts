import { it } from 'vitest';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { TWO_BOARD_VARIANTS } from '../../src/logic/convertRoute';
import { taskFromExpressions } from '../../src/logic/expression';
import { designFromTask } from '../../src/logic/design';
import { toBreadboard, type ConvertOptions } from '../../src/logic/toBreadboard';
import { extractNets } from '../../src/core/circuit/nets';
import { connectPowerToNearestRails } from '../../src/core/circuit/powerRails';

const exprs: Record<string, string[]> = {
  a: ['W = A B C + D E F', "X = A' B + C' D + E' F", 'Y = A D + B E + C F', "Z = A' F' + B' E'"],
  b: ["W = (A + B)(C + D')", "X = (A' + E)(B + C)", 'Y = A B + D E', "Z = C' E + A D'"],
};
for (const [name, e] of Object.entries(exprs))
it(name, () => {
  const r0 = taskFromExpressions(e.join('\n')); if (!r0.ok) throw new Error();
  const d = designFromTask(r0.task).diagram;
  const r = toBreadboard(d, { switchTo: 'vcc', board: 'EIC1106', pulls: true } as ConvertOptions, TWO_BOARD_VARIANTS[0]);
  if (!r.ok) throw new Error();
  const c = connectPowerToNearestRails(r.circuit).circuit;
  for (const ms of [15000]) {
    const t = performance.now();
    const routed = autoRoute(c, { timeBudgetMs: ms, negotiation: { maxIterations: 1000 } });
    const nets = extractNets(c);
    for (const fn of routed.failedNets) console.log('RTFAIL', fn.netId, JSON.stringify(nets.find((n) => n.id === fn.netId)?.pins.map((p) => `${p.componentId}#${p.pinNumber}`)));
    console.log(`RT ${name} ${ms}: failed=${routed.failedNets.length} ${[...new Set(routed.failedNets.map((f) => f.reason))]} iters=${routed.stats.iterations} wires=${routed.metrics.wireCount} ${Math.round(performance.now() - t)}ms`);
  }
}, 600_000);
