import type { Circuit, Wire } from '../../types/circuit';
import type { RoutingMetrics } from '../../types/routing';

export const PROJECT_FORMAT = 'breadboard-lab';
export const DEFAULT_PROJECT_NAME = '未命名電路';
export const BOARD_ID = 'b1';

export interface RoutingRecord {
  before: Wire[];
  beforeScore: number;
  metrics: RoutingMetrics;
  score: number;
  signature: string;
  checklist: Record<string, boolean>;
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: 1;
  name: string;
  circuit: Circuit;
  routing: RoutingRecord | null;
  savedAt: string;
}

export function emptyCircuit(): Circuit {
  return {
    version: 1,
    boards: [{ id: BOARD_ID, layoutId: 'MB102', x: 0, y: 0, groupId: null }],
    components: [],
    wires: [],
  };
}

export function createProject(name: string = DEFAULT_PROJECT_NAME, now: Date = new Date()): ProjectFile {
  return { format: PROJECT_FORMAT, version: 1, name, circuit: emptyCircuit(), routing: null, savedAt: now.toISOString() };
}

/** 物件鍵排序後的 JSON：同樣的內容永遠得到同樣的字串（undefined 的欄位省略，和 JSON.stringify 一致）。 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 元件與導線的內容簽章（依 ID 排序），用來判斷接線清單是否過期。 */
export function circuitSignature(circuit: Circuit): string {
  const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return stableStringify({ components: byId(circuit.components), wires: byId(circuit.wires) });
}

export function isRoutingStale(doc: ProjectFile): boolean {
  return doc.routing !== null && doc.routing.signature !== circuitSignature(doc.circuit);
}
