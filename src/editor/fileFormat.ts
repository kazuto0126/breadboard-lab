import { getComponentDefinition } from '../core/circuit/library';
import type { BreadboardInstance } from '../types/board';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentInstance, ComponentProps, LedColor, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';

export const FILE_FORMAT = 'breadboard-lab/circuit';
export const FILE_VERSION = 1;

/** 存檔格式（Save、Export JSON、自動儲存都用這個）。 */
export interface CircuitFile {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  name: string;
  savedAt: string;
  circuit: Circuit;
}

export type ParseResult = { ok: true; circuit: Circuit; name: string | null } | { ok: false; error: string };

export function emptyCircuit(): Circuit {
  return { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] };
}

export function toCircuitFile(circuit: Circuit, name: string, now: Date = new Date()): CircuitFile {
  return { format: FILE_FORMAT, version: FILE_VERSION, name, savedAt: now.toISOString(), circuit };
}

export function serializeCircuitFile(circuit: Circuit, name: string, now?: Date): string {
  return JSON.stringify(toCircuitFile(circuit, name, now), null, 2);
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
  if (b.layoutId !== 'MB102') fail(`${path}.layoutId`, `不支援的麵包板版型 ${String(b.layoutId)}（目前只有 MB102）`);
  return { id: str(b.id, `${path}.id`), layoutId: 'MB102', x: num(b.x ?? 0, `${path}.x`), y: num(b.y ?? 0, `${path}.y`), groupId: null };
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
  if (p.switchStates !== undefined) {
    const states = arr(p.switchStates, `${path}.switchStates`);
    if (!states.every((s) => typeof s === 'boolean')) fail(`${path}.switchStates`, '必須是 true / false 陣列');
    props.switchStates = states as boolean[];
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
  return wire;
}

function assertUnique(ids: string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail('', `${what} ID「${id}」重複`);
    seen.add(id);
  }
}

function parseCircuit(raw: unknown): Circuit {
  const c = obj(raw, 'circuit');
  if (c.version !== 1) fail('circuit.version', `不支援的電路版本 ${String(c.version)}`);
  const boards = arr(c.boards, 'circuit.boards').map((b, i) => parseBoard(b, `circuit.boards[${i}]`));
  if (boards.length !== 1) fail('circuit.boards', '目前只支援一塊麵包板');
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
  return { version: 1, boards, components, wires };
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
      return { ok: true, circuit: parseCircuit(top.circuit), name };
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
