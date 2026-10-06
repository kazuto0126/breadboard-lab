import type { ComponentCategory, LedColor, PinRole } from '../../types/component';

const trim = (v: number) => String(Math.round(v * 100) / 100);

export function formatOhms(ohms: number): string {
  if (ohms >= 1_000_000) return `${trim(ohms / 1_000_000)}MΩ`;
  if (ohms >= 1000) return `${trim(ohms / 1000)}kΩ`;
  return `${trim(ohms)}Ω`;
}

export const ROLE_NAMES: Record<PinRole, string> = {
  input: '輸入',
  output: '輸出',
  bidir: '雙向',
  power: '電源',
  ground: '接地',
  nc: '未使用',
  passive: '被動',
  anode: '陽極',
  cathode: '陰極',
  'vcc-source': '電源正極',
  'gnd-source': '電源負極',
};

export const CATEGORY_NAMES: Record<ComponentCategory, string> = {
  ic: 'IC',
  resistor: '電阻',
  led: 'LED',
  vcc: 'VCC 端子',
  gnd: 'GND 端子',
  'dc-power': 'DC 電源',
  'dip-switch': '指撥開關',
  pushbutton: '按鈕',
};

export const LED_COLOR_NAMES: Record<LedColor, string> = { red: '紅色', green: '綠色', yellow: '黃色', blue: '藍色' };
