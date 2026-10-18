import type {
  ComponentCategory,
  ComponentDefinition,
  ComponentProps,
  PackageSpec,
  PinDefinition,
  PinRole,
} from '../../types/component';
import { parseLogic } from './logicSpec';
import clock from '../../data/components/generic/clock.json';
import dcPower from '../../data/components/generic/dc-power.json';
import dipsw4 from '../../data/components/generic/dipsw-4.json';
import dipsw8 from '../../data/components/generic/dipsw-8.json';
import gnd from '../../data/components/generic/gnd.json';
import led from '../../data/components/generic/led.json';
import sevenSeg from '../../data/components/generic/7seg-ca.json';
import sevenSegCc from '../../data/components/generic/7seg-cc.json';
import capCeramic from '../../data/components/generic/capacitor-ceramic.json';
import capElectrolytic from '../../data/components/generic/capacitor-electrolytic.json';
import pushbutton from '../../data/components/generic/pushbutton.json';
import resistor from '../../data/components/generic/resistor.json';
import vcc from '../../data/components/generic/vcc.json';
import ne555 from '../../data/components/generic/ne555.json';
import ls00 from '../../data/components/74ls/74LS00.json';
import ls02 from '../../data/components/74ls/74LS02.json';
import ls04 from '../../data/components/74ls/74LS04.json';
import ls08 from '../../data/components/74ls/74LS08.json';
import ls11 from '../../data/components/74ls/74LS11.json';
import ls21 from '../../data/components/74ls/74LS21.json';
import ls32 from '../../data/components/74ls/74LS32.json';
import ls47 from '../../data/components/74ls/74LS47.json';
import ls48 from '../../data/components/74ls/74LS48.json';
import ls73 from '../../data/components/74ls/74LS73.json';
import ls74 from '../../data/components/74ls/74LS74.json';
import ls76 from '../../data/components/74ls/74LS76.json';
import ls83 from '../../data/components/74ls/74LS83.json';
import ls85 from '../../data/components/74ls/74LS85.json';
import ls86 from '../../data/components/74ls/74LS86.json';
import ls90 from '../../data/components/74ls/74LS90.json';
import ls93 from '../../data/components/74ls/74LS93.json';
import ls138 from '../../data/components/74ls/74LS138.json';
import ls151 from '../../data/components/74ls/74LS151.json';
import ls153 from '../../data/components/74ls/74LS153.json';
import ls154 from '../../data/components/74ls/74LS154.json';
import ls161 from '../../data/components/74ls/74LS161.json';
import ls163 from '../../data/components/74ls/74LS163.json';
import ls173 from '../../data/components/74ls/74LS173.json';
import ls174 from '../../data/components/74ls/74LS174.json';
import ls175 from '../../data/components/74ls/74LS175.json';
import ls193 from '../../data/components/74ls/74LS193.json';
import ls245 from '../../data/components/74ls/74LS245.json';
import ls273 from '../../data/components/74ls/74LS273.json';
import ls283 from '../../data/components/74ls/74LS283.json';

const RAW_DEFINITIONS: unknown[] = [
  resistor, led, sevenSeg, sevenSegCc, capCeramic, capElectrolytic, vcc, gnd, dcPower, dipsw4, dipsw8, pushbutton, clock, ne555,
  ls00, ls02, ls04, ls08, ls11, ls21, ls32, ls47, ls48, ls73, ls74, ls76, ls83, ls85, ls86, ls90, ls93, ls138,
  ls151, ls153, ls154, ls161, ls163, ls173, ls174, ls175, ls193, ls245, ls273, ls283,
];

export const RESISTOR_PRESETS: readonly number[] = [220, 330, 470, 1000, 2200, 4700, 10000, 100000];

const CATEGORIES = new Set<string>(['ic', 'resistor', 'led', 'vcc', 'gnd', 'dc-power', 'dip-switch', 'pushbutton', 'clock', 'seven-seg', 'capacitor']);
const ROLES = new Set<string>([
  'input', 'output', 'bidir', 'power', 'ground', 'nc', 'passive', 'anode', 'cathode', 'vcc-source', 'gnd-source',
]);

function fail(id: string, message: string): never {
  throw new Error(`Invalid component definition ${id}: ${message}`);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function parsePackage(id: string, raw: unknown): { pkg: PackageSpec; pinCount: number } {
  if (typeof raw !== 'object' || raw === null) fail(id, 'missing package');
  const p = raw as Record<string, unknown>;
  switch (p.type) {
    case 'dip': {
      const pinCount = p.pinCount;
      const rowSpacing = p.rowSpacing;
      if (!isPositiveInt(pinCount) || pinCount % 2 !== 0) fail(id, 'dip pinCount must be a positive even integer');
      if (rowSpacing !== 3 && rowSpacing !== 6) fail(id, 'dip rowSpacing must be 3 or 6');
      return { pkg: { type: 'dip', pinCount, rowSpacing }, pinCount };
    }
    case 'two-lead': {
      const defaultSpan = p.defaultSpan;
      const minSpan = p.minSpan;
      const blocksBetween = p.blocksBetween;
      if (!isPositiveInt(defaultSpan) || !isPositiveInt(minSpan) || defaultSpan < minSpan) {
        fail(id, 'two-lead spans must be integers with defaultSpan >= minSpan >= 1');
      }
      if (typeof blocksBetween !== 'boolean') fail(id, 'two-lead blocksBetween must be a boolean');
      return { pkg: { type: 'two-lead', defaultSpan, minSpan, blocksBetween }, pinCount: 2 };
    }
    case 'single':
      return { pkg: { type: 'single' }, pinCount: 1 };
    case 'tactile4':
      return { pkg: { type: 'tactile4' }, pinCount: 4 };
    default:
      return fail(id, `unknown package type ${String(p.type)}`);
  }
}

/** 驗證一份 JSON 元件定義；資料錯誤時丟出可讀的錯誤。 */
export function parseDefinition(raw: unknown): ComponentDefinition {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid component definition: not an object');
  const d = raw as Record<string, unknown>;
  const id = typeof d.id === 'string' && d.id.length > 0 ? d.id : fail('?', 'missing id');
  const name = d.name;
  if (typeof name !== 'string') fail(id, 'missing name');
  const description = d.description ?? '';
  if (typeof description !== 'string') fail(id, 'description must be a string');
  const category = d.category;
  if (typeof category !== 'string' || !CATEGORIES.has(category)) fail(id, `unknown category ${String(category)}`);
  const { pkg, pinCount } = parsePackage(id, d.package);

  const rawPins = d.pins;
  if (!Array.isArray(rawPins)) fail(id, 'pins must be an array');
  const pins: PinDefinition[] = rawPins.map((entry: unknown, i: number) => {
    const p = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const num = p.number;
    const pinName = p.name;
    const role = p.role;
    if (!isPositiveInt(num)) fail(id, `pin #${i} has an invalid number`);
    if (typeof pinName !== 'string') fail(id, `pin ${num} has no name`);
    if (typeof role !== 'string' || !ROLES.has(role)) fail(id, `pin ${num} has unknown role ${String(role)}`);
    return { number: num, name: pinName, role: role as PinRole };
  });
  const numbers = pins.map((p) => p.number).sort((a, b) => a - b);
  if (numbers.length !== pinCount || numbers.some((n, i) => n !== i + 1)) fail(id, `pins must be numbered 1..${pinCount}`);

  const internalConnections = d.internalConnections ?? [];
  if (
    !Array.isArray(internalConnections) ||
    !internalConnections.every((set: unknown) => Array.isArray(set) && set.every((n: unknown) => isPositiveInt(n) && n <= pinCount))
  ) {
    fail(id, 'internalConnections must be arrays of pin numbers');
  }
  const defaultProps = d.defaultProps ?? {};
  if (typeof defaultProps !== 'object' || defaultProps === null) fail(id, 'defaultProps must be an object');
  // 邏輯模型只能引用不重複的腳位名稱（例如 74LS90 有兩隻 NC 腳，不能被引用）。
  const nameCounts = new Map<string, number>();
  for (const p of pins) nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
  const uniqueNames = new Set([...nameCounts].filter(([, n]) => n === 1).map(([name]) => name));
  const logic = parseLogic(id, d.logic, uniqueNames);

  return {
    id,
    name,
    description,
    category: category as ComponentCategory,
    package: pkg,
    pins,
    internalConnections: internalConnections as number[][],
    defaultProps: defaultProps as ComponentProps,
    logic,
  };
}

let cache: ComponentDefinition[] | null = null;

export function getComponentDefinitions(): ComponentDefinition[] {
  if (!cache) {
    const defs = RAW_DEFINITIONS.map(parseDefinition);
    const seen = new Set<string>();
    for (const def of defs) {
      if (seen.has(def.id)) throw new Error(`Duplicate component definition id: ${def.id}`);
      seen.add(def.id);
    }
    cache = defs;
  }
  return cache;
}

export function getComponentDefinition(id: string): ComponentDefinition | undefined {
  return getComponentDefinitions().find((def) => def.id === id);
}
