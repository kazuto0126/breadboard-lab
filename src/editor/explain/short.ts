import { validateCircuit } from '../../core/circuit/validate';
import type { Circuit, CircuitError } from '../../types/circuit';
import { analyzeCircuit, groupIdAt } from '../analysis';
import { ISSUE_TEXT } from './generic';
import { explanation, step } from './helpers';
import type { Explanation } from './types';

const shortCount = (circuit: Circuit) => validateCircuit(circuit).filter((e) => e.code === 'SHORT_CIRCUIT').length;

/** 規格第 3.1 節：逐一假設拔掉這個 Net 上的每一條導線，拔掉後短路變少的就是「建議先拔掉」的線。 */
export function explainShort(circuit: Circuit, issue: CircuitError): Explanation {
  const why = ISSUE_TEXT.SHORT_CIRCUIT.why;
  const net = analyzeCircuit(circuit).netById.get(issue.netIds[0]);
  const groups = new Set(net?.groupIds ?? []);
  const inNet = (p: (typeof circuit.wires)[number]['start']) => {
    const g = groupIdAt(circuit, p);
    return g !== null && groups.has(g);
  };
  const before = shortCount(circuit);
  const culprits = circuit.wires.filter(
    (w) => (inNet(w.start) || inNet(w.end)) && shortCount({ ...circuit, wires: circuit.wires.filter((x) => x.id !== w.id) }) < before,
  );
  if (culprits.length === 0) {
    return explanation(why, [step(`這個 Net 上的元件腳直接把電源和 GND 接在一起（${issue.componentIds.join('、')}），請把其中一個元件移到別的排。`)]);
  }
  return explanation(
    why,
    [...culprits.map((w) => step(`拔掉 ${w.id}（{0} → {1}）就不會短路。`, w.start, w.end)), step('確認這條線原本想接到哪裡，再重新接到正確的排。')],
    [],
    culprits.map((w) => w.id),
  );
}
