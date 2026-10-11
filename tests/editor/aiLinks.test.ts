import { describe, expect, it } from 'vitest';
import { linkify, type AiLink } from '../../src/editor/aiLinks';
import { board, circuit, comp, hole, holeOn } from '../fixtures/build';

const links = (c: Parameters<typeof linkify>[0], text: string) => linkify(c, text).filter((s): s is AiLink => typeof s !== 'string');
const one = () => circuit([comp('U1', '74LS00', 'F10'), comp('D1', 'led', 'A30')]);

describe('linkify', () => {
  it('turns hole names into links and keeps the rest as text', () => {
    const parts = linkify(one(), '從 A10 拉到 T+10，再接 B−30。');
    expect(parts).toEqual(['從 ', { text: 'A10', points: [hole('A10')] }, ' 拉到 ', { text: 'T+10', points: [hole('T+10')] }, '，再接 ', { text: 'B−30', points: [hole('B-30')] }, '。']);
  });

  it('turns pin references into links to the pin hole', () => {
    const c = one();
    expect(links(c, 'U1 第 14 腳、U1的第3腳、U1 pin 7').map((l) => [l.text, l.points])).toEqual([
      ['U1 第 14 腳', [hole('E10')]],
      ['U1的第3腳', [hole('F12')]],
      ['U1 pin 7', [hole('F16')]],
    ]);
  });

  it('ignores part numbers, glued letters, unknown holes, unknown pins and component ids', () => {
    expect(links(one(), '74LS00、A10B、ABC10、Z99、A99、U9 第 1 腳、U1 第 20 腳、D1 亮了')).toEqual([]);
  });

  it('needs a board prefix when several boards have the hole', () => {
    const c = circuit([], [], [board('b1'), board('b2', 0, 20)]);
    expect(links(c, 'A10')).toEqual([]);
    expect(links(c, 'b2:A12')).toEqual([{ text: 'b2:A12', points: [holeOn('b2', 'A12')] }]);
  });

  it('finds EIC-1106 holes and binding posts only when the board has them', () => {
    const eic = circuit([], [], [board('b1', 0, 0, 'EIC1106')]);
    expect(links(eic, '從紅柱拉到 P3+12，再到 2-F30；黑色接線柱接 P4-5').map((l) => [l.text, l.points])).toEqual([
      ['紅柱', [holeOn('b1', '紅', 'EIC1106')]],
      ['P3+12', [holeOn('b1', 'P3+12', 'EIC1106')]],
      ['2-F30', [holeOn('b1', '2-F30', 'EIC1106')]],
      ['黑色接線柱', [holeOn('b1', '黑', 'EIC1106')]],
      ['P4-5', [holeOn('b1', 'P4-5', 'EIC1106')]],
    ]);
    expect(links(eic, '紅色 LED')).toEqual([]);
    expect(links(one(), '紅柱')).toEqual([]);
  });
});
