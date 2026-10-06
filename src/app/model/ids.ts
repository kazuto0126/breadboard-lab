import type { Circuit } from '../../types/circuit';
import type { ComponentCategory } from '../../types/component';

export const ID_PREFIX: Record<ComponentCategory, string> = {
  ic: 'U',
  resistor: 'R',
  led: 'D',
  vcc: 'VCC',
  gnd: 'GND',
  'dc-power': 'PWR',
  'dip-switch': 'SW',
  pushbutton: 'BTN',
};

function nextFree(used: Set<string>, prefix: string): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!used.has(id)) return id;
  }
}

export function nextComponentId(circuit: Circuit, category: ComponentCategory): string {
  return nextFree(new Set(circuit.components.map((c) => c.id)), ID_PREFIX[category]);
}

export function nextWireId(circuit: Circuit): string {
  return nextFree(new Set(circuit.wires.map((w) => w.id)), 'm');
}
