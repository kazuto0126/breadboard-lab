import { getComponentDefinition } from '../core/circuit/library';
import type { BreadboardInstance } from '../types/board';
import type { Circuit, Wire, Note, NoteColor } from '../types/circuit';
import type { ComponentInstance, ComponentProps, LedColor, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';
import { boardRects, MAX_BOARDS, normalizeBoardGroups, rectsOverlap } from './boards';
import type { ChecklistState } from './checklist';
import { LABEL_MAX } from './commands';
import { parseLogicDiagram } from '../logic/file';
import type { LogicDiagram } from '../logic/types';
import { NOTE_COLORS, NOTE_MAX } from './notes';

export const FILE_FORMAT = 'breadboard-lab/circuit';
export const FILE_VERSION = 1;

/** 存檔格式（Save、Export JSON、自動儲存都用這個）。 */
export interface CircuitFile {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  name: string;
  savedAt: string;
  circuit: Circuit;
  /** 接線清單的勾選進度（選填；自動儲存與專案存檔才有，匯出 JSON 不含）。 */
  checklist?: ChecklistState;
  /** 邏輯圖（選填；子專案 12）。沒有元件時不寫。 */
  logic?: LogicDiagram;
}

export type ParseResult = { ok: true; circuit: Circuit; name: string | null; checklist?: ChecklistState; logic?: LogicDiagram } | { ok: false; error: string };

export function emptyCircuit(): Circuit {
  return { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] };
}

export function toCircuitFile(circuit: Circuit, name: string, now: Date = new Date(), checklist?: ChecklistState, logic?: LogicDiagram): CircuitFile {
  const file: CircuitFile = { format: FILE_FORMAT, version: FILE_VERSION, name, savedAt: now.toISOString(), circuit };
  if (checklist && Object.keys(checklist).length > 0) file.checklist = checklist;
  if (logic && logic.nodes.length > 0) file.logic = logic;
  return file;
}

export function serializeCircuitFile(circuit: Circuit, name: string, now?: Date, logic?: LogicDiagram): string {
  return JSON.stringify(toCircuitFile(circuit, name, now, undefined, logic), null, 2);
}

class FormatError extends Error {}

function fail(path: string, message: string): never {
  throw new FormatError(path ? `${path}：${message}` : message);
}

type Obj = Record<string, unknown>;

function obj(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, '必須是物件');
  return value as Obj;
}

function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, '必須是陣列');
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, '必須是非空字串');
  return value;
}

function int(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, '必須是整數');
  return value;
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, '必須是數字');
  return value;
}

const ROTATIONS = new Set([0, 90, 180, 270]);
const LED_COLORS = new Set<string>(['red', 'green', 'yellow', 'blue']);

function parseBoard(raw: unknown, path: string): BreadboardInstance {
  const b = obj(raw, path);
  if (b.layoutId !== 'MB102' && b.layoutId !== 'EIC1106') fail(`${path}.layoutId`, `不支援的麵包板版型 ${String(b.layoutId)}（目前有 MB102、EIC1106）`);
  return { id: str(b.id, `${path}.id`), layoutId: b.layoutId, x: num(b.x ?? 0, `${path}.x`), y: num(b.y ?? 0, `${path}.y`), groupId: null };
}

function parseProps(raw: unknown, path: string): ComponentProps {
  const p = obj(raw ?? {}, path);
  const props: ComponentProps = {};
  if (p.resistance !== undefined) {
    const r = num(p.resistance, `${path}.resistance`);
    if (r <= 0) fail(`${path}.resistance`, '必須大於 0');
    props.resistance = r;
  }
  if (p.color !== undefined) {
    if (typeof p.color !== 'string' || !LED_COLORS.has(p.color)) fail(`${path}.color`, 'LED 顏色必須是 red、green、yellow 或 blue');
    props.color = p.color as LedColor;
  }
  if (p.voltage !== undefined) props.voltage = num(p.voltage, `${path}.voltage`);
  if (p.frequency !== undefined) {
    const f = num(p.frequency, `${path}.frequency`);
    if (f <= 0) fail(`${path}.frequency`, '必須大於 0');
    props.frequency = f;
  }
  if (p.capacitance !== undefined) {
    const c = num(p.capacitance, `${path}.capacitance`);
    if (c <= 0) fail(`${path}.capacitance`, '必須大於 0');
    props.capacitance = c;
  }
  if (p.switchStates !== undefined) {
    const states = arr(p.switchStates, `${path}.switchStates`);
    if (!states.every((s) => typeof s === 'boolean')) fail(`${path}.switchStates`, '必須是 true / false 陣列');
    props.switchStates = states as boolean[];
  }
  if (p.labels !== undefined) {
    const labels = arr(p.labels, `${path}.labels`);
    if (!labels.every((s) => typeof s === 'string')) fail(`${path}.labels`, '必須是文字陣列');
    // 子專案 14：名稱最多 8 個字，太長就截斷（不讓整個檔案打不開）。
    props.labels = (labels as string[]).map((s) => s.slice(0, LABEL_MAX));
  }
  return props;
}

function parsePoint(raw: unknown, path: string, boardIds: Set<string>): GridPoint {
  const p = obj(raw, path);
  const boardId = str(p.boardId, `${path}.boardId`);
  if (!boardIds.has(boardId)) fail(`${path}.boardId`, `找不到麵包板 ${boardId}`);
  return { boardId, x: int(p.x, `${path}.x`), y: int(p.y, `${path}.y`) };
}

function parseComponent(raw: unknown, path: string, boardIds: Set<string>): ComponentInstance {
  const c = obj(raw, path);
  const id = str(c.id, `${path}.id`);
  const defId = str(c.defId, `${path}.defId`);
  if (!getComponentDefinition(defId)) fail(`${path}.defId`, `元件庫裡沒有 ${defId}`);
  const boardId = str(c.boardId, `${path}.boardId`);
  if (!boardIds.has(boardId)) fail(`${path}.boardId`, `找不到麵包板 ${boardId}`);
  const anchor = obj(c.anchor, `${path}.anchor`);
  const rotation = c.rotation ?? 0;
  if (typeof rotation !== 'number' || !ROTATIONS.has(rotation)) fail(`${path}.rotation`, '必須是 0、90、180 或 270');
  const instance: ComponentInstance = {
    id,
    defId,
    boardId,
    anchor: { x: int(anchor.x, `${path}.anchor.x`), y: int(anchor.y, `${path}.anchor.y`) },
    rotation: rotation as Rotation,
    props: parseProps(c.props, `${path}.props`),
  };
  if (c.span !== undefined) {
    const span = int(c.span, `${path}.span`);
    if (span < 1) fail(`${path}.span`, '必須大於等於 1');
    instance.span = span;
  }
  return instance;
}

function parseWire(raw: unknown, path: string, boardIds: Set<string>): Wire {
  const w = obj(raw, path);
  const source = w.source ?? 'manual';
  if (source !== 'manual' && source !== 'auto') fail(`${path}.source`, '必須是 manual 或 auto');
  if (w.straight !== undefined && w.straight !== true) fail(`${path}.straight`, '只能是 true');
  const points = arr(w.path, `${path}.path`).map((p, i) => parsePoint(p, `${path}.path[${i}]`, boardIds));
  if (points.length < 2) fail(`${path}.path`, '導線至少要有兩個點');
  const wire: Wire = {
    id: str(w.id, `${path}.id`),
    color: str(w.color ?? '#1565c0', `${path}.color`),
    source,
    start: parsePoint(w.start ?? points[0], `${path}.start`, boardIds),
    end: parsePoint(w.end ?? points[points.length - 1], `${path}.end`, boardIds),
    path: points,
  };
  if (w.netId !== undefined) wire.netId = str(w.netId, `${path}.netId`);
  // 直線導線：path 一律是兩端（忽略檔案裡多餘的點）。
  if (w.straight === true) {
    wire.straight = true;
    wire.path = [{ ...wire.start }, { ...wire.end }];
  }
  return wire;
}

function assertUnique(ids: string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail('', `${what} ID「${id}」重複`);
    seen.add(id);
  }
}

/** 規格（2026-10-13 notes）第 3 節：便條。指向不存在的元件時忽略指向；文字太長截斷。 */
function parseNote(raw: unknown, path: string, componentIds: Set<string>): Note {
  const n = obj(raw, path);
  const note: Note = { id: str(n.id, `${path}.id`), x: num(n.x, `${path}.x`), y: num(n.y, `${path}.y`), text: '', color: 'yellow' };
  if (typeof n.text !== 'string') fail(`${path}.text`, '必須是文字');
  note.text = (n.text as string).slice(0, NOTE_MAX);
  if (!NOTE_COLORS.includes(n.color as NoteColor)) fail(`${path}.color`, `顏色不認得（${String(n.color)}）`);
  note.color = n.color as NoteColor;
  if (typeof n.target === 'string' && componentIds.has(n.target)) note.target = n.target;
  return note;
}

function parseCircuit(raw: unknown): Circuit {
  const c = obj(raw, 'circuit');
  if (c.version !== 1) fail('circuit.version', `不支援的電路版本 ${String(c.version)}`);
  const boards = arr(c.boards, 'circuit.boards').map((b, i) => parseBoard(b, `circuit.boards[${i}]`));
  if (boards.length === 0) fail('circuit.boards', '至少要有一塊麵包板');
  if (boards.length > MAX_BOARDS) fail('circuit.boards', `最多 ${MAX_BOARDS} 塊麵包板`);
  assertUnique(
    boards.map((b) => b.id),
    '麵包板',
  );
  const rects = boardRects({ boards });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) fail('circuit.boards', `麵包板 ${rects[i].id} 和 ${rects[j].id} 重疊`);
    }
  }
  const boardIds = new Set(boards.map((b) => b.id));
  const components = arr(c.components ?? [], 'circuit.components').map((x, i) =>
    parseComponent(x, `circuit.components[${i}]`, boardIds),
  );
  const wires = arr(c.wires ?? [], 'circuit.wires').map((x, i) => parseWire(x, `circuit.wires[${i}]`, boardIds));
  assertUnique(
    components.map((x) => x.id),
    '元件',
  );
  assertUnique(
    wires.map((x) => x.id),
    '導線',
  );
  const componentIds = new Set(components.map((x) => x.id));
  const notes = arr(c.notes ?? [], 'circuit.notes').map((x, i) => parseNote(x, `circuit.notes[${i}]`, componentIds));
  assertUnique(
    notes.map((x) => x.id),
    '便條',
  );
  // 位置對齊格點、依幾何重新推導 Board Group（檔案裡的 groupId 不採信）。
  return normalizeBoardGroups({ version: 1, boards, components, wires, ...(notes.length > 0 ? { notes } : {}) });
}

/** 勾選進度只是輔助資訊：格式不對的項目直接略過，不讓整個檔案打不開。 */
function parseChecklist(raw: unknown): ChecklistState | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Obj).filter((e): e is [string, string] => typeof e[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** 接受 CircuitFile（Save / Export 的格式），也接受直接貼上的 Circuit 物件。 */
export function parseCircuitData(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: '檔案內容必須是 JSON 物件' };
  try {
    const top = raw as Obj;
    if (top.format !== undefined) {
      if (top.format !== FILE_FORMAT) fail('format', `不是 Breadboard Lab 的電路檔（${String(top.format)}）`);
      if (top.version !== FILE_VERSION) fail('version', `不支援的檔案版本 ${String(top.version)}`);
      const name = typeof top.name === 'string' && top.name.trim() ? top.name.trim() : null;
      const checklist = parseChecklist(top.checklist);
      let logic: LogicDiagram | undefined;
      if (top.logic !== undefined) {
        const parsed = parseLogicDiagram(top.logic);
        if (!parsed.ok) fail('logic', `邏輯圖有問題：${parsed.error}`);
        else logic = parsed.diagram;
      }
      const circuit = parseCircuit(top.circuit);
      return { ok: true, circuit, name, ...(checklist ? { checklist } : {}), ...(logic ? { logic } : {}) };
    }
    return { ok: true, circuit: parseCircuit(top), name: null };
  } catch (err) {
    if (err instanceof FormatError) return { ok: false, error: err.message };
    throw err;
  }
}

export function parseCircuitText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `不是有效的 JSON（${(err as Error).message}）` };
  }
  return parseCircuitData(raw);
}
