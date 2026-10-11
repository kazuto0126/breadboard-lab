import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import {
  addBoard,
  boardGroups,
  boardRects,
  crossBoardWires,
  detachBoard,
  groupMembers,
  MAX_BOARDS,
  mmFromUnits,
  moveBoards,
  normalizeBoardGroups,
  rectsOverlap,
  removeBoard,
  snapBoardMove,
  snapUnits,
} from '../../src/editor/boards';
import { addWire, moveComponent } from '../../src/editor/commands';
import { straightWireProblem } from '../../src/editor/manualWire';
import type { Circuit } from '../../src/types/circuit';
import { board, circuit, comp, holeOn, latticeWire } from '../fixtures/build';

/** 吸附距離：縮放 1 時 24 px = 1.2 格。 */
const SNAP = snapUnits(1);

const rectOf = (c: Circuit, id: string) => boardRects(c).find((r) => r.id === id)!;
const groupsOf = (c: Circuit) => boardGroups(c).map((g) => g.boardIds);

/** 照使用者拖曳的方式移動：先算吸附，再套用。 */
function drag(c: Circuit, ids: string[], dx: number, dy: number): Circuit {
  const plan = snapBoardMove(c, ids, dx, dy, SNAP);
  expect(plan.blocked).toBeNull();
  return moveBoards(c, ids, plan.dx, plan.dy);
}

/** 兩塊板分開放（b2 在 b1 下方隔 4 格），和 addBoard 的結果相同。 */
function twoBoards(): Circuit {
  const added = addBoard(circuit([comp('D1', 'led', 'C10')]));
  expect(added?.id).toBe('b2');
  return added!.circuit;
}

describe('需求文件 38.19：多塊麵包板的吸附與群組', () => {
  it('#1 新增兩塊板，可以自由拖曳', () => {
    const c = twoBoards();
    expect(c.boards.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(rectOf(c, 'b2')).toEqual({ id: 'b2', x: 0, y: 24, width: 65, height: 20 });
    expect(boardGroups(c)).toEqual([]);
    const moved = moveBoards(c, ['b2'], 30, 7);
    expect(rectOf(moved, 'b2')).toMatchObject({ x: 30, y: 31 });
    expect(moved.boards[1]).toMatchObject({ x: mmFromUnits(30), y: mmFromUnits(31), groupId: null });
    // 元件用板內座標記錄，跟著板子走。
    const withPart = moveBoards(c, ['b1'], -5, -3);
    expect(withPart.components).toBe(c.components);
    expect(rectOf(withPart, 'b1')).toMatchObject({ x: -5, y: -3 });
  });

  it('#2 靠近到吸附距離時自動吸附並完全對齊', () => {
    const c = twoBoards();
    // b2 原本在 (0, 24)；拖到 b1 正下方附近（差 0.8 格、左右偏 3.4 格）。
    const below = snapBoardMove(c, ['b2'], 3.4, -4.8, SNAP);
    expect(below).toEqual({ dx: 0, dy: -4, snap: { movingId: 'b2', targetId: 'b1', side: 'bottom' }, blocked: null });
    // 從右邊靠近 b1 的短邊。
    const right = snapBoardMove(c, ['b2'], 65.9, -26.5, SNAP);
    expect(right).toMatchObject({ dx: 65, dy: -24, snap: { side: 'right' } });
    // 還差 2 格：不吸附，只對齊格點。
    expect(snapBoardMove(c, ['b2'], 0.4, -2.2, SNAP)).toEqual({ dx: 0, dy: -2, snap: null, blocked: null });
    // 縮小畫面時同樣 24 px 代表更多格。
    expect(snapBoardMove(c, ['b2'], 0, -2.2, snapUnits(0.5)).snap?.side).toBe('bottom');
    // 長邊重疊不到一半：不吸附。
    expect(snapBoardMove(c, ['b2'], 40, -4, SNAP).snap).toBeNull();
    // 稍微壓到 b1 也會被推回貼齊的位置。
    expect(snapBoardMove(c, ['b2'], 0, -4.6, SNAP)).toMatchObject({ dx: 0, dy: -4, blocked: null });
    // 直接疊在 b1 上：不能放。
    expect(snapBoardMove(c, ['b2'], 2, -20, SNAP)).toMatchObject({ snap: null, blocked: 'overlap' });
  });

  it('#3 吸附後 A + B 自動成為同一個 Board Group', () => {
    const c = drag(twoBoards(), ['b2'], 1, -4.5);
    expect(boardGroups(c)).toEqual([{ id: 'g-b1', boardIds: ['b1', 'b2'], x: 0, y: 0, width: 65, height: 40, rotation: 0 }]);
    expect(c.boards.map((b) => b.groupId)).toEqual(['g-b1', 'g-b1']);
  });

  it('#4 拖曳 A，A + B 一起移動', () => {
    const c = drag(twoBoards(), ['b2'], 0, -4);
    const members = groupMembers(c, 'b1');
    expect(members).toEqual(['b1', 'b2']);
    const moved = drag(c, members, 12, 6);
    expect([rectOf(moved, 'b1'), rectOf(moved, 'b2')].map((r) => [r.x, r.y])).toEqual([
      [12, 6],
      [12, 26],
    ]);
    expect(groupsOf(moved)).toEqual([['b1', 'b2']]);
  });

  it('#5 把 B 拉離 A，群組自動解除', () => {
    const c = drag(twoBoards(), ['b2'], 0, -4);
    // 拉開但還在吸附距離內：吸回原位，仍是同一組。
    expect(snapBoardMove(c, ['b2'], 0, 1, SNAP)).toMatchObject({ dx: 0, dy: 0 });
    const apart = drag(c, ['b2'], 20, 9);
    expect(boardGroups(apart)).toEqual([]);
    expect(apart.boards.map((b) => b.groupId)).toEqual([null, null]);
  });

  it('#6 C 靠近 B：B + C 成為群組；B 已經和 A 同組時 A + B + C 合併', () => {
    const ab = drag(twoBoards(), ['b2'], 0, -4); // b1 (0,0)、b2 (0,20)
    const added = addBoard(ab)!; // b3 在 (0, 44)
    expect(added.id).toBe('b3');
    const abc = drag(added.circuit, ['b3'], 65.5, -24.3); // 貼到 b2 右邊
    expect(rectOf(abc, 'b3')).toMatchObject({ x: 65, y: 20 });
    expect(groupsOf(abc)).toEqual([['b1', 'b2', 'b3']]);

    // 兩個群組合併：{b1, b2} 與 {b3, b4} 貼在一起。
    let c = circuit([], [], [board('b1'), board('b2', 0, 20), board('b3', 100, 0), board('b4', 165, 0)]);
    c = normalizeBoardGroups(c);
    expect(groupsOf(c)).toEqual([
      ['b1', 'b2'],
      ['b3', 'b4'],
    ]);
    const merged = drag(c, groupMembers(c, 'b4'), -34.2, 0.6);
    expect(groupsOf(merged)).toEqual([['b1', 'b2', 'b3', 'b4']]);
    expect(merged.boards.every((b) => b.groupId === 'g-b1')).toBe(true);
  });
});

describe('board editing', () => {
  it('never lets boards overlap and keeps everything on the 0.1" grid', () => {
    const c = twoBoards();
    expect(rectsOverlap(rectOf(c, 'b1'), rectOf(c, 'b2'))).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, width: 65, height: 20 }, { x: 0, y: 20, width: 65, height: 20 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, width: 65, height: 20 }, { x: 64, y: 19, width: 65, height: 20 })).toBe(true);
    const odd = normalizeBoardGroups(circuit([], [], [{ id: 'b1', layoutId: 'MB102', x: 1.3, y: -1.2, groupId: 'stale' }]));
    expect(odd.boards[0]).toEqual({ id: 'b1', layoutId: 'MB102', x: 2.54, y: 0, groupId: null });
    expect(normalizeBoardGroups(odd)).toBe(odd);
  });

  it('adds up to MAX_BOARDS boards', () => {
    let c = circuit([]);
    for (let i = 2; i <= MAX_BOARDS; i++) c = addBoard(c)!.circuit;
    expect(c.boards).toHaveLength(MAX_BOARDS);
    expect(addBoard(c)).toBeNull();
  });

  it('removes a board together with its parts and wires', () => {
    const stacked = [board('b1'), board('b2', 0, 20)];
    const c = circuit(
      [comp('D1', 'led', 'H11'), comp('D2', 'led', 'C12', { board: 'b2' })],
      [latticeWire(stacked, 'w1', holeOn('b1', 'J12'), holeOn('b2', 'A12')), latticeWire(stacked, 'w2', holeOn('b1', 'A1'), holeOn('b1', 'A5'))],
      stacked,
    );
    const next = removeBoard(c, 'b2')!;
    expect(next.boards.map((b) => [b.id, b.groupId])).toEqual([['b1', null]]);
    expect(next.components.map((x) => x.id)).toEqual(['D1']);
    expect(next.wires.map((w) => w.id)).toEqual(['w2']);
    expect(removeBoard(next, 'b1')).toBeNull();
    expect(removeBoard(c, 'b9')).toBeNull();
  });

  it('detaches a board from its group unless wires cross to the rest of the group', () => {
    const c = normalizeBoardGroups(circuit([], [], [board('b1'), board('b2', 0, 20), board('b3', 0, 40)]));
    const top = detachBoard(c, 'b1')!;
    expect(rectOf(top, 'b1')).toMatchObject({ x: 0, y: -2 });
    expect(groupsOf(top)).toEqual([['b2', 'b3']]);
    const middle = detachBoard(c, 'b2')!;
    expect(groupsOf(middle)).toEqual([]);
    for (const other of ['b1', 'b3']) expect(rectsOverlap(rectOf(middle, 'b2'), rectOf(middle, other))).toBe(false);
    expect(detachBoard(middle, 'b2')).toBeNull(); // 已經不在群組裡

    const wired = { ...c, wires: [latticeWire(c.boards, 'w1', holeOn('b1', 'J12'), holeOn('b2', 'A12'))] };
    expect(crossBoardWires(wired, ['b2']).map((w) => w.id)).toEqual(['w1']);
    expect(crossBoardWires(wired, ['b1', 'b2', 'b3'])).toEqual([]);
    expect(detachBoard(wired, 'b2')).toBeNull();
    expect(detachBoard(wired, 'b3')).not.toBeNull();
    // 只拖其中一塊也不行；整組一起拖沒問題。
    expect(snapBoardMove(wired, ['b2'], 70, 0, SNAP).blocked).toBe('wires');
    expect(snapBoardMove(wired, ['b1', 'b2', 'b3'], 70, 0, SNAP).blocked).toBeNull();
  });

  it('moves a component to another board', () => {
    const c = twoBoards();
    const moved = moveComponent(c, 'D1', { x: 20, y: 4 }, undefined, 'b2');
    expect(moved.components[0]).toMatchObject({ boardId: 'b2', anchor: { x: 20, y: 4 } });
    expect(moveComponent(c, 'D1', { x: 20, y: 4 }).components[0].boardId).toBe('b1');
  });
});

describe('manual wires across a board group', () => {
  const stacked = normalizeBoardGroups(circuit([comp('D1', 'led', 'H11'), comp('D2', 'led', 'C12', { board: 'b2' })], [], [board('b1'), board('b2', 0, 20)]));

  it('draws a straight wire from one board to the other across the seam', () => {
    const c = addWire(stacked, holeOn('b1', 'J12'), holeOn('b2', 'A12'), '#1565c0').circuit;
    expect(new Set(c.wires[0].path.map((p) => p.boardId))).toEqual(new Set(['b1', 'b2']));
    expect(straightWireProblem(stacked, holeOn('b1', 'J12'), holeOn('b2', 'A12'))).toBeNull();
    const codes = validateCircuit(c).map((e) => e.code);
    for (const code of ['WIRE_PATH_INVALID', 'WIRE_ENDPOINT_INVALID', 'WIRE_THROUGH_OBSTACLE']) expect(codes).not.toContain(code);
  });

  it('cannot wire boards that are not grouped', () => {
    const apart = moveBoards(stacked, ['b2'], 0, 10);
    const codes = validateCircuit(addWire(apart, holeOn('b1', 'J12'), holeOn('b2', 'A12'), '#1565c0').circuit).map((e) => e.code);
    expect(codes).toContain('WIRE_PATH_INVALID');
  });
});
