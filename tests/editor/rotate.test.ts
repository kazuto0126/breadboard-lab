import { describe, expect, it } from 'vitest';
import { rotateComponent } from '../../src/editor/commands';
import { librarySections } from '../../src/editor/library';
import { newLabFile, placePart } from '../../src/mcp/tools';

/** 子專案 56：一直按 R，轉回原本的方向時要在原本的位置（2 腳元件的中心在兩個孔中間，以前每轉一次往同一邊偏一格）。 */
describe('rotating a part four times', () => {
  for (const layout of ['MB102', 'EIC1106'] as const)
    it(`brings every part back where it was on ${layout}`, () => {
      const drifted: string[] = [];
      for (const item of librarySections().flatMap((s) => s.items)) {
        const placed = placePart(newLabFile('x', layout), { part: item.key });
        if (placed.error || !placed.file) throw new Error(placed.text);
        let c = placed.file.circuit;
        const start = c.components[0];
        // 放不下的方向會跳過，所以轉 2–4 次就回到原本的方向；那時位置也要一樣。
        let end = start;
        for (let k = 0; k < 4; k++) {
          c = rotateComponent(c, start.id) ?? c;
          end = c.components[0];
          if (end.rotation === start.rotation) break;
        }
        if (end.rotation !== start.rotation || end.anchor.x !== start.anchor.x || end.anchor.y !== start.anchor.y) drifted.push(`${item.key}: ${start.rotation}@${start.anchor.x},${start.anchor.y} → ${end.rotation}@${end.anchor.x},${end.anchor.y}`);
      }
      expect(drifted).toEqual([]);
    });
});
