import { getComponentDefinitions, RESISTOR_PRESETS } from '../core/circuit/library';
import type { ComponentCategory, ComponentDefinition, ComponentProps, LedColor } from '../types/component';

/** 元件庫中的一個項目：同一個元件定義可以有多種預設值（例如 8 種阻值的電阻）。 */
export interface LibraryItem {
  key: string;
  defId: string;
  name: string;
  description: string;
  category: ComponentCategory;
  props: ComponentProps;
  /** 搜尋用的小寫文字。 */
  keywords: string;
}

export interface LibrarySection {
  id: 'ic' | 'resistor' | 'led' | 'power' | 'input';
  title: string;
  items: LibraryItem[];
}

export const LED_COLOR_NAMES: Record<LedColor, string> = { red: '紅', green: '綠', yellow: '黃', blue: '藍' };
export const LED_COLORS = Object.keys(LED_COLOR_NAMES) as LedColor[];

/** 220 → "220Ω"、2200 → "2.2kΩ"、100000 → "100kΩ"。 */
export function formatResistance(ohms: number): string {
  const units: Array<[number, string]> = [
    [1e6, 'MΩ'],
    [1e3, 'kΩ'],
  ];
  for (const [factor, unit] of units) {
    if (ohms >= factor) return `${Number((ohms / factor).toPrecision(3))}${unit}`;
  }
  return `${Number(ohms.toPrecision(3))}Ω`;
}

function item(def: ComponentDefinition, key: string, name: string, props: ComponentProps, description = def.description ?? ''): LibraryItem {
  return {
    key,
    defId: def.id,
    name,
    description,
    category: def.category,
    props,
    keywords: `${def.id} ${def.name} ${name} ${description}`.toLowerCase(),
  };
}

let sections: LibrarySection[] | null = null;

/** 元件庫的分類與項目，全部由元件定義 JSON 產生；新增 IC 只需要新增 JSON。 */
export function librarySections(): LibrarySection[] {
  if (sections) return sections;
  const defs = getComponentDefinitions();
  const byCategory = (...categories: ComponentCategory[]) => defs.filter((d) => categories.includes(d.category));
  const ics = byCategory('ic').sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')));
  const resistor = defs.find((d) => d.id === 'resistor');
  const led = defs.find((d) => d.id === 'led');
  sections = [
    { id: 'ic', title: '74LS 系列 IC', items: ics.map((d) => item(d, d.id, d.name, {})) },
    {
      id: 'resistor',
      title: '電阻 Resistor',
      items: resistor
        ? RESISTOR_PRESETS.map((ohms) => item(resistor, `resistor-${ohms}`, `${formatResistance(ohms)} 電阻`, { resistance: ohms }))
        : [],
    },
    {
      id: 'led',
      title: 'LED',
      items: led ? LED_COLORS.map((color) => item(led, `led-${color}`, `${LED_COLOR_NAMES[color]}色 LED`, { color })) : [],
    },
    { id: 'power', title: '電源 Power', items: byCategory('vcc', 'gnd', 'dc-power').map((d) => item(d, d.id, d.name, {})) },
    { id: 'input', title: '輸入 Input', items: byCategory('dip-switch', 'pushbutton').map((d) => item(d, d.id, d.name, {})) },
  ];
  return sections;
}

export function searchLibrary(all: LibrarySection[], query: string): LibrarySection[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return all;
  return all
    .map((s) => ({ ...s, items: s.items.filter((i) => words.every((w) => i.keywords.includes(w))) }))
    .filter((s) => s.items.length > 0);
}

export function findLibraryItem(key: string): LibraryItem | undefined {
  for (const section of librarySections()) {
    const found = section.items.find((i) => i.key === key);
    if (found) return found;
  }
  return undefined;
}
