import { buildLattice } from '../core/breadboard/lattice';
import { getNode, nodeIdOf } from '../core/breadboard/naming';
import { getBoard } from '../core/breadboard/registry';
import { effectiveSpan, resolveFootprint } from '../core/circuit/footprint';
import { getComponentDefinition } from '../core/circuit/library';
import { cellsUnder } from '../core/circuit/wireGeometry';
import type { Breadboard } from '../types/board';
import type { Circuit } from '../types/circuit';
import type { ComponentDefinition, ComponentInstance, Rotation } from '../types/component';
import type { Point } from './geometry';

/** 不允許放置的問題。 */
export type HardIssue = 'NO_BOARD' | 'OUT_OF_BOARD' | 'OFF_HOLE' | 'PIN_OCCUPIED' | 'BODY_OVERLAP' | 'SPAN_TOO_SMALL';
/** 允許放置、但吸附時盡量避開的問題（Check Circuit 會回報）。 */
export type SoftIssue = 'PINS_SHORTED' | 'ON_WIRE';

export interface PlacementCheck {
  /** 沒有硬性問題，可以放。 */
  ok: boolean;
  /** 連軟性問題都沒有。 */
  clean: boolean;
  hard: HardIssue[];
  soft: SoftIssue[];
}

/** 某塊板上「別的東西」佔用的格點（格點 ID）。 */
export interface Occupancy {
  board: Breadboard | null;
  pins: Set<string>;
  bodies: Set<string>;
  wireEnds: Set<string>;
  /** 導線經過（不含端點）的格點。 */
  wirePaths: Set<string>;
}

export function buildOccupancy(circuit: Circuit, boardId: string, ignoreId?: string): Occupancy {
  const instance = circuit.boards.find((b) => b.id === boardId);
  const occ: Occupancy = {
    board: instance ? getBoard(instance.layoutId, instance.id) : null,
    pins: new Set(),
    bodies: new Set(),
    wireEnds: new Set(),
    wirePaths: new Set(),
  };
  for (const c of circuit.components) {
    if (c.id === ignoreId || c.boardId !== boardId) continue;
    const def = getComponentDefinition(c.defId);
    if (!def) continue;
    const fp = resolveFootprint(c, def);
    for (const pin of fp.pins) occ.pins.add(nodeIdOf(pin.point));
    for (const cell of fp.blocked) occ.bodies.add(nodeIdOf(cell));
  }
  const lattice = buildLattice(circuit.boards);
  for (const w of circuit.wires) {
    for (const end of [w.start, w.end]) if (end.boardId === boardId) occ.wireEnds.add(nodeIdOf(end));
    for (const p of cellsUnder(w, lattice)) if (p.boardId === boardId) occ.wirePaths.add(nodeIdOf(p));
  }
  return occ;
}

export function checkPlacementWith(occ: Occupancy, instance: ComponentInstance, def: ComponentDefinition): PlacementCheck {
  const hard = new Set<HardIssue>();
  const soft = new Set<SoftIssue>();
  const board = occ.board;
  if (!board) hard.add('NO_BOARD');
  if (def.package.type === 'two-lead' && effectiveSpan(instance, def) < def.package.minSpan) hard.add('SPAN_TOO_SMALL');

  const fp = resolveFootprint(instance, def);
  const pinsByGroup = new Map<string, number[]>();
  if (board) {
    for (const pin of fp.pins) {
      const node = getNode(board, pin.point.x, pin.point.y);
      if (!node) {
        hard.add('OUT_OF_BOARD');
        continue;
      }
      if (node.kind !== 'hole') hard.add('OFF_HOLE');
      const id = node.id;
      if (occ.pins.has(id) || occ.bodies.has(id) || occ.wireEnds.has(id)) hard.add('PIN_OCCUPIED');
      if (occ.wirePaths.has(id)) soft.add('ON_WIRE');
      if (node.groupId) {
        const list = pinsByGroup.get(node.groupId);
        if (list) list.push(pin.pinNumber);
        else pinsByGroup.set(node.groupId, [pin.pinNumber]);
      }
    }
    for (const cell of fp.blocked) {
      const node = getNode(board, cell.x, cell.y);
      if (!node) {
        hard.add('OUT_OF_BOARD');
        continue;
      }
      if (occ.pins.has(node.id) || occ.bodies.has(node.id) || occ.wireEnds.has(node.id)) hard.add('BODY_OVERLAP');
      if (occ.wirePaths.has(node.id)) soft.add('ON_WIRE');
    }
  }

  // 同一導通群組裡的兩隻腳，除非元件內部本來就導通，否則等於被麵包板短路。
  for (const pins of pinsByGroup.values()) {
    if (pins.length < 2) continue;
    const linked = def.internalConnections.some((set) => pins.every((n) => set.includes(n)));
    if (!linked) soft.add('PINS_SHORTED');
  }

  return { ok: hard.size === 0, clean: hard.size === 0 && soft.size === 0, hard: [...hard], soft: [...soft] };
}

export function checkPlacement(circuit: Circuit, instance: ComponentInstance, ignoreId = instance.id): PlacementCheck {
  const def = getComponentDefinition(instance.defId);
  if (!def) throw new Error(`Unknown component definition: ${instance.defId}`);
  return checkPlacementWith(buildOccupancy(circuit, instance.boardId, ignoreId), instance, def);
}

const offsetCache = new Map<number, Array<[number, number]>>();

/** 半徑 radius 內的所有位移，依距離排序（同距離依 |dy|、|dx|、dy、dx），結果固定。 */
export function searchOffsets(radius: number): Array<[number, number]> {
  let offsets = offsetCache.get(radius);
  if (!offsets) {
    offsets = [];
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) offsets.push([dx, dy]);
    offsets.sort(
      ([ax, ay], [bx, by]) =>
        ax * ax + ay * ay - (bx * bx + by * by) ||
        Math.abs(ay) - Math.abs(by) ||
        Math.abs(ax) - Math.abs(bx) ||
        ay - by ||
        ax - bx,
    );
    offsetCache.set(radius, offsets);
  }
  return offsets;
}

export interface FindOptions {
  /** 檢查時忽略的元件（移動、旋轉自己時用）。預設是 instance.id。 */
  ignoreId?: string;
  radius?: number;
}

/**
 * 自動吸附：在 anchor 附近找最近的位置。先找完全沒有問題的位置，
 * 找不到再退而求其次接受只有軟性問題的位置；都沒有就回傳 null。
 */
export function findPlacement(circuit: Circuit, instance: ComponentInstance, options: FindOptions = {}): ComponentInstance | null {
  const def = getComponentDefinition(instance.defId);
  if (!def) return null;
  const occ = buildOccupancy(circuit, instance.boardId, options.ignoreId ?? instance.id);
  let fallback: ComponentInstance | null = null;
  for (const [dx, dy] of searchOffsets(options.radius ?? 2)) {
    const candidate: ComponentInstance = { ...instance, anchor: { x: instance.anchor.x + dx, y: instance.anchor.y + dy } };
    const check = checkPlacementWith(occ, candidate, def);
    if (check.clean) return candidate;
    if (check.ok && !fallback) fallback = candidate;
  }
  return fallback;
}

/** 元件所有腳與本體格點外框的中心（格點座標，可為 .5）。 */
export function footprintCenter(instance: ComponentInstance, def: ComponentDefinition): Point {
  const fp = resolveFootprint(instance, def);
  const cells = [...fp.pins.map((p) => p.point), ...fp.blocked];
  const xs = cells.map((p) => p.x);
  const ys = cells.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function roundCell(v: number): number {
  const r = Math.round(v);
  return r === 0 ? 0 : r; // 避免 -0
}

/** 讓元件的中心落在 (cx, cy) 時，anchor（腳 1）應該在哪個格點。 */
export function centeredAnchor(
  def: ComponentDefinition,
  rotation: Rotation,
  span: number | undefined,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const probe: ComponentInstance = { id: '?', defId: def.id, boardId: '?', anchor: { x: 0, y: 0 }, rotation, props: {} };
  if (span !== undefined) probe.span = span;
  const center = footprintCenter(probe, def);
  return { x: roundCell(cx - center.x), y: roundCell(cy - center.y) };
}

/**
 * 以元件中心為軸順時針旋轉，依序嘗試 +90°、+180°、+270°，回傳第一個能吸附到合法位置的結果。
 * 例如 DIP IC 轉 90° 一定放不下，會直接翻轉 180°。全部不行時回傳 null。
 */
export function rotatedPlacement(circuit: Circuit, instance: ComponentInstance): ComponentInstance | null {
  const def = getComponentDefinition(instance.defId);
  if (!def) return null;
  const center = footprintCenter(instance, def);
  for (const delta of [90, 180, 270]) {
    const rotation = ((instance.rotation + delta) % 360) as Rotation;
    const anchor = centeredAnchor(def, rotation, instance.span, center.x, center.y);
    const placed = findPlacement(circuit, { ...instance, rotation, anchor }, { ignoreId: instance.id });
    if (placed) return placed;
  }
  return null;
}
