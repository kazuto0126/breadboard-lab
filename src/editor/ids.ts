import type { Circuit } from '../types/circuit';
import type { ComponentCategory } from '../types/component';

/** 元件編號前綴（參考電路圖的慣例）。 */
export const ID_PREFIX: Record<ComponentCategory, string> = {
  ic: 'U',
  resistor: 'R',
  led: 'D',
  vcc: 'V',
  gnd: 'G',
  'dc-power': 'P',
  'dip-switch': 'SW',
  pushbutton: 'BTN',
  clock: 'CLK',
};

function nextNumbered(ids: string[], prefix: string): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

/** 取「目前最大號 + 1」，刪掉的編號不會被重複使用，避免和舊的存檔或截圖混淆。 */
export function nextComponentId(circuit: Circuit, category: ComponentCategory): string {
  return nextNumbered(
    circuit.components.map((c) => c.id),
    ID_PREFIX[category],
  );
}

export function nextWireId(circuit: Circuit): string {
  return nextNumbered(
    circuit.wires.map((w) => w.id),
    'w',
  );
}
