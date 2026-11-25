import { BLOCK_PINS } from '../../src/logic/blocks';
import { addNode, connect, nextNodeId, renameNode } from '../../src/logic/edit';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

const must = (r: { ok: true; diagram: LogicDiagram } | { ok: false; reason: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.diagram;
};

/** 兩顆 74LS76 的十進位漣波計數器：QB、QD 經過 NAND 接回每一級的 /CLR（數到 10 就清除）。 */
export function decadeCounter(): LogicDiagram {
  const IN = BLOCK_PINS['74LS76'].inputs;
  const OUT = BLOCK_PINS['74LS76'].outputs;
  let d = emptyDiagram();
  d = must(addNode(d, 'CLOCK', 0, 1)); // c1
  d = must(addNode(d, 'HIGH', 0, 6)); // k1
  d = must(addNode(d, 'BLOCK', 8, 0, '74LS76')); // b1：QA、QB
  d = must(addNode(d, 'BLOCK', 8, 13, '74LS76')); // b2：QC、QD
  d = must(addNode(d, 'NAND', 20, 20)); // g1
  for (const [name, y] of [['QA', 1], ['QB', 4], ['QC', 14], ['QD', 17]] as const) {
    const id = nextNodeId(d, 'OUTPUT');
    d = must(renameNode(must(addNode(d, 'OUTPUT', 30, y)), id, name));
  }
  for (const node of ['b1', 'b2']) for (const pin of ['1J', '1K', '2J', '2K', '1/PRE', '2/PRE']) d = must(connect(d, 'k1', { node, pin: IN.indexOf(pin) }));
  d = must(connect(d, 'c1', { node: 'b1', pin: IN.indexOf('1CLK') }));
  d = must(connect(d, 'b1', { node: 'b1', pin: IN.indexOf('2CLK') }, OUT.indexOf('1Q')));
  d = must(connect(d, 'b1', { node: 'b2', pin: IN.indexOf('1CLK') }, OUT.indexOf('2Q')));
  d = must(connect(d, 'b2', { node: 'b2', pin: IN.indexOf('2CLK') }, OUT.indexOf('1Q')));
  d = must(connect(d, 'b1', { node: 'g1', pin: 0 }, OUT.indexOf('2Q')));
  d = must(connect(d, 'b2', { node: 'g1', pin: 1 }, OUT.indexOf('2Q')));
  for (const node of ['b1', 'b2']) for (const pin of ['1/CLR', '2/CLR']) d = must(connect(d, 'g1', { node, pin: IN.indexOf(pin) }));
  for (const [k, block, q] of [[1, 'b1', '1Q'], [2, 'b1', '2Q'], [3, 'b2', '1Q'], [4, 'b2', '2Q']] as const) d = must(connect(d, block, { node: `o${k}`, pin: 0 }, OUT.indexOf(q)));
  return d;
}

