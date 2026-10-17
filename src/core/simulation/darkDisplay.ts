import { getComponentDefinition } from '../circuit/library';
import type { Bcd7segLogic, Level } from '../../types/logic';
import { toNumber } from './models';
import type { SimCircuit, SimResult } from './simulate';

/** 7 段顯示器全暗的原因。 */
export type DarkReason =
  | { kind: 'no-power' }
  | { kind: 'fifteen'; driver: string }
  | { kind: 'blanked'; driver: string }
  | { kind: 'driver-unpowered'; driver: string }
  | { kind: 'unwired' };

/**
 * 7 段顯示器為什麼全暗（74LS47 輸入 15 時本來就全暗，和沒通電看起來一樣，要分開說）；有亮的段或不是顯示器時回傳 null。
 * 驅動它的 74LS47：輸出腳直接或經過一顆電阻接到顯示器的段。
 */
export function whyDark(sim: SimCircuit, result: SimResult, displayId: string): DarkReason | null {
  const display = sim.displays.find((d) => d.componentId === displayId);
  if (!display || (result.litSegments[displayId]?.length ?? 0) > 0) return null;
  const keyOf = new Map<string, string>();
  for (const [key, node] of sim.nodeOfPin) if (!keyOf.has(node)) keyOf.set(node, key);
  const levelAt = (node: string | null | undefined): Level => {
    const key = node ? keyOf.get(node) : undefined;
    return key ? (result.pinLevels[key] ?? 'Z') : 'Z';
  };
  if (levelAt(display.anode) !== 1) return { kind: 'no-power' };

  const segments = new Set(display.segments.flatMap((s) => (s.node ? [s.node] : [])));
  const near = new Set(segments);
  for (const r of sim.resistors) {
    if (segments.has(r.a)) near.add(r.b);
    if (segments.has(r.b)) near.add(r.a);
  }
  for (const ic of sim.ics) {
    const logic = getComponentDefinition(ic.defId)?.logic;
    if (logic?.model !== 'bcd7seg') continue;
    const spec = logic as Bcd7segLogic;
    if (!spec.segments.some((pin) => near.has(ic.pinNodes.get(pin) ?? ''))) continue;
    const driver = ic.componentId;
    if (result.unpowered.includes(driver)) return { kind: 'driver-unpowered', driver };
    // 和模擬一樣：TTL 輸入浮接讀成 1。
    const read = (pin: string) => {
      const v = levelAt(ic.pinNodes.get(pin));
      return v === 'Z' ? 1 : v;
    };
    if (read(spec.blanking) === 0) return { kind: 'blanked', driver };
    const value = toNumber(spec.inputs.map(read));
    if (value === 15 && read(spec.lampTest) !== 0) return { kind: 'fifteen', driver };
    if (value === 0 && read(spec.rippleBlanking) === 0) return { kind: 'blanked', driver };
  }
  return { kind: 'unwired' };
}

/** 全暗原因的說明文字。 */
export function darkReasonText(r: DarkReason): string {
  switch (r.kind) {
    case 'no-power':
      return '共陽極（COM）沒有接到 +5 V，所以全暗。';
    case 'fifteen':
      return `${r.driver}（74LS47）的輸入 DCBA 是 1111，也就是 15：74LS47 遇到 15 本來就全暗，不是沒通電（沒接的輸入腳算 1）。`;
    case 'blanked':
      return `${r.driver}（74LS47）的消隱腳（/BI/RBO 或 /RBI）是 0，讓顯示器全暗。`;
    case 'driver-unpowered':
      return `${r.driver}（74LS47）沒有接好 VCC / GND，所以全暗。`;
    case 'unwired':
      return 'a–g 都沒有被拉到 0：檢查 a–g 有沒有經過電阻接到 74LS47 的輸出。';
  }
}
