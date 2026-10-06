import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit } from '../../types/circuit';
import { DEFAULT_PROJECT_NAME, PROJECT_FORMAT, type ProjectFile, type RoutingRecord } from '../model/projectFile';

export type ParseResult = { ok: true; doc: ProjectFile } | { ok: false; reason: string };

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isPoint = (v: unknown): boolean => isObject(v) && typeof v.boardId === 'string' && isInt(v.x) && isInt(v.y);
const ROTATIONS = new Set<unknown>([0, 90, 180, 270]);
const METRIC_KEYS = ['wireCount', 'totalLength', 'bends', 'crossings', 'overlaps', 'shortJogs'];

function wireProblem(w: unknown, index: number): string | null {
  if (!isObject(w) || typeof w.id !== 'string' || typeof w.color !== 'string') return `第 ${index + 1} 條導線的資料不完整`;
  if (w.source !== 'manual' && w.source !== 'auto') return `導線 ${w.id} 的來源不正確`;
  if (!isPoint(w.start) || !isPoint(w.end) || !Array.isArray(w.path) || !w.path.every(isPoint)) return `導線 ${w.id} 的座標不正確`;
  return null;
}

/** 回傳電路資料的第一個問題（中文），沒有問題時回傳 null。 */
export function circuitProblem(value: unknown): string | null {
  if (!isObject(value)) return '檔案裡沒有電路資料';
  if (value.version !== 1) return '不支援的電路版本';
  const boards = value.boards;
  if (!Array.isArray(boards) || boards.length !== 1 || !isObject(boards[0]) || boards[0].layoutId !== 'MB102' || typeof boards[0].id !== 'string') {
    return '目前只支援一塊 MB-102 麵包板';
  }
  if (!Array.isArray(value.components)) return '元件資料不正確';
  const componentIds = new Set<string>();
  for (const [i, c] of value.components.entries()) {
    if (!isObject(c) || typeof c.id !== 'string' || typeof c.defId !== 'string' || typeof c.boardId !== 'string') {
      return `第 ${i + 1} 個元件的資料不完整`;
    }
    if (!getComponentDefinition(c.defId)) return `找不到元件「${c.defId}」`;
    if (!isObject(c.anchor) || !isInt(c.anchor.x) || !isInt(c.anchor.y)) return `元件 ${c.id} 的位置不正確`;
    if (!ROTATIONS.has(c.rotation)) return `元件 ${c.id} 的旋轉角度不正確`;
    if (c.span !== undefined && !isInt(c.span)) return `元件 ${c.id} 的兩腳距離不正確`;
    if (!isObject(c.props)) return `元件 ${c.id} 的屬性不正確`;
    if (componentIds.has(c.id)) return `元件 ID 重複：${c.id}`;
    componentIds.add(c.id);
  }
  if (!Array.isArray(value.wires)) return '導線資料不正確';
  const wireIds = new Set<string>();
  for (const [i, w] of value.wires.entries()) {
    const problem = wireProblem(w, i);
    if (problem) return problem;
    const id = (w as Obj).id as string;
    if (wireIds.has(id)) return `導線 ID 重複：${id}`;
    wireIds.add(id);
  }
  return null;
}

function parseRouting(value: unknown): RoutingRecord | null {
  if (!isObject(value)) return null;
  const { before, beforeScore, metrics, score, signature, checklist } = value;
  if (!Array.isArray(before) || before.some((w, i) => wireProblem(w, i) !== null)) return null;
  if (typeof beforeScore !== 'number' || typeof score !== 'number' || typeof signature !== 'string') return null;
  if (!isObject(metrics) || !METRIC_KEYS.every((k) => typeof metrics[k] === 'number')) return null;
  if (!isObject(checklist) || !Object.values(checklist).every((v) => typeof v === 'boolean')) return null;
  return value as unknown as RoutingRecord;
}

export function parseProjectFile(text: string, fallbackName: string = DEFAULT_PROJECT_NAME): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: '檔案不是有效的 JSON' };
  }
  if (!isObject(data)) return { ok: false, reason: '檔案內容不是 breadboard-lab 的電路' };
  if (data.format === PROJECT_FORMAT) {
    if (data.version !== 1) return { ok: false, reason: '不支援的檔案版本' };
    const problem = circuitProblem(data.circuit);
    if (problem) return { ok: false, reason: problem };
    const name = typeof data.name === 'string' && data.name.trim() !== '' ? data.name : fallbackName;
    return {
      ok: true,
      doc: {
        format: PROJECT_FORMAT,
        version: 1,
        name,
        circuit: data.circuit as Circuit,
        routing: parseRouting(data.routing),
        savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
      },
    };
  }
  if ('components' in data && 'wires' in data) {
    const problem = circuitProblem(data);
    if (problem) return { ok: false, reason: problem };
    return {
      ok: true,
      doc: { format: PROJECT_FORMAT, version: 1, name: fallbackName, circuit: data as unknown as Circuit, routing: null, savedAt: new Date().toISOString() },
    };
  }
  return { ok: false, reason: '檔案內容不是 breadboard-lab 的電路' };
}

export function serializeProject(doc: ProjectFile): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** 把檔名不允許的字元換成 _；空白名稱改用預設名稱。 */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned === '' ? DEFAULT_PROJECT_NAME : cleaned;
}

export function projectFileName(doc: ProjectFile, extension: 'breadboard.json' | 'svg' | 'png'): string {
  return `${safeFileName(doc.name)}.${extension}`;
}
