import type { BoardLayout, Breadboard, BreadboardGroup, BreadboardNode, LayoutRow, NodeKind } from '../../types/board';

export function buildBoard(layout: BoardLayout, boardId: string): Breadboard {
  const nodes: BreadboardNode[] = [];
  const groups: Record<string, BreadboardGroup> = {};
  const rowByY = new Map<number, LayoutRow>(layout.rows.map((row) => [row.y, row]));

  for (let y = 1; y <= layout.height; y++) {
    const row: LayoutRow = rowByY.get(y) ?? { y, kind: 'surface' };
    for (let x = 1; x <= layout.width; x++) {
      let kind: NodeKind = 'surface';
      let name: string | null = null;
      let groupId: string | null = null;
      if (row.kind === 'terminal') {
        kind = 'hole';
        name = `${row.label}${x}`;
        groupId = `${boardId}:c${x}-${row.half}`;
      } else if (row.kind === 'rail' && row.holeColumns.includes(x)) {
        kind = 'hole';
        name = `${row.label}${x}`;
        groupId = `${boardId}:rail-${row.label}`;
      }
      const id = `${boardId}:${x},${y}`;
      nodes.push({ id, boardId, x, y, kind, name, groupId });
      if (groupId) {
        const group = (groups[groupId] ??= {
          id: groupId,
          boardId,
          kind: row.kind === 'rail' ? 'rail' : 'terminal',
          nodeIds: [],
        });
        group.nodeIds.push(id);
      }
    }
  }

  return { id: boardId, layoutId: layout.id, width: layout.width, height: layout.height, nodes, groups };
}
