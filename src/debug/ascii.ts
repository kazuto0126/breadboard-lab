import { getNode, nodeIdOf } from '../core/breadboard/naming';
import { indexCircuit } from '../core/circuit/circuitIndex';
import { stepDirection } from '../core/circuit/wireGeometry';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentCategory } from '../types/component';
import type { Direction, GridPoint } from '../types/geometry';

const PIN_CHAR: Record<ComponentCategory, string> = {
  ic: 'U',
  resistor: 'R',
  led: 'D',
  vcc: '+',
  gnd: '-',
  'dc-power': 'P',
  'dip-switch': 'S',
  pushbutton: 'B',
};

const LINE_CHAR: Record<string, string> = { EW: '─', NS: '│', ES: '┌', SW: '┐', EN: '└', NW: '┘', ENSW: '┼' };

/**
 * 把第一塊板畫成文字：· 空孔、# 元件本體、字母 = 元件腳、o 導線端點、線條 = 導線、┼ 交叉、* 重疊。
 * 只用於終端機預覽與除錯。
 */
export function renderAscii(circuit: Circuit, wires: Wire[] = circuit.wires): string {
  const index = indexCircuit(circuit);
  const board = circuit.boards[0] ? index.boards.get(circuit.boards[0].id) : undefined;
  if (!board) return '';
  const grid: string[] = board.nodes.map((n) => (n.kind === 'hole' ? '·' : ' '));
  const put = (p: GridPoint, ch: string) => {
    if (p.boardId === board.id && getNode(board, p.x, p.y)) grid[(p.y - 1) * board.width + (p.x - 1)] = ch;
  };

  for (const pc of index.placed) for (const cell of pc.footprint.blocked) put(cell, '#');

  const dirs = new Map<string, Set<Direction>>();
  const uses = new Map<string, number>();
  const ends = new Set<string>();
  for (const w of wires) {
    w.path.forEach((p, i) => {
      const id = nodeIdOf(p);
      uses.set(id, (uses.get(id) ?? 0) + 1);
      if (i === 0 || i === w.path.length - 1) ends.add(id);
      const set = dirs.get(id) ?? new Set<Direction>();
      const prev = i > 0 ? stepDirection(p, w.path[i - 1]) : null;
      const next = i < w.path.length - 1 ? stepDirection(p, w.path[i + 1]) : null;
      if (prev) set.add(prev);
      if (next) set.add(next);
      dirs.set(id, set);
    });
  }
  for (const w of wires) {
    for (const p of w.path) {
      const id = nodeIdOf(p);
      const count = uses.get(id)!;
      const key = (['E', 'N', 'S', 'W'] as Direction[]).filter((d) => dirs.get(id)!.has(d)).join('');
      let ch: string;
      if (ends.has(id)) ch = count > 1 ? '*' : 'o';
      else if (count > 2 || (count === 2 && key !== 'ENSW')) ch = '*';
      else ch = LINE_CHAR[key] ?? '*';
      put(p, ch);
    }
  }
  for (const pc of index.placed) for (const pin of pc.footprint.pins) put(pin.point, PIN_CHAR[pc.def.category]);

  const rowLabel = (y: number) => (board.nodes.find((n) => n.y === y && n.name !== null)?.name ?? '').replace(/\d+$/, '').padEnd(3);
  const columns = Array.from({ length: board.width }, (_, i) => i + 1);
  const lines = [
    '   ' + columns.map((c) => (c % 10 === 0 ? String((c / 10) % 10) : ' ')).join(''),
    '   ' + columns.map((c) => String(c % 10)).join(''),
  ];
  for (let y = 1; y <= board.height; y++) {
    lines.push(rowLabel(y) + grid.slice((y - 1) * board.width, y * board.width).join(''));
  }
  return lines.join('\n');
}
