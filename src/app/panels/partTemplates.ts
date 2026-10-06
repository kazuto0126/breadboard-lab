import { getComponentDefinitions, RESISTOR_PRESETS } from '../../core/circuit/library';
import type { LedColor } from '../../types/component';
import type { PartTemplate } from '../model/editorTypes';
import { formatOhms, LED_COLOR_NAMES } from './format';

export interface PartCategory {
  id: string;
  title: string;
  parts: PartTemplate[];
}

const LED_COLORS: LedColor[] = ['red', 'green', 'yellow', 'blue'];

/** 規格第 12 節的元件庫分類。 */
export function partCatalog(): PartCategory[] {
  const ics = getComponentDefinitions()
    .filter((d) => d.category === 'ic')
    .map((d): PartTemplate => ({ key: d.id, defId: d.id, label: d.name, props: {} }));
  return [
    { id: '74ls', title: '74LS', parts: ics },
    {
      id: 'resistor',
      title: '電阻',
      parts: RESISTOR_PRESETS.map((ohms) => ({ key: `resistor-${ohms}`, defId: 'resistor', label: formatOhms(ohms), props: { resistance: ohms } })),
    },
    {
      id: 'led',
      title: 'LED',
      parts: LED_COLORS.map((color) => ({ key: `led-${color}`, defId: 'led', label: `${LED_COLOR_NAMES[color]} LED`, props: { color } })),
    },
    {
      id: 'power',
      title: '電源',
      parts: [
        { key: 'vcc', defId: 'vcc', label: 'VCC', props: {} },
        { key: 'gnd', defId: 'gnd', label: 'GND', props: {} },
        { key: 'dc-power', defId: 'dc-power', label: 'DC Power', props: {} },
      ],
    },
    {
      id: 'switch',
      title: '開關與按鈕',
      parts: [
        { key: 'dipsw-4', defId: 'dipsw-4', label: '指撥開關（4 位元）', props: {} },
        { key: 'dipsw-8', defId: 'dipsw-8', label: '指撥開關（8 位元）', props: {} },
        { key: 'pushbutton', defId: 'pushbutton', label: 'Push Button', props: {} },
      ],
    },
  ];
}

export function filterCatalog(catalog: PartCategory[], query: string): PartCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  return catalog
    .map((c) => ({
      ...c,
      parts: c.parts.filter((p) => p.label.toLowerCase().includes(q) || p.defId.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)),
    }))
    .filter((c) => c.parts.length > 0);
}
