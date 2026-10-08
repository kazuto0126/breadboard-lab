import type { Circuit, CircuitError, CircuitErrorCode } from '../../types/circuit';
import { genericExplanation } from './generic';
import { explainInputFloating, explainNoPowerSource, explainPowerMissing } from './power';
import type { Explanation } from './types';

export type { Explanation, ExplainStep } from './types';
export { plainText } from './helpers';

type Explainer = (circuit: Circuit, issue: CircuitError) => Explanation;

/** 有具體孔位建議的錯誤（規格第 3.1 節）；其他錯誤用通用說明。 */
const EXPLAINERS: Partial<Record<CircuitErrorCode, Explainer>> = {
  IC_POWER_MISSING: explainPowerMissing,
  NO_POWER_SOURCE: explainNoPowerSource,
  INPUT_FLOATING: explainInputFloating,
};

const cache = new WeakMap<Circuit, WeakMap<CircuitError, Explanation>>();

/** 針對一個檢查錯誤產生解說。解說函式出錯時退回通用說明；同一個電路與錯誤只算一次。 */
export function explainIssue(circuit: Circuit, issue: CircuitError): Explanation {
  let perCircuit = cache.get(circuit);
  if (!perCircuit) {
    perCircuit = new WeakMap();
    cache.set(circuit, perCircuit);
  }
  const cached = perCircuit.get(issue);
  if (cached) return cached;
  let result: Explanation;
  try {
    result = (EXPLAINERS[issue.code] ?? genericExplanation)(circuit, issue);
  } catch {
    result = genericExplanation(circuit, issue);
  }
  perCircuit.set(issue, result);
  return result;
}
