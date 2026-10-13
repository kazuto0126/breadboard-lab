import { getComponentDefinition } from '../core/circuit/library';
import { checkDiagram } from './check';
import { sortedIo, MAX_TABLE_INPUTS } from './evaluate';
import { isGate, signalOf, type LogicDiagram } from './types';

/** 拆開後的單元：每個都能放進 74LS 的一組閘。 */
export type UnitKind = 'AND2' | 'AND3' | 'AND4' | 'OR2' | 'NOT' | 'NAND2' | 'NOR2' | 'XOR2';

/** 訊號名稱：來源節點的 id（輸入端或閘），或拆開時的中間訊號 `${閘 id}~${k}`。 */
export interface Unit {
  kind: UnitKind;
  inputs: string[];
  output: string;
}

/** 規格（2026-10-13 logic-to-breadboard）第 3 節：單元 → IC；順序也是 IC 編號（U1、U2…）的順序。 */
export const IC_FOR: Record<UnitKind, string> = {
  AND2: '74LS08',
  AND3: '74LS11',
  AND4: '74LS21',
  OR2: '74LS32',
  NOT: '74LS04',
  NAND2: '74LS00',
  NOR2: '74LS02',
  XOR2: '74LS86',
};
const ORDER = Object.keys(IC_FOR) as UnitKind[];

/** 7 段顯示器最多幾個（規格 2026-10-13 seven-seg 第 6 節）。 */
export const MAX_DISPLAYS = 2;

/** 規格第 6 節：不能轉的原因；可以轉時回傳 null。 */
export function convertProblem(d: LogicDiagram): string | null {
  const issues = checkDiagram(d);
  if (issues.some((i) => i.code === 'LOGIC_LOOP')) return '邏輯圖有迴圈，不能轉成麵包板';
  const { inputs, outputs } = sortedIo(d);
  if (inputs.length === 0 || outputs.length === 0) return '邏輯圖要有輸入端和輸出端才能轉';
  if (d.nodes.filter((n) => n.kind === 'DISPLAY').length > MAX_DISPLAYS) return `7 段顯示器最多 ${MAX_DISPLAYS} 個（零件太多，佈線接不完）`;
  if (inputs.length > MAX_TABLE_INPUTS) return `輸入端最多 ${MAX_TABLE_INPUTS} 個（指撥開關最多 8 位元）`;
  if (issues.some((i) => i.code === 'LOGIC_INPUT_OPEN' || i.code === 'LOGIC_OUTPUT_OPEN')) return '還有沒接好的腳（到「檢查」分頁看是哪些），請先接好';
  return null;
}

/**
 * 每個輸入腳接到的訊號（`${節點}#${腳}` → 訊號名稱）。子專案 21：5V、GND 常數的訊號就是電源 `VCC` / `GND`，
 * IC 方塊第 k 個輸出是 `signalOf(id, k)`。
 */
export function drivers(d: LogicDiagram): Map<string, string> {
  const kind = new Map(d.nodes.map((n) => [n.id, n.kind]));
  return new Map(
    d.wires.map((w) => {
      const k = kind.get(w.from);
      return [`${w.to.node}#${w.to.pin}`, k === 'HIGH' ? 'VCC' : k === 'LOW' ? 'GND' : signalOf(w.from, w.fromPin)];
    }),
  );
}

/** 規格第 3 節的拆法：OR / NOR 用 2 輸入 OR 串起來，NAND 前面先用 AND，最後一級才反相。 */
export function decompose(d: LogicDiagram): Unit[] {
  const driver = drivers(d);
  const units: Unit[] = [];
  for (const node of d.nodes) {
    if (!isGate(node.kind)) continue;
    const n = node.kind === 'NOT' ? 1 : node.kind === 'XOR' ? 2 : (node.inputs ?? 2);
    const xs = Array.from({ length: n }, (_, i) => driver.get(`${node.id}#${i}`) ?? '');
    let k = 0;
    const temp = () => `${node.id}~${++k}`;
    /** 用 2 輸入的 OR 把 xs 併成一個訊號，最後一級輸出到 out。 */
    const orChain = (list: string[], out: string) => {
      let acc = list[0];
      for (let i = 1; i < list.length; i++) {
        const o = i === list.length - 1 ? out : temp();
        units.push({ kind: 'OR2', inputs: [acc, list[i]], output: o });
        acc = o;
      }
    };
    switch (node.kind) {
      case 'AND':
        units.push({ kind: n === 4 ? 'AND4' : n === 3 ? 'AND3' : 'AND2', inputs: xs, output: node.id });
        break;
      case 'OR':
        orChain(xs, node.id);
        break;
      case 'NOT':
        units.push({ kind: 'NOT', inputs: xs, output: node.id });
        break;
      case 'XOR':
        units.push({ kind: 'XOR2', inputs: xs, output: node.id });
        break;
      case 'NAND':
        if (n === 2) units.push({ kind: 'NAND2', inputs: xs, output: node.id });
        else {
          const t = temp();
          units.push({ kind: n === 3 ? 'AND2' : 'AND3', inputs: xs.slice(0, -1), output: t });
          units.push({ kind: 'NAND2', inputs: [t, xs[n - 1]], output: node.id });
        }
        break;
      case 'NOR':
        if (n === 2) units.push({ kind: 'NOR2', inputs: xs, output: node.id });
        else {
          const t = temp();
          orChain(xs.slice(0, -1), t);
          units.push({ kind: 'NOR2', inputs: [t, xs[n - 1]], output: node.id });
        }
        break;
    }
  }
  return units;
}

/** 依序算出每個訊號的值（測試用；拆開後的單元已經是拓撲順序以外的順序時，重複算到不再改變）。 */
export function evaluateUnits(units: Unit[], values: Record<string, 0 | 1>): Record<string, 0 | 1> {
  const v: Record<string, 0 | 1> = { ...values };
  for (let pass = 0; pass <= units.length; pass++) {
    for (const u of units) {
      const ins = u.inputs.map((s) => v[s] ?? 0);
      const and = ins.every((b) => b === 1);
      const or = ins.some((b) => b === 1);
      const out: boolean =
        u.kind === 'NOT' ? ins[0] === 0 : u.kind === 'XOR2' ? ins[0] !== ins[1] : u.kind === 'OR2' ? or : u.kind === 'NOR2' ? !or : u.kind === 'NAND2' ? !and : and;
      v[u.output] = out ? 1 : 0;
    }
  }
  return v;
}

/** 從元件定義的 logic.gates 讀出每一組閘的輸入、輸出腳號。 */
export function gateSlots(defId: string): Array<{ inputs: number[]; output: number }> {
  const def = getComponentDefinition(defId);
  if (!def || !def.logic || def.logic.model !== 'gates') throw new Error(`${defId} has no gate model`);
  const pin = (name: string) => {
    const p = def.pins.find((x) => x.name === name);
    if (!p) throw new Error(`${defId} has no pin ${name}`);
    return p.number;
  };
  return def.logic.gates.map((g) => ({ inputs: g.in.map(pin), output: pin(g.out) }));
}

export interface IcPlan {
  id: string;
  defId: string;
  /** 每一組閘放哪個單元；null 是沒用到的組。 */
  slots: Array<Unit | null>;
}

/** 依 IC 表的順序分組，一片填滿再開下一片。 */
export function assignIcs(units: Unit[]): IcPlan[] {
  const plans: IcPlan[] = [];
  for (const kind of ORDER) {
    const list = units.filter((u) => u.kind === kind);
    if (list.length === 0) continue;
    const per = gateSlots(IC_FOR[kind]).length;
    for (let i = 0; i < list.length; i += per) {
      const slots: Array<Unit | null> = Array.from({ length: per }, (_, k) => list[i + k] ?? null);
      plans.push({ id: `U${plans.length + 1}`, defId: IC_FOR[kind], slots });
    }
  }
  return plans;
}
