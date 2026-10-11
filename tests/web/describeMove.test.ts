import { describe, expect, it } from 'vitest';
import { describeMove } from '../../src/components/common/describe';
import { board } from '../fixtures/build';

const at = (boardId: string, x: number, y: number, rotation: 0 | 180 = 0) => ({ boardId, anchor: { x, y }, rotation });

describe('describeMove', () => {
  it('names the pin-1 hole before and after', () => {
    expect(describeMove({ boards: [board('b1')] }, { componentId: 'U1', from: at('b1', 45, 11), to: at('b1', 20, 11) })).toBe('U1：F45 → F20');
  });

  it('says when the IC was turned around', () => {
    expect(describeMove({ boards: [board('b1')] }, { componentId: 'U1', from: at('b1', 10, 11), to: at('b1', 16, 8, 180) })).toBe('U1：F10 → E16（轉 180 度）');
    expect(describeMove({ boards: [board('b1')] }, { componentId: 'U1', from: at('b1', 16, 8, 180), to: at('b1', 30, 11) })).toBe('U1：E16 → F30（轉 180 度）');
  });

  it('adds the board when there are several', () => {
    const boards = [board('b1'), board('b2', 0, 20)];
    expect(describeMove({ boards }, { componentId: 'U1', from: at('b1', 10, 11), to: at('b2', 25, 11) })).toBe('U1：b1:F10 → b2:F25');
  });
});
