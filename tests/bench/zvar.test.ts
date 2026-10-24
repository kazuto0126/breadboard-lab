import { it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { TWO_BOARD_VARIANTS as LAYOUT_LIST } from '../../src/logic/convertRoute';
import { taskFromExpressions } from '../../src/logic/expression';
import { designFromTask } from '../../src/logic/design';
import { toBreadboard, type ConvertOptions } from '../../src/logic/toBreadboard';

const exprs: Record<string, string[]> = {
  a: ['W = A B C + D E F', "X = A' B + C' D + E' F", 'Y = A D + B E + C F', "Z = A' F' + B' E'"],
  b: ["W = (A + B)(C + D')", "X = (A' + E)(B + C)", 'Y = A B + D E', "Z = C' E + A D'"],
};
const MS = Number(process.env.MS ?? 8000);
for (const [name, e] of Object.entries(exprs))
  it(name, () => {
    const r0 = taskFromExpressions(e.join('\n')); if (!r0.ok) throw new Error();
    const d = designFromTask(r0.task).diagram;
    LAYOUT_LIST.forEach((v, k) => {
      const r = toBreadboard(d, { switchTo: 'vcc', board: 'EIC1106', pulls: true } as ConvertOptions, v);
      if (!r.ok) { console.log(`VAR ${name} ${k}: ${r.reason}`); return; }
      const routed = autoPlaceAndRoute(r.circuit, { timeBudgetMs: MS, placement: { nearestPowerRail: true, timeBudgetMs: MS } });
      console.log(`VAR ${name} ${k} ${JSON.stringify(v)}: failed=${routed.failedNets.length} wires=${routed.metrics.wireCount} ics=${JSON.stringify(r.circuit.components.filter((c) => c.id.startsWith('U')).map((c) => [c.id, c.boardId, c.anchor.x]))}`);
    });
  }, 600_000);
