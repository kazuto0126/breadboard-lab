import { getComponentDefinition } from '../core/circuit/library';
import { adoptSimState, compileSimulation, settle, type SimCircuit, type SimState } from '../core/simulation/simulate';
import type { Circuit } from '../types/circuit';
import { bindByNames, type NamedIo } from './diagramCheck';
import { walkStateTask, type StateComparison, type StateMachine } from './stateCheck';
import { stateBitNames, type StateTask } from './stateTask';
import { activeLowLeds, pressedFor, withSwitches, type Bindings } from './verifyBreadboard';

/** 子專案 62（規格 2026-11-14 breadboard-state-check）：麵包板和狀態表比對的結果。 */
export type BreadboardStateCheck =
  | { kind: 'none' }
  | { kind: 'hint' }
  | { kind: 'incomplete'; issues: string[] }
  | (Extract<StateComparison, { kind: 'done' }> & { mapping: string });

/**
 * 規格第 2、3 節：依名稱把題目的輸入對應到開關或按鈕、輸出與狀態位元 Q0、Q1… 對應到 LED，時脈是麵包板上唯一的時脈元件；
 * 從麵包板模擬的上電狀態開始走（和邏輯圖用同一套走法）。換輸入時 IC 的內部狀態沿用，和實際撥開關一樣。
 */
export function checkBreadboardAgainstStateTask(task: StateTask | undefined, circuit: Circuit): BreadboardStateCheck {
  if (!task || circuit.components.length === 0) return { kind: 'none' };
  const bits = stateBitNames(task.states);
  const io: NamedIo = {
    inputs: task.inputs.map((name) => ({ id: name, name })),
    outputs: [...task.outputs, ...bits].map((name) => ({ id: name, name, display: false })),
  };
  const { bindings, issues, matched } = bindByNames(io, circuit);
  if (matched === 0) return { kind: 'hint' };
  const all = issues.map((i) => (bits.some((q) => i.startsWith(`輸出 ${q}：`)) ? `${i}（狀態位元：接到正反器的 Q，Q0 是最低位元）` : i));
  const clocks = circuit.components.filter((c) => getComponentDefinition(c.defId)?.category === 'clock');
  if (clocks.length === 0) all.push('麵包板上沒有時脈元件（接到每個正反器的 CLK）');
  else if (clocks.length > 1) all.push(`麵包板上有好幾個時脈元件（${clocks.map((c) => c.id).join('、')}），比對時只能有一個`);
  if (all.length > 0) return { kind: 'incomplete', issues: all };

  const clock = clocks[0].id;
  // 每種輸入組合編譯一次（開關的位置不一樣）。
  const sims = new Map<string, SimCircuit>();
  const simOf = (input: ReadonlyArray<0 | 1>) => {
    const key = input.join('');
    if (!sims.has(key)) sims.set(key, compileSimulation(withSwitches(circuit, bindings.inputs, input)));
    return sims.get(key)!;
  };
  const run = (previous: SimState | undefined, input: ReadonlyArray<0 | 1>, level: 0 | 1) => {
    const sim = simOf(input);
    const r = settle(sim, adoptSimState(sim, previous), { pressed: pressedFor(bindings.inputs, input), clocks: { [clock]: level } });
    const lit = new Set(r.result.litLeds);
    const low = activeLowLeds(sim);
    const read = (name: string) => {
      const led = bindings.leds[name] ?? '';
      return lit.has(led) !== low.has(led) ? '1' : '0';
    };
    return { handle: r.state as SimState | undefined, read };
  };
  const machine: StateMachine<SimState | undefined> = {
    reset: () => run(undefined, task.inputs.map(() => 0), 0),
    apply: (state, input, level) => run(state, input, level),
  };
  return { ...walkStateTask(task, machine), mapping: mappingText(io, bindings) };
}

/** 「X → SW1 第 1 個開關（ON = 1）、Z → D1、Q1 → D2、Q0 → D3、時脈」。 */
function mappingText(io: NamedIo, b: Bindings): string {
  return [
    ...b.inputs.map((s) => (s.button ? `${s.node} → ${s.switchId}（按下 = ${s.onIs}）` : `${s.node} → ${s.switchId} 第 ${s.index + 1} 個開關（ON = ${s.onIs}）`)),
    ...io.outputs.map((o) => `${o.name} → ${b.leds[o.id]}`),
  ].join('、');
}
